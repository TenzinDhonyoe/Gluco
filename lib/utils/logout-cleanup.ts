import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearFoodSearchCache } from '@/lib/foodSearch/cache';

const PER_USER_KEY_PREFIXES = [
    '@foodSearch:',
    '@foodProvider:',
    '@geminiRewrite:',
    'onboarding_step',
    'photo_analysis_cache:',
    'meal_score_cache:',
];

export async function clearLocalCachesForLogout(): Promise<void> {
    try {
        await clearFoodSearchCache();
    } catch (err) {
        if (__DEV__) console.warn('Failed to clear food search cache on logout:', err);
    }

    try {
        const keys = await AsyncStorage.getAllKeys();
        const stale = keys.filter(k => PER_USER_KEY_PREFIXES.some(p => k.startsWith(p)));
        if (stale.length > 0) {
            await AsyncStorage.multiRemove(stale);
        }
    } catch (err) {
        if (__DEV__) console.warn('Failed to clear AsyncStorage caches on logout:', err);
    }
}
