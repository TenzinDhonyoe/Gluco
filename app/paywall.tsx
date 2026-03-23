import { PAYWALL_SEEN_KEY } from '@/app/index';
import { Colors } from '@/constants/Colors';
import { useSubscription } from '@/context/SubscriptionContext';
import { fonts } from '@/hooks/useFonts';
import { supabase } from '@/lib/supabase';
import { triggerHaptic } from '@/lib/utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigateToApp } from '@/lib/navigation';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import type { PurchasesOffering } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

const LOAD_TIMEOUT_MS = 8000;

export default function PaywallScreen() {
    const { offerings: contextOfferings, loading: contextLoading } = useSubscription();
    const [localOffering, setLocalOffering] = useState<PurchasesOffering | null>(null);
    const [timedOut, setTimedOut] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync context offerings to local state
    useEffect(() => {
        if (contextOfferings) {
            setLocalOffering(contextOfferings);
        }
    }, [contextOfferings]);

    // Safety timeout — if loading takes too long, show fallback
    useEffect(() => {
        timeoutRef.current = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const offering = localOffering;
    const isLoading = contextLoading && !timedOut;
    const hasFailed = (!contextLoading && !offering) || (timedOut && !offering);

    const markSeenAndNavigate = async () => {
        await AsyncStorage.setItem(PAYWALL_SEEN_KEY, 'true');
        navigateToApp();
    };

    const handleSignOut = async () => {
        triggerHaptic();
        try {
            await supabase.auth.signOut();
            await AsyncStorage.removeItem(PAYWALL_SEEN_KEY);
            navigateToApp('/');
        } catch (error) {
            Alert.alert('Sign Out Error', String(error));
        }
    };

    const [retrying, setRetrying] = useState(false);

    const handleRetry = async () => {
        triggerHaptic();
        setRetrying(true);
        setTimedOut(false);
        try {
            const fetchedOfferings = await Purchases.getOfferings();
            if (fetchedOfferings.current) {
                setLocalOffering(fetchedOfferings.current);
            } else {
                setTimedOut(true);
            }
        } catch {
            setTimedOut(true);
        } finally {
            setRetrying(false);
        }
    };

    const handleDevReset = async () => {
        if (!__DEV__) return;
        triggerHaptic();
        try {
            await AsyncStorage.clear();
            try { await Purchases.logOut(); } catch { /* may not be logged in */ }
            await supabase.auth.signOut();
            navigateToApp('/');
        } catch (error) {
            Alert.alert('Reset Error', String(error));
        }
    };

    const devResetButton = __DEV__ ? (
        <TouchableOpacity
            style={styles.devResetButton}
            onPress={handleDevReset}
            activeOpacity={0.7}
        >
            <Text style={styles.devResetButtonText}>Dev Reset</Text>
        </TouchableOpacity>
    ) : null;

    const footer = (
        <View style={styles.footerContainer}>
            <TouchableOpacity onPress={markSeenAndNavigate} activeOpacity={0.7}>
                <Text style={styles.skipButtonText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSignOut} activeOpacity={0.7}>
                <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
            {devResetButton}
        </View>
    );

    // Loading state
    if (isLoading) {
        return (
            <View style={styles.container}>
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Loading plans...</Text>
                </View>
                {footer}
            </View>
        );
    }

    // Failed state — show custom fallback UI instead of blank RevenueCatUI
    if (hasFailed) {
        return (
            <View style={styles.container}>
                <View style={styles.centered}>
                    <View style={styles.failedCard}>
                        <View style={styles.failedIconContainer}>
                            <Text style={styles.failedIcon}>📡</Text>
                        </View>
                        <Text style={styles.failedTitle}>Couldn't load plans</Text>
                        <Text style={styles.failedMessage}>
                            This usually means your connection dropped. Give it another shot — we'll have you set up in no time.
                        </Text>
                        <TouchableOpacity
                            style={[styles.retryButton, retrying && styles.retryButtonDisabled]}
                            onPress={handleRetry}
                            activeOpacity={0.7}
                            disabled={retrying}
                        >
                            {retrying ? (
                                <ActivityIndicator size="small" color={Colors.buttonActionText} />
                            ) : (
                                <Text style={styles.retryButtonText}>Try Again</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
                {footer}
            </View>
        );
    }

    // Normal paywall — pass offering explicitly so it doesn't re-fetch internally
    return (
        <View style={styles.container}>
            <RevenueCatUI.Paywall
                options={{ offering }}
                onDismiss={() => {
                    triggerHaptic();
                    markSeenAndNavigate();
                }}
                onPurchaseCompleted={() => {
                    triggerHaptic('medium');
                    markSeenAndNavigate();
                }}
                onRestoreCompleted={() => {
                    triggerHaptic('medium');
                    markSeenAndNavigate();
                }}
            />
            {footer}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    loadingText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textSecondary,
        marginTop: 16,
    },
    footerContainer: {
        alignItems: 'center',
        paddingBottom: 50,
        paddingTop: 12,
        gap: 12,
    },
    failedCard: {
        backgroundColor: Colors.backgroundCardGlass,
        borderRadius: 20,
        paddingVertical: 32,
        paddingHorizontal: 28,
        alignItems: 'center',
        borderWidth: 0.5,
        borderColor: Colors.borderCard,
        width: '100%',
    },
    failedIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    failedIcon: {
        fontSize: 28,
    },
    failedTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    failedMessage: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
    },
    retryButton: {
        backgroundColor: Colors.buttonAction,
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        minHeight: 52,
        justifyContent: 'center',
    },
    retryButtonDisabled: {
        backgroundColor: Colors.buttonDisabled,
    },
    retryButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.buttonActionText,
    },
    skipButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textSecondary,
    },
    signOutButtonText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textTertiary,
    },
    devResetButton: {
        paddingVertical: 6,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255, 100, 100, 0.2)',
        borderRadius: 8,
    },
    devResetButtonText: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#ff6464',
    },
});
