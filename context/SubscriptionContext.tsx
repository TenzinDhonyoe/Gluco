import { useAuth } from '@/context/AuthContext';
import { getPurchases } from '@/lib/revenuecat';
import React, { createContext, useContext, useEffect, useState } from 'react';

// Import types only (not runtime code)
import type {
    CustomerInfo,
    PurchasesOffering,
    PurchasesPackage,
} from 'react-native-purchases';

// Entitlement identifier from RevenueCat dashboard
const PREMIUM_ENTITLEMENT_ID = 'premium';

interface SubscriptionContextType {
    isProUser: boolean;
    offerings: PurchasesOffering | null;
    customerInfo: CustomerInfo | null;
    loading: boolean;
    purchasePackage: (pkg: PurchasesPackage) => Promise<{ success: boolean; error?: string }>;
    restorePurchases: () => Promise<{ success: boolean; error?: string }>;
    refreshCustomerInfo: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
    const [isProUser, setIsProUser] = useState(false);
    const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
    const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    // Initialize and fetch offerings
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let listenerSubscription: any = null;

        const init = async () => {
            try {
                const Purchases = await getPurchases();
                if (!Purchases) {
                    setLoading(false);
                    return;
                }

                // Small delay to ensure RevenueCat is configured
                await new Promise(resolve => setTimeout(resolve, 100));

                // Fetch offerings
                const offeringsResult = await Purchases.getOfferings();
                if (offeringsResult.current) {
                    setOfferings(offeringsResult.current);
                }

                // Get customer info
                const info = await Purchases.getCustomerInfo();
                setCustomerInfo(info);
                updateProStatus(info);

                // Listen for customer info updates
                try {
                    listenerSubscription = Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
                        setCustomerInfo(info);
                        updateProStatus(info);
                    });
                } catch (error) {
                    if (__DEV__) console.warn('Error adding customer info listener:', error);
                }
            } catch (error) {
                if (__DEV__) console.error('Error initializing RevenueCat:', error);
            } finally {
                setLoading(false);
            }
        };

        init();

        return () => {
            try {
                listenerSubscription?.remove?.();
            } catch {
                // Ignore cleanup errors
            }
        };
    }, []);

    // Link RevenueCat user with Supabase user
    useEffect(() => {
        const linkUser = async () => {
            if (user?.id) {
                try {
                    const Purchases = await getPurchases();
                    if (!Purchases) return;

                    // Check if already logged in as this user
                    const currentInfo = await Purchases.getCustomerInfo();
                    if (currentInfo.originalAppUserId !== user.id) {
                        await Purchases.logIn(user.id);
                        if (__DEV__) console.log('RevenueCat: Linked user', user.id);
                    }
                } catch (error) {
                    if (__DEV__) console.error('Error linking RevenueCat user:', error);
                }
            }
        };

        linkUser();
    }, [user?.id]);

    const updateProStatus = (info: CustomerInfo) => {
        const isPro = typeof info.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== 'undefined';
        setIsProUser(isPro);
    };

    const refreshCustomerInfo = async () => {
        try {
            const Purchases = await getPurchases();
            if (!Purchases) return;

            const info = await Purchases.getCustomerInfo();
            setCustomerInfo(info);
            updateProStatus(info);
        } catch (error) {
            if (__DEV__) console.error('Error refreshing customer info:', error);
        }
    };

    const purchasePackage = async (pkg: PurchasesPackage): Promise<{ success: boolean; error?: string }> => {
        try {
            const Purchases = await getPurchases();
            if (!Purchases) return { success: false, error: 'RevenueCat not available' };

            setLoading(true);
            const { customerInfo: newInfo } = await Purchases.purchasePackage(pkg);
            setCustomerInfo(newInfo);
            updateProStatus(newInfo);
            return { success: true };
        } catch (error: unknown) {
            const purchaseError = error as { userCancelled?: boolean; message?: string };
            if (purchaseError.userCancelled) {
                return { success: false, error: 'cancelled' };
            }
            if (__DEV__) console.error('Purchase error:', error);
            return { success: false, error: purchaseError.message || 'Purchase failed' };
        } finally {
            setLoading(false);
        }
    };

    const restorePurchases = async (): Promise<{ success: boolean; error?: string }> => {
        try {
            const Purchases = await getPurchases();
            if (!Purchases) return { success: false, error: 'RevenueCat not available' };

            setLoading(true);
            const info = await Purchases.restorePurchases();
            setCustomerInfo(info);
            updateProStatus(info);

            const hasPremium = typeof info.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== 'undefined';
            if (hasPremium) {
                return { success: true };
            } else {
                return { success: false, error: 'No active subscription found' };
            }
        } catch (error: unknown) {
            const restoreError = error as { message?: string };
            if (__DEV__) console.error('Restore error:', error);
            return { success: false, error: restoreError.message || 'Restore failed' };
        } finally {
            setLoading(false);
        }
    };

    return (
        <SubscriptionContext.Provider
            value={{
                isProUser,
                offerings,
                customerInfo,
                loading,
                purchasePackage,
                restorePurchases,
                refreshCustomerInfo,
            }}
        >
            {children}
        </SubscriptionContext.Provider>
    );
}

export function useSubscription() {
    const context = useContext(SubscriptionContext);
    if (context === undefined) {
        throw new Error('useSubscription must be used within a SubscriptionProvider');
    }
    return context;
}
