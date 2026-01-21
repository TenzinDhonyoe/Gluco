import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Purchases from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PAYWALL_ENABLED } from '@/app/index';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';

type SettingsItem = {
    label: string;
    onPress?: () => void;
    isLogout?: boolean;
};

export default function SettingsScreen() {
    const router = useRouter();
    const { signOut } = useAuth();

    const handleLogout = async () => {
        Alert.alert(
            'Log Out',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: async () => {
                        await signOut();
                        router.replace('/');
                    },
                },
            ]
        );
    };

    const handleClose = () => {
        router.back();
    };

    const handleManageSubscription = async () => {
        try {
            if (Platform.OS === 'ios') {
                // RevenueCat provides a method to show Apple's subscription management
                await Purchases.showManageSubscriptions();
            } else {
                // For Android, open Play Store subscriptions
                Linking.openURL('https://play.google.com/store/account/subscriptions');
            }
        } catch (error) {
            console.log('Error opening subscription management:', error);
            // Fallback: Open iOS subscription settings URL
            if (Platform.OS === 'ios') {
                Linking.openURL('https://apps.apple.com/account/subscriptions');
            }
        }
    };

    const menuItems: SettingsItem[] = [
        { label: 'Account & Privacy', onPress: () => router.push('/account-privacy' as never) },
        // Only show Manage Subscription when paywall is enabled
        ...(PAYWALL_ENABLED ? [{ label: 'Manage Subscription', onPress: handleManageSubscription }] : []),
        { label: 'Data Sources', onPress: () => router.push('/data-sources' as never) },
        { label: 'Customization', onPress: () => router.push('/customization') },
        { label: 'Notifications', onPress: () => router.push('/notification-settings' as never) },
    ];

    const legalItems: SettingsItem[] = [
        { label: 'Privacy Policy', onPress: () => Linking.openURL(LEGAL_URLS.privacyPolicy) },
        { label: 'Terms of Service', onPress: () => Linking.openURL(LEGAL_URLS.termsAndConditions) },
    ];

    const SettingsRow = ({ label, onPress, isLogout }: SettingsItem) => (
        <AnimatedPressable
            style={styles.settingsRow}
            onPress={onPress}
        >
            <Text style={[styles.settingsLabel, isLogout && styles.logoutLabel]}>
                {label}
            </Text>
            <Ionicons
                name="chevron-forward"
                size={16}
                color="#E7E8E9"
            />
        </AnimatedPressable>
    );

    return (
        <View style={styles.container}>
            {/* Background gradient that matches Today tab */}
            <LinearGradient
                colors={['#1a1f24', '#181c20', '#111111']}
                locations={[0, 0.3, 1]}
                style={styles.backgroundGradient}
            />

            <SafeAreaView style={styles.safeArea} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <LiquidGlassIconButton size={44} onPress={handleClose}>
                        <Ionicons name="close" size={20} color="#E7E8E9" />
                    </LiquidGlassIconButton>
                    <Text style={styles.headerTitle}>SETTINGS</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Main Settings Card */}
                <View style={styles.settingsCard}>
                    {menuItems.map((item, index) => (
                        <React.Fragment key={item.label}>
                            <SettingsRow {...item} />
                            {index < menuItems.length - 1 && <View style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </View>

                {/* Legal Card */}
                <View style={styles.settingsCard}>
                    {legalItems.map((item, index) => (
                        <React.Fragment key={item.label}>
                            <SettingsRow {...item} />
                            {index < legalItems.length - 1 && <View style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </View>

                {/* Logout Card */}
                <View style={styles.logoutCard}>
                    <SettingsRow
                        label="Logout"
                        onPress={handleLogout}
                        isLogout
                    />
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    backgroundGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 280,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    closeButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: '#FFFFFF',
        letterSpacing: 2,
    },
    headerSpacer: {
        width: 48,
    },
    settingsCard: {
        marginHorizontal: 16,
        marginTop: 16,
        backgroundColor: '#1A1D1F',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#2A2D30',
        overflow: 'hidden',
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 20,
    },
    settingsLabel: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#FFFFFF',
    },
    divider: {
        height: 1,
        backgroundColor: '#2A2D30',
        marginHorizontal: 20,
    },
    logoutCard: {
        marginHorizontal: 16,
        marginTop: 24,
        backgroundColor: '#1A1D1F',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#2A2D30',
        overflow: 'hidden',
    },
    logoutLabel: {
        color: '#F14F4F',
    },
});
