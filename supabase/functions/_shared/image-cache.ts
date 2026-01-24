// supabase/functions/_shared/image-cache.ts
// Image analysis caching with SHA-256 hash keys

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { FoodDetectionResult } from './gemini-structured.ts';

// Cache TTL in milliseconds (10 minutes)
const IMAGE_CACHE_TTL_MS = 10 * 60 * 1000;

// Nutrition cache TTL in milliseconds (24 hours)
const NUTRITION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cached image analysis result
 */
export interface CachedImageAnalysis {
    hash: string;
    detection_result: FoodDetectionResult;
    created_at: string;
    expires_at: string;
}

/**
 * Cached nutrition lookup result
 */
export interface CachedNutritionLookup {
    query_key: string;
    nutrition_data: {
        calories: number | null;
        carbs_g: number | null;
        protein_g: number | null;
        fat_g: number | null;
        fibre_g: number | null;
        sugar_g: number | null;
        sodium_mg: number | null;
    };
    source: 'fatsecret' | 'usda_fdc' | 'fallback_estimate';
    matched_food_name?: string;
    created_at: string;
    expires_at: string;
}

/**
 * Create a Supabase client for cache operations
 */
function getSupabaseClient(): SupabaseClient {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
    }

    return createClient(supabaseUrl, supabaseKey);
}

/**
 * Compute SHA-256 hash of image data
 */
export async function computeImageHash(imageData: ArrayBuffer | Uint8Array): Promise<string> {
    const data = imageData instanceof ArrayBuffer ? new Uint8Array(imageData) : imageData;
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute SHA-256 hash from base64 string
 */
export async function computeHashFromBase64(base64Data: string): Promise<string> {
    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return computeImageHash(bytes);
}

/**
 * Compute hash from image URL by fetching and hashing
 */
export async function computeHashFromUrl(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return computeImageHash(buffer);
}

/**
 * Get cached image analysis result
 */
export async function getCachedImageAnalysis(
    imageHash: string
): Promise<FoodDetectionResult | null> {
    try {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('photo_analysis_cache')
            .select('detection_result, expires_at')
            .eq('hash', imageHash)
            .single();

        if (error || !data) {
            return null;
        }

        // Check if cache entry has expired
        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
            // Cache expired, delete it
            await supabase
                .from('photo_analysis_cache')
                .delete()
                .eq('hash', imageHash);
            return null;
        }

        return data.detection_result as FoodDetectionResult;
    } catch (error) {
        console.error('Error getting cached image analysis:', error);
        return null;
    }
}

/**
 * Cache image analysis result
 */
export async function cacheImageAnalysis(
    imageHash: string,
    result: FoodDetectionResult
): Promise<void> {
    try {
        const supabase = getSupabaseClient();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + IMAGE_CACHE_TTL_MS);

        await supabase
            .from('photo_analysis_cache')
            .upsert({
                hash: imageHash,
                detection_result: result,
                created_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
            }, { onConflict: 'hash' });
    } catch (error) {
        console.error('Error caching image analysis:', error);
        // Don't throw - caching is non-critical
    }
}

/**
 * Normalize query for nutrition cache key
 */
export function normalizeNutritionCacheKey(query: string, category?: string): string {
    const normalized = query
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

    return category ? `${normalized}_${category}` : normalized;
}

/**
 * Get cached nutrition lookup result
 */
export async function getCachedNutrition(
    queryKey: string
): Promise<CachedNutritionLookup['nutrition_data'] | null> {
    try {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('nutrition_lookup_cache')
            .select('nutrition_data, expires_at')
            .eq('query_key', queryKey)
            .single();

        if (error || !data) {
            return null;
        }

        // Check if cache entry has expired
        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
            // Cache expired, delete it
            await supabase
                .from('nutrition_lookup_cache')
                .delete()
                .eq('query_key', queryKey);
            return null;
        }

        return data.nutrition_data as CachedNutritionLookup['nutrition_data'];
    } catch (error) {
        console.error('Error getting cached nutrition:', error);
        return null;
    }
}

/**
 * Cache nutrition lookup result
 */
export async function cacheNutrition(
    queryKey: string,
    nutritionData: CachedNutritionLookup['nutrition_data'],
    source: CachedNutritionLookup['source'],
    matchedFoodName?: string
): Promise<void> {
    try {
        const supabase = getSupabaseClient();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + NUTRITION_CACHE_TTL_MS);

        await supabase
            .from('nutrition_lookup_cache')
            .upsert({
                query_key: queryKey,
                nutrition_data: nutritionData,
                source,
                matched_food_name: matchedFoodName,
                created_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
            }, { onConflict: 'query_key' });
    } catch (error) {
        console.error('Error caching nutrition:', error);
        // Don't throw - caching is non-critical
    }
}

/**
 * Clean expired cache entries (can be called periodically)
 */
export async function cleanExpiredCache(): Promise<{ imagesDeleted: number; nutritionDeleted: number }> {
    try {
        const supabase = getSupabaseClient();
        const now = new Date().toISOString();

        const { count: imagesDeleted } = await supabase
            .from('photo_analysis_cache')
            .delete()
            .lt('expires_at', now)
            .select('*', { count: 'exact', head: true });

        const { count: nutritionDeleted } = await supabase
            .from('nutrition_lookup_cache')
            .delete()
            .lt('expires_at', now)
            .select('*', { count: 'exact', head: true });

        return {
            imagesDeleted: imagesDeleted || 0,
            nutritionDeleted: nutritionDeleted || 0,
        };
    } catch (error) {
        console.error('Error cleaning expired cache:', error);
        return { imagesDeleted: 0, nutritionDeleted: 0 };
    }
}

/**
 * In-memory cache for very short-term deduplication (within single request)
 * This helps when the same image is processed multiple times in one request
 */
const inMemoryCache = new Map<string, { result: FoodDetectionResult; timestamp: number }>();
const IN_MEMORY_TTL_MS = 60 * 1000; // 1 minute

export function getInMemoryCache(hash: string): FoodDetectionResult | null {
    const entry = inMemoryCache.get(hash);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > IN_MEMORY_TTL_MS) {
        inMemoryCache.delete(hash);
        return null;
    }

    return entry.result;
}

export function setInMemoryCache(hash: string, result: FoodDetectionResult): void {
    // Limit cache size
    if (inMemoryCache.size > 100) {
        // Delete oldest entries
        const entries = Array.from(inMemoryCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        for (let i = 0; i < 20; i++) {
            inMemoryCache.delete(entries[i][0]);
        }
    }

    inMemoryCache.set(hash, { result, timestamp: Date.now() });
}
