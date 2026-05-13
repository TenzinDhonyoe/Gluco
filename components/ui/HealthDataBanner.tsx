/**
 * HealthDataBanner
 *
 * Surfaces "we can't read your Apple Health data" when sync completed but
 * returned zero of everything — almost always means the user denied permissions
 * in the iOS sheet or revoked them in Settings. iOS hides that fact from apps,
 * so the only way to recover is to send the user to Settings manually.
 *
 * Dismissible. Re-shows after 7 days so it doesn't nag forever but does come
 * back if the issue persists.
 */

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const DISMISS_KEY_PREFIX = 'health_banner_dismissed_at:';
const REDISPLAY_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface Props {
    permissionLikelyDenied: boolean;
    isAuthorized: boolean;
    daysWithData: number;
    trackingMode: string | null | undefined;
}

export function HealthDataBanner({
    permissionLikelyDenied,
    isAuthorized,
    daysWithData,
    trackingMode,
}: Props) {
    const { user } = useAuth();
    const [dismissed, setDismissed] = useState(true); // start dismissed until we check
    const dismissKey = user?.id ? `${DISMISS_KEY_PREFIX}${user.id}` : null;

    useEffect(() => {
        if (!dismissKey) return;
        AsyncStorage.getItem(dismissKey).then((val) => {
            if (!val) {
                setDismissed(false);
                return;
            }
            const dismissedAt = Number(val);
            if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < REDISPLAY_AFTER_MS) {
                setDismissed(true);
            } else {
                setDismissed(false);
            }
        });
    }, [dismissKey]);

    const shouldShow =
        Platform.OS === 'ios' &&
        !dismissed &&
        isAuthorized &&
        permissionLikelyDenied &&
        daysWithData === 0 &&
        (trackingMode === 'meals_wearables' || trackingMode === 'wearables_only');

    if (!shouldShow) return null;

    const handleOpenSettings = () => {
        Linking.openURL('app-settings:').catch(() => {});
    };

    const handleDismiss = async () => {
        setDismissed(true);
        if (dismissKey) {
            await AsyncStorage.setItem(dismissKey, String(Date.now())).catch(() => null);
        }
    };

    return (
        <Pressable style={styles.banner} onPress={handleOpenSettings}>
            <View style={styles.iconContainer}>
                <Ionicons name="heart-circle-outline" size={28} color={Colors.warning} />
            </View>
            <View style={styles.content}>
                <Text style={styles.title}>Can&apos;t read your Health data</Text>
                <Text style={styles.subtitle}>
                    Tap to open Settings → Privacy & Security → Health → Redu and allow reading.
                </Text>
            </View>
            <Pressable
                onPress={handleDismiss}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
            >
                <Ionicons name="close" size={20} color={Colors.textTertiary} />
            </Pressable>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.backgroundCardGlass,
        borderColor: Colors.warning,
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 12,
        marginHorizontal: 16,
        marginTop: 12,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 179, 128, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 16,
        color: Colors.textSecondary,
    },
});
