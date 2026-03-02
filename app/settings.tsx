import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Purchases from 'react-native-purchases';

import { PAYWALL_ENABLED } from '@/app/index';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
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
            {!isLogout && (
                <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={Colors.textTertiary}
                />
            )}
        </AnimatedPressable>
    );

    return (
        <View style={styles.container}>
            <View style={styles.safeArea}>
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
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    safeArea: {
        flex: 1,
    },
    settingsCard: {
        marginHorizontal: 16,
        marginTop: 16,
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
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
        color: Colors.textPrimary,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.borderCard,
        marginHorizontal: 20,
    },
    logoutCard: {
        marginHorizontal: 16,
        marginTop: 24,
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        overflow: 'hidden',
    },
    logoutLabel: {
        color: Colors.buttonDestructive,
    },
});
