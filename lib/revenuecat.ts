/**
 * RevenueCat service wrapper
 * Handles lazy loading of the Purchases SDK to avoid NativeEventEmitter errors during hot reload
 */
import { PAYWALL_ENABLED } from '@/app/index';
import { Platform } from 'react-native';

// RevenueCat API Keys
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

let purchasesModule: typeof import('react-native-purchases') | null = null;
let isConfigured = false;

/**
 * Tracks the outcome of initializeRevenueCat() so UI can show a useful error
 * instead of a generic "couldn't load plans" when misconfiguration is the cause.
 *
 *   'pending'     — initialization hasn't completed yet
 *   'ok'          — SDK configured successfully, ready to fetch offerings
 *   'missing-key' — API key env var is missing from the build (EAS env not set)
 *   'disabled'    — paywall intentionally disabled (beta flag)
 *   'error'       — SDK threw during configure()
 */
export type RevenueCatStatus = 'pending' | 'ok' | 'missing-key' | 'disabled' | 'error';
let configuredStatus: RevenueCatStatus = 'pending';
export function getConfiguredStatus(): RevenueCatStatus {
    return configuredStatus;
}

// Promise that resolves when RevenueCat initialization completes (success or failure)
let configuredResolve: (() => void) | null = null;
export const whenConfigured = new Promise<void>(resolve => {
    configuredResolve = resolve;
});

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
        configuredStatus = 'disabled';
        configuredResolve?.();
        return false;
    }

    if (isConfigured) return true;

    try {
        const Purchases = await getPurchases();
        if (!Purchases) {
            configuredStatus = 'error';
            return false;
        }

        const { LOG_LEVEL, STOREKIT_VERSION } = await import('react-native-purchases');
        if (__DEV__) {
            Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
            Purchases.setLogHandler((level, message) => {
                // Silence noisy cancellation errors — not real failures
                if (level === LOG_LEVEL.ERROR && /cancelled|canceled/i.test(message)) return;
                if (level === LOG_LEVEL.ERROR) console.error(`[RevenueCat] ${message}`);
                else if (level === LOG_LEVEL.WARN) console.warn(`[RevenueCat] ${message}`);
                else console.log(`[RevenueCat] ${message}`);
            });
        }

        if (Platform.OS === 'ios') {
            if (!REVENUECAT_IOS_API_KEY) {
                // Always log (not just __DEV__) — this is the kind of misconfig that
                // silently breaks TestFlight builds and causes Apple rejections.
                console.error(
                    '[RevenueCat] FATAL: EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is missing from this build. ' +
                    'The paywall will not work. Set the env var in EAS: ' +
                    '`eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value <key> --visibility plaintext`'
                );
                configuredStatus = 'missing-key';
                return false;
            }
            Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY, storeKitVersion: STOREKIT_VERSION.STOREKIT_2 });
            isConfigured = true;
            configuredStatus = 'ok';
            if (__DEV__) console.log('RevenueCat: Configured for iOS');
        } else if (Platform.OS === 'android') {
            if (!REVENUECAT_ANDROID_API_KEY) {
                console.error(
                    '[RevenueCat] FATAL: EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY is missing from this build. ' +
                    'The paywall will not work. Set the env var in EAS.'
                );
                configuredStatus = 'missing-key';
                return false;
            }
            Purchases.configure({ apiKey: REVENUECAT_ANDROID_API_KEY });
            isConfigured = true;
            configuredStatus = 'ok';
            if (__DEV__) console.log('RevenueCat: Configured for Android');
        }

        return isConfigured;
    } catch (error) {
        console.error('[RevenueCat] Error during initialization:', error);
        configuredStatus = 'error';
        return false;
    } finally {
        configuredResolve?.();
    }
}
