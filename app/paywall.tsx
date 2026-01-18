import { PAYWALL_SEEN_KEY } from '@/app/index';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Purchases, {
    PurchasesOfferings,
    PurchasesPackage,
} from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';

// Premium entitlement identifier from RevenueCat
const PREMIUM_ENTITLEMENT_ID = 'premium';

const FEATURES = [
    { icon: 'analytics-outline' as const, title: 'AI-Powered Insights' },
    { icon: 'pulse-outline' as const, title: 'Advanced Analytics' },
    { icon: 'notifications-outline' as const, title: 'Smart Reminders' },
    { icon: 'infinite-outline' as const, title: 'Unlimited Logging' },
];

export default function PaywallScreen() {
    const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
    const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);

    useEffect(() => {
        getOfferings();
    }, []);

    async function getOfferings() {
        try {
            const offerings = await Purchases.getOfferings();
            console.log('📢 offerings', JSON.stringify(offerings, null, 2));

            if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
                setOfferings(offerings);
                const annualPkg = offerings.current.availablePackages.find(
                    (pkg) => pkg.packageType === 'ANNUAL'
                );
                const monthlyPkg = offerings.current.availablePackages.find(
                    (pkg) => pkg.packageType === 'MONTHLY'
                );
                setSelectedPackage(annualPkg || monthlyPkg || offerings.current.availablePackages[0] || null);
            }
        } catch (error) {
            console.error('📢 Error fetching offerings:', error);
        } finally {
            setLoading(false);
        }
    }

    const handlePurchase = async () => {
        if (!selectedPackage) return;

        setIsPurchasing(true);
        try {
            const { customerInfo } = await Purchases.purchasePackage(selectedPackage);

            // Log for debugging
            console.log('📢 Purchase complete, customerInfo:', JSON.stringify(customerInfo, null, 2));
            console.log('📢 Active entitlements:', Object.keys(customerInfo.entitlements.active));

            // Mark paywall as seen and navigate
            // In sandbox/StoreKit testing, entitlements may not work correctly
            await AsyncStorage.setItem(PAYWALL_SEEN_KEY, 'true');
            router.replace('/(tabs)');
        } catch (error: unknown) {
            const purchaseError = error as { userCancelled?: boolean; message?: string };
            console.log('📢 Purchase error:', error);
            if (!purchaseError.userCancelled) {
                Alert.alert('Purchase Failed', purchaseError.message || 'Please try again.');
            }
        } finally {
            setIsPurchasing(false);
        }
    };

    const handleRestore = async () => {
        setIsRestoring(true);
        try {
            const customerInfo = await Purchases.restorePurchases();

            if (typeof customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== 'undefined') {
                await AsyncStorage.setItem(PAYWALL_SEEN_KEY, 'true');
                Alert.alert('Success', 'Your subscription has been restored!', [
                    { text: 'Continue', onPress: () => router.replace('/(tabs)') },
                ]);
            } else {
                Alert.alert('Restore Failed', 'No active subscription found.');
            }
        } catch (error: unknown) {
            const restoreError = error as { message?: string };
            Alert.alert('Restore Failed', restoreError.message || 'Please try again.');
        } finally {
            setIsRestoring(false);
        }
    };

    const handleSkip = async () => {
        await AsyncStorage.setItem(PAYWALL_SEEN_KEY, 'true');
        router.replace('/(tabs)');
    };

    const handleDevReset = async () => {
        if (!__DEV__) return;
        try {
            await AsyncStorage.removeItem(PAYWALL_SEEN_KEY);
            await Purchases.logOut();
            Alert.alert(
                'Dev Reset Complete',
                'App data cleared.\n\nTo fully reset subscription:\n1. Xcode: Debug → StoreKit → Manage Transactions\n2. Delete all transactions\n3. Restart app',
                [{ text: 'OK' }]
            );
        } catch (error) {
            Alert.alert('Reset Error', String(error));
        }
    };

    const formatPrice = (pkg: PurchasesPackage) => {
        const price = pkg.product.priceString;
        if (pkg.packageType === 'ANNUAL') return `${price}/year`;
        if (pkg.packageType === 'MONTHLY') return `${price}/month`;
        return price;
    };

    const getPackageLabel = (pkg: PurchasesPackage) => {
        if (pkg.packageType === 'ANNUAL') return 'Annual';
        if (pkg.packageType === 'MONTHLY') return 'Monthly';
        return pkg.product.title || pkg.identifier;
    };

    return (
        <View style={styles.container}>
            <ImageBackground
                source={require('../assets/images/backgrounds/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    {/* Skip Button */}
                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={handleSkip}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.skipButtonText}>Maybe Later</Text>
                    </TouchableOpacity>

                    {/* Main Content */}
                    <View style={styles.content}>
                        {/* Hero Section - Compact */}
                        <View style={styles.heroSection}>
                            <View style={styles.iconContainer}>
                                <Ionicons name="diamond" size={36} color={Colors.buttonPrimary} />
                            </View>
                            <Text style={styles.heroTitle}>Unlock Premium</Text>
                            <Text style={styles.heroSubtitle}>
                                Get personalized insights for your health journey
                            </Text>
                        </View>

                        {/* Features - Compact Grid */}
                        <View style={styles.featuresContainer}>
                            {FEATURES.map((feature, index) => (
                                <View key={index} style={styles.featureItem}>
                                    <Ionicons
                                        name={feature.icon}
                                        size={18}
                                        color={Colors.buttonPrimary}
                                    />
                                    <Text style={styles.featureTitle}>{feature.title}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Subscription Options */}
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={Colors.buttonPrimary} />
                            </View>
                        ) : offerings?.current?.availablePackages && offerings.current.availablePackages.length > 0 ? (
                            <View style={styles.packagesContainer}>
                                {offerings.current.availablePackages.map((pkg) => {
                                    const isSelected = selectedPackage?.identifier === pkg.identifier;

                                    return (
                                        <TouchableOpacity
                                            key={pkg.identifier}
                                            style={[
                                                styles.packageItem,
                                                isSelected && styles.packageItemSelected,
                                            ]}
                                            onPress={() => setSelectedPackage(pkg)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.packageContent}>
                                                <Text style={styles.packageLabel}>
                                                    {getPackageLabel(pkg)}
                                                </Text>
                                                <Text style={styles.packagePrice}>
                                                    {formatPrice(pkg)}
                                                </Text>
                                            </View>
                                            <View
                                                style={[
                                                    styles.radioOuter,
                                                    isSelected && styles.radioOuterSelected,
                                                ]}
                                            >
                                                {isSelected && <View style={styles.radioInner} />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ) : (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>
                                    Unable to load subscription options.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Bottom Buttons */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[
                                styles.purchaseButton,
                                (!selectedPackage || isPurchasing) && styles.purchaseButtonDisabled,
                            ]}
                            onPress={handlePurchase}
                            activeOpacity={0.8}
                            disabled={!selectedPackage || isPurchasing}
                        >
                            {isPurchasing ? (
                                <ActivityIndicator color={Colors.textPrimary} />
                            ) : (
                                <Text style={styles.purchaseButtonText}>Continue</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.restoreButton}
                            onPress={handleRestore}
                            activeOpacity={0.7}
                            disabled={isRestoring}
                        >
                            {isRestoring ? (
                                <ActivityIndicator size="small" color="#878787" />
                            ) : (
                                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
                            )}
                        </TouchableOpacity>

                        {__DEV__ && (
                            <TouchableOpacity
                                style={styles.devResetButton}
                                onPress={handleDevReset}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.devResetButtonText}>🔧 Dev Reset</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </SafeAreaView>
            </ImageBackground>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: 20,
    },
    skipButton: {
        alignSelf: 'flex-end',
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    skipButtonText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#878787',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(40, 94, 42, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    heroTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 24,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 6,
    },
    heroSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        textAlign: 'center',
        maxWidth: 280,
    },
    featuresContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: 24,
        gap: 8,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(40, 94, 42, 0.15)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        gap: 6,
    },
    featureTitle: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.textPrimary,
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    packagesContainer: {
        gap: 10,
    },
    packageItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    packageItemSelected: {
        backgroundColor: 'rgba(40, 94, 42, 0.3)',
        borderColor: Colors.buttonPrimary,
    },
    packageContent: {
        flex: 1,
    },
    packageLabel: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    packagePrice: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
    },
    radioOuter: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#878787',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioOuterSelected: {
        borderColor: Colors.buttonPrimary,
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.buttonPrimary,
    },
    errorContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    errorText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    buttonContainer: {
        paddingBottom: 16,
    },
    purchaseButton: {
        width: '100%',
        height: 50,
        backgroundColor: Colors.buttonPrimary,
        borderWidth: 1,
        borderColor: Colors.buttonBorder,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    purchaseButtonDisabled: {
        opacity: 0.6,
    },
    purchaseButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    restoreButton: {
        width: '100%',
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    restoreButtonText: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#878787',
    },
    devResetButton: {
        width: '100%',
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 4,
        backgroundColor: 'rgba(255, 100, 100, 0.2)',
        borderRadius: 8,
    },
    devResetButtonText: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#ff6464',
    },
});
