import { PAYWALL_SEEN_KEY } from '@/app/index';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

export default function PaywallScreen() {
    const markSeenAndNavigate = async () => {
        await AsyncStorage.setItem(PAYWALL_SEEN_KEY, 'true');
        router.replace('/(tabs)');
    };

    const handleDevReset = async () => {
        if (!__DEV__) return;
        triggerHaptic();
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

    return (
        <View style={styles.container}>
            <RevenueCatUI.Paywall
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
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
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
