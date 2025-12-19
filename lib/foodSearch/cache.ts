/**
 * AsyncStorage-based caching with TTL support
 * Used for caching search results and Gemini rewrites
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
    PROVIDER_RESULTS: 24 * 60 * 60 * 1000,  // 24 hours
    GEMINI_REWRITE: 7 * 24 * 60 * 60 * 1000, // 7 days
    SEARCH_RESULTS: 60 * 60 * 1000,          // 1 hour for combined results
};

// Cache key prefixes
const CACHE_PREFIX = {
    SEARCH: '@foodSearch:',
    PROVIDER: '@foodProvider:',
    GEMINI: '@geminiRewrite:',
};

interface CachedItem<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Generate a cache key for a search query
 */
export function generateSearchCacheKey(query: string): string {
    return `${CACHE_PREFIX.SEARCH}${query.toLowerCase().trim()}`;
}

/**
 * Generate a cache key for provider results
 */
export function generateProviderCacheKey(provider: string, query: string): string {
    return `${CACHE_PREFIX.PROVIDER}${provider}:${query.toLowerCase().trim()}`;
}

/**
 * Generate a cache key for Gemini rewrites
 */
export function generateGeminiCacheKey(query: string): string {
    return `${CACHE_PREFIX.GEMINI}${query.toLowerCase().trim()}`;
}

/**
 * Get cached item if not expired
 */
export async function getCached<T>(key: string): Promise<T | null> {
    try {
        const stored = await AsyncStorage.getItem(key);
        if (!stored) return null;

        const cached: CachedItem<T> = JSON.parse(stored);
        const now = Date.now();

        // Check if expired
        if (now - cached.timestamp > cached.ttl) {
            // Expired - remove from cache
            await AsyncStorage.removeItem(key);
            return null;
        }

        return cached.data;
    } catch (error) {
        console.warn('Cache read error:', error);
        return null;
    }
}

/**
 * Store item in cache with TTL
 */
export async function setCache<T>(key: string, data: T, ttl: number): Promise<void> {
    try {
        const cached: CachedItem<T> = {
            data,
            timestamp: Date.now(),
            ttl,
        };
        await AsyncStorage.setItem(key, JSON.stringify(cached));
    } catch (error) {
        console.warn('Cache write error:', error);
    }
}

/**
 * Remove item from cache
 */
export async function removeCache(key: string): Promise<void> {
    try {
        await AsyncStorage.removeItem(key);
    } catch (error) {
        console.warn('Cache remove error:', error);
    }
}

/**
 * Clear all food search related cache
 */
export async function clearFoodSearchCache(): Promise<void> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const foodSearchKeys = keys.filter(
            key =>
                key.startsWith(CACHE_PREFIX.SEARCH) ||
                key.startsWith(CACHE_PREFIX.PROVIDER) ||
                key.startsWith(CACHE_PREFIX.GEMINI)
        );
        await AsyncStorage.multiRemove(foodSearchKeys);
    } catch (error) {
        console.warn('Cache clear error:', error);
    }
}

/**
 * Get cache stats (for debugging)
 */
export async function getCacheStats(): Promise<{
    searchEntries: number;
    providerEntries: number;
    geminiEntries: number;
    totalSize: number;
}> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const searchKeys = keys.filter(k => k.startsWith(CACHE_PREFIX.SEARCH));
        const providerKeys = keys.filter(k => k.startsWith(CACHE_PREFIX.PROVIDER));
        const geminiKeys = keys.filter(k => k.startsWith(CACHE_PREFIX.GEMINI));

        // Estimate total size (rough approximation)
        let totalSize = 0;
        for (const key of [...searchKeys, ...providerKeys, ...geminiKeys]) {
            const value = await AsyncStorage.getItem(key);
            if (value) totalSize += value.length;
        }

        return {
            searchEntries: searchKeys.length,
            providerEntries: providerKeys.length,
            geminiEntries: geminiKeys.length,
            totalSize,
        };
    } catch (error) {
        console.warn('Cache stats error:', error);
        return {
            searchEntries: 0,
            providerEntries: 0,
            geminiEntries: 0,
            totalSize: 0,
        };
    }
}
