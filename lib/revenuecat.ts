/**
 * RevenueCat service wrapper
 * Handles lazy loading of the Purchases SDK to avoid NativeEventEmitter errors during hot reload
 */
import { PAYWALL_ENABLED } from '@/app/index';
import { Platform } from 'react-native';

// RevenueCat API Keys
const REVENUECAT_IOS_API_KEY = 'appl_bMgbVaBRfaRNdgvZXKAAbjLTBhI';
// TODO: Add Android API key when available
// const REVENUECAT_ANDROID_API_KEY = '<your_android_api_key>';

let purchasesModule: typeof import('react-native-purchases') | null = null;
let isConfigured = false;

/**
 * Lazily loads the RevenueCat Purchases module
 */
export async function getPurchases() {
    // Skip loading if paywall is disabled
    if (!PAYWALL_ENABLED) return null;

    if (!purchasesModule) {
        try {
            purchasesModule = await import('react-native-purchases');
        } catch (error) {
            if (__DEV__) console.warn('Failed to load RevenueCat module:', error);
            return null;
        }
    }
    return purchasesModule.default;
}

/**
 * Initialize RevenueCat SDK
 * Should be called once at app startup
 */
export async function initializeRevenueCat(): Promise<boolean> {
    // Skip initialization if paywall is disabled (beta mode)
    if (!PAYWALL_ENABLED) {
        if (__DEV__) console.log('RevenueCat: Skipped (paywall disabled for beta)');
        return false;
    }

    if (isConfigured) return true;

    try {
        const Purchases = await getPurchases();
        if (!Purchases) return false;

        const { LOG_LEVEL } = await import('react-native-purchases');

        Purchases.setLogLevel(LOG_LEVEL.VERBOSE);

        if (Platform.OS === 'ios') {
            Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });
            isConfigured = true;
            if (__DEV__) console.log('RevenueCat: Configured for iOS');
        } else if (Platform.OS === 'android') {
            // TODO: Configure Android when API key is available
            // Purchases.configure({ apiKey: REVENUECAT_ANDROID_API_KEY });
            if (__DEV__) console.log('RevenueCat: Android not configured');
        }

        return isConfigured;
    } catch (error) {
        if (__DEV__) console.warn('Error initializing RevenueCat:', error);
        return false;
    }
}
