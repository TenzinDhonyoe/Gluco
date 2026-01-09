import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

    const menuItems: SettingsItem[] = [
        { label: 'Account & Privacy', onPress: () => router.push('/account-privacy' as never) },
        { label: 'Data Sources', onPress: () => router.push('/data-sources' as never) },
        { label: 'Customization', onPress: () => router.push('/customization') },
        { label: 'Notifications', onPress: () => router.push('/notification-settings' as never) },
        { label: 'Lab & Health Info', onPress: () => router.push('/labs-health-info' as never) },
    ];

    const legalItems: SettingsItem[] = [
        { label: 'Privacy Policy', onPress: () => Linking.openURL(LEGAL_URLS.privacyPolicy) },
        { label: 'Terms of Service', onPress: () => Linking.openURL(LEGAL_URLS.termsAndConditions) },
    ];

    const SettingsRow = ({ label, onPress, isLogout }: SettingsItem) => (
        <TouchableOpacity
            style={styles.settingsRow}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[styles.settingsLabel, isLogout && styles.logoutLabel]}>
                {label}
            </Text>
            <Ionicons
                name="chevron-forward"
                size={16}
                color="#E7E8E9"
            />
        </TouchableOpacity>
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
                    <TouchableOpacity style={styles.closeButton} onPress={handleClose} activeOpacity={0.7}>
                        <Ionicons name="close" size={20} color="#E7E8E9" />
                    </TouchableOpacity>
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
