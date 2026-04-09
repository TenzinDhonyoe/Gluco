import { PAYWALL_SEEN_KEY } from '@/app/index';
import { Colors } from '@/constants/Colors';
import { Images } from '@/constants/Images';
import { LEGAL_URLS } from '@/constants/legal';
import { useSubscription } from '@/context/SubscriptionContext';
import { fonts } from '@/hooks/useFonts';
import { supabase } from '@/lib/supabase';
import { navigateToApp } from '@/lib/navigation';
import { triggerHaptic } from '@/lib/utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';

const LOAD_TIMEOUT_MS = 8000;

const FEATURES = [
    'AI-Powered Insights',
    'Advanced Analytics',
    'Smart Reminders',
    'Unlimited Logging',
];

function getPackageLabel(pkg: PurchasesPackage): string {
    if (pkg.packageType === 'ANNUAL') return 'Annual';
    if (pkg.packageType === 'MONTHLY') return 'Monthly';
    return pkg.product.title;
}

function getPriceDetail(pkg: PurchasesPackage): string {
    if (pkg.packageType === 'ANNUAL') {
        const monthlyEquiv = (pkg.product.price / 12).toFixed(2);
        return `${pkg.product.priceString}/year (${pkg.product.currencyCode} ${monthlyEquiv}/mo)`;
    }
    return `${pkg.product.priceString}/month`;
}

export default function PaywallScreen() {
    const {
        offerings: contextOfferings,
        loading: contextLoading,
        purchasePackage,
        restorePurchases,
    } = useSubscription();
    const [localOffering, setLocalOffering] = useState<PurchasesOffering | null>(null);
    const [timedOut, setTimedOut] = useState(false);
    const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
    const [purchasing, setPurchasing] = useState(false);
    const [retrying, setRetrying] = useState(false);
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

    // Extract packages
    const annualPackage = offering?.availablePackages.find(p => p.packageType === 'ANNUAL') ?? null;
    const monthlyPackage = offering?.availablePackages.find(p => p.packageType === 'MONTHLY') ?? null;
    const packages = [annualPackage, monthlyPackage].filter(Boolean) as PurchasesPackage[];

    // Default-select annual when packages load
    useEffect(() => {
        if (annualPackage && !selectedPackage) {
            setSelectedPackage(annualPackage);
        } else if (!annualPackage && monthlyPackage && !selectedPackage) {
            setSelectedPackage(monthlyPackage);
        }
    }, [annualPackage, monthlyPackage, selectedPackage]);

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

    const handlePurchase = async () => {
        if (!selectedPackage || purchasing) return;
        triggerHaptic('medium');
        setPurchasing(true);
        try {
            const result = await purchasePackage(selectedPackage);
            if (result.success) {
                markSeenAndNavigate();
            } else if (result.error && result.error !== 'cancelled') {
                Alert.alert('Purchase Error', result.error);
            }
        } catch (error) {
            Alert.alert('Purchase Error', String(error));
        } finally {
            setPurchasing(false);
        }
    };

    const handleRestore = async () => {
        triggerHaptic();
        const result = await restorePurchases();
        if (result.success) {
            markSeenAndNavigate();
        } else {
            Alert.alert('Restore', result.error || 'No active subscription found');
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

    // Failed state — show custom fallback UI instead of blank screen
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

    // Build disclaimer text with selected package details
    const disclaimerPlanName = selectedPackage ? `${selectedPackage.product.title} — ${getPriceDetail(selectedPackage)}. ` : '';

    // Normal paywall — custom UI with Apple 3.1.2(c) compliance
    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
            >
                {/* Spacer to let background show */}
                <View style={styles.heroSpacer} />

                {/* Hero */}
                <View style={styles.hero}>
                    <Image source={Images.mascots.default} style={styles.heroImage} />
                    <Text style={styles.heroTitle}>Unlock Premium</Text>
                    <Text style={styles.heroSubtitle}>
                        Get personalized insights for{'\n'}your health journey
                    </Text>
                </View>

                {/* Feature Pills */}
                <View style={styles.features}>
                    {FEATURES.map(feature => (
                        <View key={feature} style={styles.featurePill}>
                            <Text style={styles.featurePillText}>{feature}</Text>
                        </View>
                    ))}
                </View>

                {/* Pricing Cards — Apple 3.1.2(c) items 1-3: title, duration, price */}
                <View style={styles.pricing}>
                    {packages.map(pkg => {
                        const isSelected = selectedPackage?.identifier === pkg.identifier;
                        const isAnnual = pkg.packageType === 'ANNUAL';
                        return (
                            <TouchableOpacity
                                key={pkg.identifier}
                                style={[
                                    styles.priceCard,
                                    isSelected && styles.priceCardSelected,
                                    isAnnual && styles.priceCardAnnual,
                                ]}
                                onPress={() => {
                                    triggerHaptic();
                                    setSelectedPackage(pkg);
                                }}
                                activeOpacity={0.7}
                            >
                                {isAnnual && (
                                    <View style={styles.bestValueBadge}>
                                        <Text style={styles.bestValueText}>BEST VALUE</Text>
                                    </View>
                                )}
                                <View style={styles.priceCardContent}>
                                    <View style={styles.priceCardLeft}>
                                        <Text style={styles.priceCardLabel}>
                                            {getPackageLabel(pkg)}
                                        </Text>
                                        <Text style={styles.priceCardDetail}>
                                            {pkg.product.title} — {getPriceDetail(pkg)}
                                        </Text>
                                    </View>
                                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                                        {isSelected && <View style={styles.radioDot} />}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Legal Disclaimer — Apple-recommended auto-renewal text */}
                <Text style={styles.disclaimer}>
                    {disclaimerPlanName}Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. You can manage and cancel your subscriptions by going to your App Store account settings after purchase.
                </Text>

                {/* CTA Button */}
                <TouchableOpacity
                    style={[styles.ctaButton, (!selectedPackage || purchasing) && styles.ctaButtonDisabled]}
                    onPress={handlePurchase}
                    activeOpacity={0.7}
                    disabled={!selectedPackage || purchasing}
                >
                    {purchasing ? (
                        <ActivityIndicator size="small" color={Colors.buttonPrimaryText} />
                    ) : (
                        <Text style={styles.ctaButtonText}>Continue</Text>
                    )}
                </TouchableOpacity>

                {/* Restore Purchases */}
                <TouchableOpacity onPress={handleRestore} style={styles.restoreRow} activeOpacity={0.7}>
                    <Text style={styles.restoreText}>Restore Purchases</Text>
                </TouchableOpacity>

                {/* Legal Links — Apple 3.1.2(c) items 4-5: Privacy Policy & Terms of Use */}
                <View style={styles.legalFooter}>
                    <Text
                        style={styles.legalLink}
                        onPress={() => Linking.openURL(LEGAL_URLS.appleEula)}
                    >
                        Terms of Use (EULA)
                    </Text>
                    <Text style={styles.legalDot}> · </Text>
                    <Text
                        style={styles.legalLink}
                        onPress={() => Linking.openURL(LEGAL_URLS.privacyPolicy)}
                    >
                        Privacy Policy
                    </Text>
                </View>
            </ScrollView>
            {footer}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 16,
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

    // Hero
    heroSpacer: {
        flex: 1,
        minHeight: 20,
    },
    hero: {
        alignItems: 'center',
        marginBottom: 28,
    },
    heroImage: {
        width: 100,
        height: 100,
        marginBottom: 16,
        resizeMode: 'contain',
    },
    heroTitle: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: Colors.textPrimary,
        marginBottom: 8,
        letterSpacing: -0.3,
    },
    heroSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },

    // Features
    features: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 28,
    },
    featurePill: {
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: Colors.primaryLight,
        borderWidth: 1,
        borderColor: Colors.primaryMedium,
    },
    featurePillText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.primary,
    },

    // Pricing
    pricing: {
        gap: 10,
        marginBottom: 16,
    },
    priceCard: {
        padding: 16,
        borderRadius: 14,
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1.5,
        borderColor: Colors.borderCard,
    },
    priceCardSelected: {
        backgroundColor: Colors.primaryLight,
        borderColor: Colors.primary,
    },
    priceCardAnnual: {
        marginTop: 6,
    },
    priceCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    priceCardLeft: {
        flex: 1,
        marginRight: 12,
    },
    priceCardLabel: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    priceCardDetail: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 3,
    },
    bestValueBadge: {
        position: 'absolute',
        top: -10,
        left: 16,
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 6,
        backgroundColor: Colors.primaryLight,
        borderWidth: 1,
        borderColor: Colors.primaryMedium,
        zIndex: 1,
    },
    bestValueText: {
        fontFamily: fonts.bold,
        fontSize: 10,
        letterSpacing: 1,
        color: Colors.primary,
    },
    radio: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: Colors.textMuted,
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioSelected: {
        borderColor: Colors.primary,
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.primary,
    },

    // Legal disclaimer
    disclaimer: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
        textAlign: 'center',
        lineHeight: 16,
        marginBottom: 16,
        paddingHorizontal: 8,
    },

    // CTA
    ctaButton: {
        height: 52,
        borderRadius: 14,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 4,
    },
    ctaButtonDisabled: {
        opacity: 0.6,
    },
    ctaButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: Colors.buttonPrimaryText,
    },

    // Restore
    restoreRow: {
        alignItems: 'center',
        marginTop: 14,
    },
    restoreText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textTertiary,
    },

    // Legal links
    legalFooter: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        paddingBottom: 4,
    },
    legalLink: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
        textDecorationLine: 'underline',
    },
    legalDot: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
    },

    // Footer
    footerContainer: {
        alignItems: 'center',
        paddingBottom: 50,
        paddingTop: 12,
        gap: 12,
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

    // Failed state
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
