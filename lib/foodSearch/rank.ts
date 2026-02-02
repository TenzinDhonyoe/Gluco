/**
 * Ranking and deduplication utilities for food search results
 * Enhanced with brand/category matching, supplement penalty, and debug logging
 */

import { NormalizedFood } from '@/lib/supabase';
import { levenshteinDistance, normalizeQuery, tokenize } from './normalize';

// Scoring weights - TUNABLE
const SCORE_WEIGHTS = {
    // Match type bonuses
    EXACT_MATCH: 100,           // Full phrase match
    CONTAINS_QUERY: 70,         // Name contains full query
    TOKEN_OVERLAP: 20,          // Per matched token
    PREFIX_MATCH: 30,           // Name starts with query
    TOKEN_PREFIX: 8,            // Query token is prefix of name token

    // Brand/category matching
    BRAND_TOKEN_MATCH: 12,      // Query token found in brand
    CATEGORY_TOKEN_MATCH: 8,    // Query token found in categories

    // Nutrient availability
    HAS_CALORIES: 8,
    HAS_CARBS: 5,
    HAS_PROTEIN: 5,
    HAS_FAT: 3,
    HAS_FIBRE: 5,
    COMPLETE_MACROS: 10,        // Has all 4 main macros

    // Name quality
    SHORT_NAME_BONUS: 12,       // < 25 chars
    MEDIUM_NAME: 0,             // 25-50 chars
    LONG_NAME_PENALTY: -12,     // 50-80 chars
    VERY_LONG_PENALTY: -25,     // > 80 chars

    // Penalties
    SUPPLEMENT_PENALTY: -40,    // Looks like a supplement, not food
    INGREDIENT_PENALTY: -20,    // Looks like raw ingredient list

    // Multi-token query adjustments (only for 2+ token queries)
    ALL_TOKENS_MATCH: 35,       // Bonus when every query token appears in result name
    PARTIAL_MATCH_PENALTY: -15, // Per missing token in multi-word query
    RAW_COMMODITY_PENALTY: -25, // USDA raw ingredient patterns ("Fat, X", "Butter, salted")

    // Provider preference
    HAS_BRAND: 5,               // Branded items often more relevant

    // Fuzzy matching
    FUZZY_MATCH_BASE: 15,
    FUZZY_DISTANCE_PENALTY: -5, // Per edit distance
};

// Patterns that suggest supplements/irrelevant items
const SUPPLEMENT_PATTERNS = [
    /\bsupplement\b/i,
    /\bcapsule[s]?\b/i,
    /\btablet[s]?\b/i,
    /\bvitamin[s]?\b/i,
    /\bpowder\b.*\b(protein|whey|casein)\b/i,
    /\b(dietary|nutritional)\s+supplement\b/i,
    /\bmg\s*\/\s*serving\b/i,
    /\b\d+\s*mg\s+(of\s+)?[A-Z]/,
];

// Patterns suggesting raw ingredient lists
const INGREDIENT_PATTERNS = [
    /ingredients?:/i,
    /contains?:/i,
    /\([^)]{100,}\)/,  // Very long parenthetical (ingredient list)
];

// Patterns suggesting USDA raw commodities (e.g., "Fat, chicken", "Butter, salted")
// Only applied when user query has 2+ tokens to avoid penalizing single-word searches
const RAW_COMMODITY_PATTERNS = [
    /^fat[,\s]/i,                       // "Fat, chicken"
    /^oil[,\s]/i,                       // "Oil, olive"
    /,\s*(salted|unsalted|raw|dried|fresh|frozen|canned)\s*$/i,
    /^(shortening|lard|tallow|suet)[,\s]/i,
    /^(spice|herb|seed|flour|starch)[,\s]/i,
];

export interface ScoredResult {
    food: NormalizedFood;
    score: number;
    matchType: 'exact' | 'contains' | 'token' | 'prefix' | 'fuzzy' | 'none';
    scoreBreakdown?: Record<string, number>; // For debugging
}

// Dev logging flag - check for __DEV__ or fallback
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

/**
 * Score a single search result based on query relevance
 */
export function scoreResult(food: NormalizedFood, query: string): ScoredResult {
    const normalizedQuery = normalizeQuery(query);
    const normalizedName = normalizeQuery(food.display_name);
    const queryTokens = tokenize(query);
    const nameTokens = tokenize(food.display_name);
    const brandTokens = food.brand ? tokenize(food.brand) : [];
    const categoryTokens = (food as any).categories ? tokenize((food as any).categories) : [];

    let score = 0;
    let matchType: ScoredResult['matchType'] = 'none';
    const breakdown: Record<string, number> = {};

    // 1. Exact phrase match (highest priority)
    if (normalizedName === normalizedQuery) {
        score += SCORE_WEIGHTS.EXACT_MATCH;
        breakdown['exact_match'] = SCORE_WEIGHTS.EXACT_MATCH;
        matchType = 'exact';
    } else if (normalizedName.includes(normalizedQuery)) {
        score += SCORE_WEIGHTS.CONTAINS_QUERY;
        breakdown['contains_query'] = SCORE_WEIGHTS.CONTAINS_QUERY;
        matchType = 'contains';
    }

    // 2. Token overlap scoring (strongest signal)
    let tokenOverlapScore = 0;
    const matchedTokens = queryTokens.filter(qt =>
        nameTokens.some(nt => nt === qt)
    );
    if (matchedTokens.length > 0) {
        tokenOverlapScore = matchedTokens.length * SCORE_WEIGHTS.TOKEN_OVERLAP;
        score += tokenOverlapScore;
        breakdown['token_overlap'] = tokenOverlapScore;
        if (matchType === 'none') matchType = 'token';
    }

    // 3. Prefix match (name starts with query)
    if (normalizedName.startsWith(normalizedQuery)) {
        score += SCORE_WEIGHTS.PREFIX_MATCH;
        breakdown['prefix_match'] = SCORE_WEIGHTS.PREFIX_MATCH;
        if (matchType === 'none') matchType = 'prefix';
    }

    // 4. Token prefix matching
    let tokenPrefixScore = 0;
    queryTokens.forEach(qt => {
        if (nameTokens.some(nt => nt.startsWith(qt) && nt !== qt)) {
            tokenPrefixScore += SCORE_WEIGHTS.TOKEN_PREFIX;
        }
    });
    if (tokenPrefixScore > 0) {
        score += tokenPrefixScore;
        breakdown['token_prefix'] = tokenPrefixScore;
    }

    // 5. Brand token matching
    let brandScore = 0;
    queryTokens.forEach(qt => {
        if (brandTokens.some(bt => bt === qt || bt.includes(qt))) {
            brandScore += SCORE_WEIGHTS.BRAND_TOKEN_MATCH;
        }
    });
    if (brandScore > 0) {
        score += brandScore;
        breakdown['brand_match'] = brandScore;
    }

    // 6. Category token matching
    let categoryScore = 0;
    queryTokens.forEach(qt => {
        if (categoryTokens.some(ct => ct === qt || ct.includes(qt))) {
            categoryScore += SCORE_WEIGHTS.CATEGORY_TOKEN_MATCH;
        }
    });
    if (categoryScore > 0) {
        score += categoryScore;
        breakdown['category_match'] = categoryScore;
    }

    // 7. Fuzzy matching as fallback
    if (matchType === 'none') {
        const distance = levenshteinDistance(
            normalizedQuery,
            normalizedName.slice(0, normalizedQuery.length + 5)
        );
        if (distance <= 3) {
            const fuzzyScore = SCORE_WEIGHTS.FUZZY_MATCH_BASE + (SCORE_WEIGHTS.FUZZY_DISTANCE_PENALTY * distance);
            score += fuzzyScore;
            breakdown['fuzzy_match'] = fuzzyScore;
            matchType = 'fuzzy';
        }
    }

    // 8. Name length scoring
    const nameLength = food.display_name.length;
    let lengthScore = 0;
    if (nameLength < 25) {
        lengthScore = SCORE_WEIGHTS.SHORT_NAME_BONUS;
    } else if (nameLength < 50) {
        lengthScore = SCORE_WEIGHTS.MEDIUM_NAME;
    } else if (nameLength < 80) {
        lengthScore = SCORE_WEIGHTS.LONG_NAME_PENALTY;
    } else {
        lengthScore = SCORE_WEIGHTS.VERY_LONG_PENALTY;
    }
    score += lengthScore;
    if (lengthScore !== 0) breakdown['name_length'] = lengthScore;

    // 9. Nutrient data availability
    let nutrientScore = 0;
    let macroCount = 0;

    if (food.calories_kcal !== null) {
        nutrientScore += SCORE_WEIGHTS.HAS_CALORIES;
        macroCount++;
    }
    if (food.carbs_g !== null) {
        nutrientScore += SCORE_WEIGHTS.HAS_CARBS;
        macroCount++;
    }
    if (food.protein_g !== null) {
        nutrientScore += SCORE_WEIGHTS.HAS_PROTEIN;
        macroCount++;
    }
    if (food.fat_g !== null) {
        nutrientScore += SCORE_WEIGHTS.HAS_FAT;
        macroCount++;
    }
    if (food.fibre_g !== null) {
        nutrientScore += SCORE_WEIGHTS.HAS_FIBRE;
    }
    if (macroCount >= 4) {
        nutrientScore += SCORE_WEIGHTS.COMPLETE_MACROS;
    }
    if (nutrientScore > 0) {
        score += nutrientScore;
        breakdown['nutrients'] = nutrientScore;
    }

    // 10. Brand bonus
    if (food.brand) {
        score += SCORE_WEIGHTS.HAS_BRAND;
        breakdown['has_brand'] = SCORE_WEIGHTS.HAS_BRAND;
    }

    // 11. Supplement penalty
    const isSupplement = SUPPLEMENT_PATTERNS.some(pattern =>
        pattern.test(food.display_name)
    );
    if (isSupplement) {
        score += SCORE_WEIGHTS.SUPPLEMENT_PENALTY;
        breakdown['supplement_penalty'] = SCORE_WEIGHTS.SUPPLEMENT_PENALTY;
    }

    // 12. Ingredient list penalty
    const isIngredientList = INGREDIENT_PATTERNS.some(pattern =>
        pattern.test(food.display_name)
    );
    if (isIngredientList) {
        score += SCORE_WEIGHTS.INGREDIENT_PENALTY;
        breakdown['ingredient_penalty'] = SCORE_WEIGHTS.INGREDIENT_PENALTY;
    }

    // 13. Multi-token query adjustments (only for 2+ token queries)
    if (queryTokens.length >= 2) {
        const missingTokens = queryTokens.length - matchedTokens.length;

        // Bonus when all query tokens appear in result name
        if (missingTokens === 0) {
            score += SCORE_WEIGHTS.ALL_TOKENS_MATCH;
            breakdown['all_tokens_match'] = SCORE_WEIGHTS.ALL_TOKENS_MATCH;
        }

        // Penalty per missing token
        if (missingTokens > 0) {
            const penalty = missingTokens * SCORE_WEIGHTS.PARTIAL_MATCH_PENALTY;
            score += penalty;
            breakdown['partial_match_penalty'] = penalty;
        }

        // Raw commodity penalty for USDA-style ingredient names
        const isRawCommodity = RAW_COMMODITY_PATTERNS.some(pattern =>
            pattern.test(food.display_name)
        );
        if (isRawCommodity) {
            score += SCORE_WEIGHTS.RAW_COMMODITY_PENALTY;
            breakdown['raw_commodity_penalty'] = SCORE_WEIGHTS.RAW_COMMODITY_PENALTY;
        }
    }

    return {
        food,
        score,
        matchType,
        scoreBreakdown: IS_DEV ? breakdown : undefined,
    };
}

/**
 * Generate a deduplication key for a food item
 * Uses normalized name + brand for uniqueness
 */
function getDedupeKey(food: NormalizedFood): string {
    const normalizedName = normalizeQuery(food.display_name);
    const normalizedBrand = food.brand ? normalizeQuery(food.brand) : '';

    // For near-duplicates, also consider first few tokens only
    const nameTokens = tokenize(food.display_name).slice(0, 4).join(' ');

    return `${nameTokens}|${normalizedBrand}`;
}

/**
 * Check if two foods are similar enough to be duplicates
 */
function areSimilarFoods(a: NormalizedFood, b: NormalizedFood): boolean {
    const nameA = normalizeQuery(a.display_name);
    const nameB = normalizeQuery(b.display_name);

    // Same normalized name
    if (nameA === nameB) return true;

    // One contains the other
    if (nameA.includes(nameB) || nameB.includes(nameA)) {
        // Check if macros are similar (within 10%)
        const calsA = a.calories_kcal || 0;
        const calsB = b.calories_kcal || 0;
        if (calsA > 0 && calsB > 0) {
            const diff = Math.abs(calsA - calsB) / Math.max(calsA, calsB);
            if (diff < 0.15) return true;
        }
    }

    return false;
}

/**
 * Deduplicate results across providers
 * Keeps the higher-scoring item when duplicates are found
 */
export function dedupeResults(results: ScoredResult[]): ScoredResult[] {
    const seen = new Map<string, ScoredResult>();
    const deduped: ScoredResult[] = [];

    for (const result of results) {
        const key = getDedupeKey(result.food);
        const existing = seen.get(key);

        if (!existing) {
            // Check for similar foods in already seen items
            let foundSimilar = false;
            for (const [existingKey, existingResult] of seen.entries()) {
                if (areSimilarFoods(result.food, existingResult.food)) {
                    // Keep higher scoring one
                    if (result.score > existingResult.score) {
                        seen.delete(existingKey);
                        seen.set(key, result);
                    }
                    foundSimilar = true;
                    break;
                }
            }

            if (!foundSimilar) {
                seen.set(key, result);
            }
        } else if (result.score > existing.score) {
            seen.set(key, result);
        }
    }

    return Array.from(seen.values());
}

/**
 * Sort results by score (descending) with stable ordering
 */
export function sortByScore(results: ScoredResult[]): ScoredResult[] {
    return [...results].sort((a, b) => {
        // Primary: score descending
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        // Secondary: shorter names first
        if (a.food.display_name.length !== b.food.display_name.length) {
            return a.food.display_name.length - b.food.display_name.length;
        }
        // Tertiary: alphabetical for stability
        return a.food.display_name.localeCompare(b.food.display_name);
    });
}

/**
 * Process and rank search results
 * @param results Raw results from providers
 * @param query Original search query
 * @returns Deduplicated, scored, and sorted results
 */
export function rankResults(results: NormalizedFood[], query: string): NormalizedFood[] {
    // Score each result
    const scored = results.map(food => scoreResult(food, query));

    // Deduplicate
    const deduped = dedupeResults(scored);

    // Sort by score
    const sorted = sortByScore(deduped);

    // Dev logging: top 10 with score breakdown
    if (IS_DEV && sorted.length > 0) {
        console.log(`\n📊 Search Results for "${query}" (top 10):`);
        sorted.slice(0, 10).forEach((r, i) => {
            console.log(`  ${i + 1}. [${r.score}] ${r.food.display_name}`);
            if (r.scoreBreakdown) {
                console.log(`     Breakdown:`, r.scoreBreakdown);
            }
        });
    }

    // Return just the food items
    return sorted.map(r => r.food);
}

/**
 * Get the best match score from results (for determining if Gemini fallback needed)
 */
export function getBestMatchScore(results: NormalizedFood[], query: string): number {
    if (results.length === 0) return 0;

    const scored = results.map(food => scoreResult(food, query));
    return Math.max(...scored.map(s => s.score));
}

/**
 * Check if results are "good enough" or if we need Gemini fallback
 */
export function needsGeminiFallback(
    results: NormalizedFood[],
    query: string,
    minResults: number = 5,
    minScore: number = 60
): boolean {
    if (results.length < minResults) return true;

    const bestScore = getBestMatchScore(results, query);

    // Count items above threshold
    const scored = results.map(food => scoreResult(food, query));
    const aboveThreshold = scored.filter(s => s.score >= minScore).length;

    // Need fallback if: best score low OR fewer than 3 above threshold
    return bestScore < minScore || aboveThreshold < 3;
}

// Export weights for tuning/testing
export { SCORE_WEIGHTS };
