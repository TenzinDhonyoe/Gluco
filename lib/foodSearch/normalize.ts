/**
 * Query normalization utilities for food search
 * Handles typos, diacritics, case, whitespace, and common food aliases
 */

// Common food-related typos and their corrections
const COMMON_TYPOS: Record<string, string> = {
    // Typos
    'kebaba': 'kebab',
    'kebob': 'kebab',
    'kebabs': 'kebab',
    'chikcen': 'chicken',
    'chiken': 'chicken',
    'chickin': 'chicken',
    'chickn': 'chicken',
    'shawerma': 'shawarma',
    'shwarma': 'shawarma',
    'schwarma': 'shawarma',
    'yougurt': 'yogurt',
    'yoghurt': 'yogurt',
    'yohurt': 'yogurt',
    'oatmeal': 'oatmeal',
    'oat meal': 'oatmeal',
    'brocoli': 'broccoli',
    'brocolli': 'broccoli',
    'brokoli': 'broccoli',
    'tomatoe': 'tomato',
    'tomatos': 'tomatoes',
    'potatos': 'potatoes',
    'potatoe': 'potato',
    'lettice': 'lettuce',
    'letuce': 'lettuce',
    'salman': 'salmon',
    'samon': 'salmon',
    'samlon': 'salmon',
    'beaf': 'beef',
    'beefsteak': 'beef steak',
    'buger': 'burger',
    'burgur': 'burger',
    'hamburgar': 'hamburger',
    'sandwhich': 'sandwich',
    'sandwitch': 'sandwich',
    'spagetti': 'spaghetti',
    'spageti': 'spaghetti',
    'spaggetti': 'spaghetti',
    'bananana': 'banana',
    'bannana': 'banana',
    'avacado': 'avocado',
    'avacodo': 'avocado',
    'advocado': 'avocado',
    'choclate': 'chocolate',
    'chocholate': 'chocolate',
    'chocolat': 'chocolate',
    'strawbery': 'strawberry',
    'strawberies': 'strawberries',
    'bluebery': 'blueberry',
    'blueberrys': 'blueberries',
    'rasberry': 'raspberry',
    'raspbery': 'raspberry',
    'piza': 'pizza',
    'pizzza': 'pizza',
    'cofee': 'coffee',
    'coffe': 'coffee',
    'expresso': 'espresso',
    'capuccino': 'cappuccino',
    'cappucinno': 'cappuccino',
    'brekfast': 'breakfast',
    'breakfest': 'breakfast',
    'diner': 'dinner',
    'dinnar': 'dinner',
    'snaks': 'snacks',
    'vegetabel': 'vegetable',
    'vegetible': 'vegetable',
    'vegatable': 'vegetable',
    'friut': 'fruit',
    'froot': 'fruit',
    'fruites': 'fruits',
    'protien': 'protein',
    'protine': 'protein',
    'calorie': 'calories',
    'carbohydrate': 'carbs',
    'carbohydrates': 'carbs',
    'fibre': 'fiber',
};

// Food aliases and synonyms (term -> canonical)
const FOOD_ALIASES: Record<string, string> = {
    'poulet': 'chicken',
    'pollo': 'chicken',
    'hühnchen': 'chicken',
    'boeuf': 'beef',
    'carne': 'beef',
    'rindfleisch': 'beef',
    'porc': 'pork',
    'cerdo': 'pork',
    'schweinefleisch': 'pork',
    'riz': 'rice',
    'arroz': 'rice',
    'reis': 'rice',
    'pain': 'bread',
    'pan': 'bread',
    'brot': 'bread',
    'lait': 'milk',
    'leche': 'milk',
    'milch': 'milk',
    'oeuf': 'egg',
    'huevo': 'egg',
    'ei': 'egg',
    'pomme': 'apple',
    'manzana': 'apple',
    'apfel': 'apple',
    'fromage': 'cheese',
    'queso': 'cheese',
    'käse': 'cheese',
};

/**
 * Remove diacritics (accents) from a string
 */
export function removeDiacritics(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize a search query:
 * - Lowercase
 * - Remove diacritics
 * - Collapse multiple spaces
 * - Remove special punctuation (keep hyphens and apostrophes)
 * - Trim
 */
export function normalizeQuery(query: string): string {
    return removeDiacritics(query)
        .toLowerCase()
        .replace(/[^\w\s'-]/g, '') // Remove special chars except hyphen/apostrophe
        .replace(/\s+/g, ' ')       // Collapse whitespace
        .trim();
}

/**
 * Tokenize a query into words
 */
export function tokenize(query: string): string[] {
    return normalizeQuery(query)
        .split(/[\s-]+/)
        .filter(token => token.length > 0);
}

/**
 * Basic singularization for common patterns
 */
export function singularize(word: string): string {
    const lower = word.toLowerCase();

    // Irregular plurals
    const irregulars: Record<string, string> = {
        'berries': 'berry',
        'cherries': 'cherry',
        'strawberries': 'strawberry',
        'blueberries': 'blueberry',
        'raspberries': 'raspberry',
        'blackberries': 'blackberry',
        'potatoes': 'potato',
        'tomatoes': 'tomato',
        'heroes': 'hero',
        'leaves': 'leaf',
        'loaves': 'loaf',
        'halves': 'half',
        'knives': 'knife',
        'lives': 'life',
        'wives': 'wife',
        'shelves': 'shelf',
        'fish': 'fish',
        'sheep': 'sheep',
        'deer': 'deer',
        'grouse': 'grouse',
        'salmon': 'salmon',
        'trout': 'trout',
    };

    if (irregulars[lower]) {
        return irregulars[lower];
    }

    // Common patterns
    if (lower.endsWith('ies') && lower.length > 3) {
        return lower.slice(0, -3) + 'y';
    }
    if (lower.endsWith('es') && (lower.endsWith('shes') || lower.endsWith('ches') || lower.endsWith('xes') || lower.endsWith('sses') || lower.endsWith('zes'))) {
        return lower.slice(0, -2);
    }
    if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 2) {
        return lower.slice(0, -1);
    }

    return lower;
}

/**
 * Fix common typos in a query
 */
export function fixCommonTypos(query: string): string {
    const normalized = normalizeQuery(query);
    const tokens = tokenize(normalized);

    const fixed = tokens.map(token => {
        // Check direct typo match
        if (COMMON_TYPOS[token]) {
            return COMMON_TYPOS[token];
        }
        // Check alias match
        if (FOOD_ALIASES[token]) {
            return FOOD_ALIASES[token];
        }
        return token;
    });

    return fixed.join(' ');
}

/**
 * Get all query variants for expanded search
 */
export function getQueryVariants(query: string): string[] {
    const normalized = normalizeQuery(query);
    const fixed = fixCommonTypos(query);
    const tokens = tokenize(normalized);

    const variants = new Set<string>();
    variants.add(normalized);
    variants.add(fixed);

    // Add singular versions
    const singularTokens = tokens.map(singularize);
    variants.add(singularTokens.join(' '));

    // Add individual token typo fixes
    tokens.forEach(token => {
        if (COMMON_TYPOS[token]) {
            variants.add(normalized.replace(token, COMMON_TYPOS[token]));
        }
        if (FOOD_ALIASES[token]) {
            variants.add(normalized.replace(token, FOOD_ALIASES[token]));
        }
    });

    // Remove empty strings and duplicates
    return Array.from(variants).filter(v => v.length > 0);
}

/**
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 */
export function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Check if query is similar enough to a target (fuzzy match)
 */
export function isFuzzyMatch(query: string, target: string, maxDistance: number = 2): boolean {
    const normalizedQuery = normalizeQuery(query);
    const normalizedTarget = normalizeQuery(target);

    return levenshteinDistance(normalizedQuery, normalizedTarget) <= maxDistance;
}
