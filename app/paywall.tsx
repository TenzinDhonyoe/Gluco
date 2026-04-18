import { PAYWALL_SEEN_KEY } from '@/app/index';
import { Colors } from '@/constants/Colors';
import { LEGAL_URLS } from '@/constants/legal';
import { useSubscription } from '@/context/SubscriptionContext';
import { fonts } from '@/hooks/useFonts';
import { navigateToApp } from '@/lib/navigation';
import { getConfiguredStatus } from '@/lib/revenuecat';
import { triggerHaptic } from '@/lib/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const LOAD_TIMEOUT_MS = 8000;
const SUCCESS_DISPLAY_MS = 1500;

const FEATURES = [
    'Personalized health insights',
    'Detailed progress tracking',
    'Smart meal reminders',
    'Unlimited meal logging',
];

function getPackageLabel(pkg: PurchasesPackage): string {
    if (pkg.packageType === 'ANNUAL') return 'Annual';
    if (pkg.packageType === 'MONTHLY') return 'Monthly';
    return pkg.product.title;
}

function getPriceDetail(pkg: PurchasesPackage): string {
    if (pkg.packageType === 'ANNUAL') {
        const monthlyEquiv = (pkg.product.price / 12).toFixed(2);
        return `${pkg.product.priceString}/yr (${pkg.product.currencyCode} ${monthlyEquiv}/mo)`;
    }
    return `${pkg.product.priceString}/month`;
}

function getSavingsText(annual: PurchasesPackage | null, monthly: PurchasesPackage | null): string | null {
    if (!annual || !monthly) return null;
    const annualMonthly = annual.product.price / 12;
    const savings = Math.round((1 - annualMonthly / monthly.product.price) * 100);
    if (savings > 0) return `Save ${savings}%`;
    return null;
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
    const [purchaseSuccess, setPurchaseSuccess] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Success checkmark animation
    const checkScale = useSharedValue(0);
    const checkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkScale.value }],
    }));

    useEffect(() => {
        if (contextOfferings) setLocalOffering(contextOfferings);
    }, [contextOfferings]);

    useEffect(() => {
        timeoutRef.current = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }, []);

    const offering = localOffering;
    const isLoading = contextLoading && !timedOut;
    const hasFailed = (!contextLoading && !offering) || (timedOut && !offering);
    // If the SDK itself isn't configured, retry can't help — show a distinct error.
    // This prevents repeating the "plans couldn't load" mystery that caused the
    // Apple v1 rejection when EAS env vars weren't set.
    const rcStatus = getConfiguredStatus();
    const hasMisconfig = hasFailed && (rcStatus === 'missing-key' || rcStatus === 'error');

    const annualPackage = offering?.availablePackages.find(p => p.packageType === 'ANNUAL') ?? null;
    const monthlyPackage = offering?.availablePackages.find(p => p.packageType === 'MONTHLY') ?? null;
    const packages = [annualPackage, monthlyPackage].filter(Boolean) as PurchasesPackage[];
    const savingsText = getSavingsText(annualPackage, monthlyPackage);

    useEffect(() => {
        if (annualPackage && !selectedPackage) setSelectedPackage(annualPackage);
        else if (!annualPackage && monthlyPackage && !selectedPackage) setSelectedPackage(monthlyPackage);
    }, [annualPackage, monthlyPackage, selectedPackage]);

    const markSeenAndNavigate = async () => {
        await AsyncStorage.setItem(PAYWALL_SEEN_KEY, 'true');
        navigateToApp();
    };

    const handleRetry = async () => {
        triggerHaptic();
        setRetrying(true);
        setTimedOut(false);
        try {
            const fetchedOfferings = await Purchases.getOfferings();
            if (fetchedOfferings.current) setLocalOffering(fetchedOfferings.current);
            else setTimedOut(true);
        } catch { setTimedOut(true); }
        finally { setRetrying(false); }
    };

    const handlePurchase = async () => {
        if (!selectedPackage || purchasing) return;
        triggerHaptic('medium');
        setPurchasing(true);
        try {
            const result = await purchasePackage(selectedPackage);
            if (result.success) {
                setPurchaseSuccess(true);
                triggerHaptic('medium');
                checkScale.value = withSpring(1, { damping: 10, stiffness: 150 });
                setTimeout(markSeenAndNavigate, SUCCESS_DISPLAY_MS);
            } else if (result.error && result.error !== 'cancelled') {
                Alert.alert('Purchase Error', result.error);
            }
        } catch (error) { Alert.alert('Purchase Error', String(error)); }
        finally { setPurchasing(false); }
    };

    const handleRestore = async () => {
        triggerHaptic();
        const result = await restorePurchases();
        if (result.success) {
            setPurchaseSuccess(true);
            triggerHaptic('medium');
            checkScale.value = withSpring(1, { damping: 10, stiffness: 150 });
            setTimeout(markSeenAndNavigate, SUCCESS_DISPLAY_MS);
        } else {
            Alert.alert('Restore', result.error || 'No active subscription found');
        }
    };

    // ── Success State ──
    if (purchaseSuccess) {
        return (
            <View style={styles.container}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.centered}>
                        <Animated.View style={checkStyle}>
                            <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
                        </Animated.View>
                        <Animated.Text entering={FadeIn.delay(200).duration(400)} style={styles.successTitle}>
                            Welcome to Premium
                        </Animated.Text>
                        <Animated.Text entering={FadeIn.delay(400).duration(400)} style={styles.successSubtitle}>
                            Your health journey just leveled up
                        </Animated.Text>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // ── Loading State ──
    if (isLoading) {
        return (
            <View style={styles.container}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text style={styles.loadingText}>Loading plans...</Text>
                    </View>
                    <View style={styles.footerSimple}>
                        <TouchableOpacity onPress={markSeenAndNavigate} activeOpacity={0.7}>
                            <Text style={styles.notNowText}>Not now</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // ── Failed State ──
    if (hasFailed) {
        // Misconfig: SDK never initialized (missing API key in build, or config error).
        // Retry cannot help — guide the user toward reinstalling or contacting support.
        if (hasMisconfig) {
            return (
                <View style={styles.container}>
                    <SafeAreaView style={styles.safeArea}>
                        <View style={styles.centered}>
                            <View style={styles.failedCard}>
                                <View style={styles.failedIconContainer}>
                                    <Text style={styles.failedIcon}>⚙️</Text>
                                </View>
                                <Text style={styles.failedTitle}>Subscriptions unavailable</Text>
                                <Text style={styles.failedMessage}>
                                    This build can't connect to the subscription service. Please reinstall Gluco from the App Store, or contact support at tenzin@glucosolutions.ca.
                                </Text>
                                <TouchableOpacity
                                    style={styles.ctaButton}
                                    onPress={() => Linking.openURL('mailto:tenzin@glucosolutions.ca?subject=Gluco%20subscription%20issue')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.ctaButtonText}>Contact Support</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.footerSimple}>
                            <TouchableOpacity onPress={markSeenAndNavigate} activeOpacity={0.7}>
                                <Text style={styles.notNowText}>Not now</Text>
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </View>
            );
        }

        // Generic failure: offerings fetch failed (network, sandbox hiccup, etc.).
        // Retry is meaningful here.
        return (
            <View style={styles.container}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.centered}>
                        <View style={styles.failedCard}>
                            <View style={styles.failedIconContainer}>
                                <Text style={styles.failedIcon}>📡</Text>
                            </View>
                            <Text style={styles.failedTitle}>Couldn't load plans</Text>
                            <Text style={styles.failedMessage}>
                                This usually means your connection dropped. Give it another shot.
                            </Text>
                            <TouchableOpacity
                                style={[styles.ctaButton, retrying && styles.ctaButtonDisabled]}
                                onPress={handleRetry}
                                activeOpacity={0.7}
                                disabled={retrying}
                            >
                                {retrying ? (
                                    <ActivityIndicator size="small" color={Colors.buttonActionText} />
                                ) : (
                                    <Text style={styles.ctaButtonText}>Try Again</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.footerSimple}>
                        <TouchableOpacity onPress={markSeenAndNavigate} activeOpacity={0.7}>
                            <Text style={styles.notNowText}>Not now</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    const disclaimerPlanName = selectedPackage ? `${selectedPackage.product.title} — ${getPriceDetail(selectedPackage)}. ` : '';

    // ── Normal Paywall ──
    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                {/* Hero — centered, bold */}
                <View style={styles.heroSection}>
                    <Text style={styles.heroTitle}>Unlock Premium</Text>
                    <Text style={styles.heroSubtitle}>
                        Everything you need to understand{'\n'}your health, all in one place
                    </Text>
                </View>

                {/* Features — vertical list with checkmarks */}
                <View style={styles.featureList}>
                    {FEATURES.map(feature => (
                        <View key={feature} style={styles.featureRow}>
                            <View style={styles.featureCheck}>
                                <Ionicons name="checkmark" size={14} color="#fff" />
                            </View>
                            <Text style={styles.featureText}>{feature}</Text>
                        </View>
                    ))}
                </View>

                {/* Pricing + CTA + Legal — bottom section */}
                <View style={styles.bottomSection}>
                    {/* Pricing Cards */}
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
                                    ]}
                                    onPress={() => {
                                        triggerHaptic();
                                        setSelectedPackage(pkg);
                                    }}
                                    activeOpacity={0.8}
                                >
                                    {isAnnual && savingsText && (
                                        <View style={styles.savingsBadge}>
                                            <Text style={styles.savingsText}>{savingsText}</Text>
                                        </View>
                                    )}
                                    <View style={styles.priceCardInner}>
                                        <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                                            {isSelected && <View style={styles.radioInner} />}
                                        </View>
                                        <View style={styles.priceCardInfo}>
                                            <Text style={[styles.priceCardLabel, isSelected && styles.priceCardLabelSelected]}>
                                                {getPackageLabel(pkg)}
                                            </Text>
                                            <Text style={styles.priceCardPrice}>
                                                {getPriceDetail(pkg)}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* CTA Button */}
                    <TouchableOpacity
                        style={[styles.ctaButton, (!selectedPackage || purchasing) && styles.ctaButtonDisabled]}
                        onPress={handlePurchase}
                        activeOpacity={0.7}
                        disabled={!selectedPackage || purchasing}
                    >
                        {purchasing ? (
                            <ActivityIndicator size="small" color={Colors.buttonActionText} />
                        ) : (
                            <Text style={styles.ctaButtonText}>Continue</Text>
                        )}
                    </TouchableOpacity>

                    {/* Disclaimer */}
                    <Text style={styles.disclaimer}>
                        {disclaimerPlanName}Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. You can manage and cancel your subscriptions by going to your App Store account settings after purchase.
                    </Text>

                    {/* Restore + Legal + Not now */}
                    <View style={styles.legalRow}>
                        <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={styles.legalLink}>Restore</Text>
                        </TouchableOpacity>
                        <Text style={styles.legalDot}> · </Text>
                        <Text style={styles.legalLink} onPress={() => Linking.openURL(LEGAL_URLS.appleEula)}>
                            Terms
                        </Text>
                        <Text style={styles.legalDot}> · </Text>
                        <Text style={styles.legalLink} onPress={() => Linking.openURL(LEGAL_URLS.privacyPolicy)}>
                            Privacy
                        </Text>
                    </View>

                    <TouchableOpacity onPress={markSeenAndNavigate} activeOpacity={0.7} style={styles.notNowButton}>
                        <Text style={styles.notNowText}>Not now</Text>
                    </TouchableOpacity>

                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    safeArea: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },

    // ── Hero ──
    heroSection: {
        paddingTop: 16,
        paddingHorizontal: 28,
        alignItems: 'center',
    },
    heroTitle: {
        fontFamily: fonts.bold,
        fontSize: 32,
        color: Colors.textPrimary,
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    heroSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 23,
        marginTop: 8,
    },

    // ── Features ──
    featureList: {
        paddingHorizontal: 36,
        paddingVertical: 28,
        gap: 16,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    featureCheck: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    featureText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },

    // ── Bottom Section ──
    bottomSection: {
        paddingHorizontal: 24,
        paddingBottom: 0,
    },

    // ── Pricing ──
    pricing: {
        gap: 10,
        marginBottom: 16,
    },
    priceCard: {
        paddingVertical: 16,
        paddingHorizontal: 18,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.65)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    priceCardSelected: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderColor: Colors.primary,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 3,
    },
    priceCardInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    radioOuter: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: Colors.textMuted,
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioOuterSelected: {
        borderColor: Colors.primary,
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.primary,
    },
    priceCardInfo: {
        flex: 1,
    },
    priceCardLabel: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    priceCardLabelSelected: {
        color: Colors.textPrimary,
    },
    priceCardPrice: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    savingsBadge: {
        position: 'absolute',
        top: -9,
        right: 16,
        paddingVertical: 2,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: Colors.primary,
        zIndex: 1,
    },
    savingsText: {
        fontFamily: fonts.semiBold,
        fontSize: 11,
        color: '#fff',
        letterSpacing: 0.3,
    },

    // ── CTA ──
    ctaButton: {
        height: 54,
        borderRadius: 16,
        backgroundColor: Colors.buttonAction,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ctaButtonDisabled: {
        opacity: 0.5,
    },
    ctaButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: Colors.buttonActionText,
    },

    // ── Disclaimer ──
    disclaimer: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: Colors.textTertiary,
        textAlign: 'center',
        lineHeight: 14,
        marginTop: 12,
        paddingHorizontal: 4,
    },

    // ── Legal Row ──
    legalRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    legalLink: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        paddingVertical: 4,
        paddingHorizontal: 2,
    },
    legalDot: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },

    // ── Not Now ──
    notNowButton: {
        alignItems: 'center',
        paddingVertical: 12,
        marginTop: 4,
    },
    notNowText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textSecondary,
    },

    // ── Loading ──
    loadingText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textSecondary,
        marginTop: 16,
    },

    // ── Success ──
    successTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 26,
        color: Colors.textPrimary,
        marginTop: 20,
    },
    successSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textSecondary,
        marginTop: 8,
    },

    // ── Failed ──
    failedCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        borderRadius: 20,
        paddingVertical: 32,
        paddingHorizontal: 28,
        alignItems: 'center',
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 2,
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

    // ── Footer (loading/failed states) ──
    footerSimple: {
        alignItems: 'center',
        paddingBottom: 16,
        paddingTop: 12,
    },

});
