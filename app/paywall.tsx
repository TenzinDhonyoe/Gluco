import { PAYWALL_SEEN_KEY } from '@/app/index';
import { Colors } from '@/constants/Colors';
import { useSubscription } from '@/context/SubscriptionContext';
import { fonts } from '@/hooks/useFonts';
import { supabase } from '@/lib/supabase';
import { triggerHaptic } from '@/lib/utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
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
        router.replace('/(tabs)');
    };

    const handleDevReset = async () => {
        if (!__DEV__) return;
        triggerHaptic();
        try {
            await AsyncStorage.clear();
            try { await Purchases.logOut(); } catch { /* may not be logged in */ }
            await supabase.auth.signOut();
            router.replace('/');
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

    // Loading state
    if (isLoading) {
        return (
            <View style={styles.container}>
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Loading plans...</Text>
                </View>
                {devResetButton}
            </View>
        );
    }

    // Failed state — offerings couldn't be fetched, show paywall without pre-fetched offering
    // RevenueCatUI.Paywall will attempt to fetch offerings internally
    if (hasFailed) {
        return (
            <View style={styles.container}>
                <RevenueCatUI.Paywall
                    onDismiss={() => {
                        triggerHaptic();
                        router.replace('/');
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
                {devResetButton}
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
                    router.replace('/');
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
            {devResetButton}
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
    devResetButton: {
        position: 'absolute',
        bottom: 50,
        alignSelf: 'center',
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
