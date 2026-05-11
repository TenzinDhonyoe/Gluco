/**
 * SyncErrorBanner
 *
 * Shows recent data-sync errors recorded via useDataSync(). Without this,
 * failures end at console.warn and the user just sees empty cards. Tap to
 * retry; the retry handler is provided by the consumer (typically calls the
 * home screen's onRefresh).
 */

import { Colors } from '@/constants/Colors';
import { useDataSync } from '@/context/DataSyncContext';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
    onRetry?: () => void;
}

export function SyncErrorBanner({ onRetry }: Props) {
    const { errors, clearAll } = useDataSync();

    if (errors.length === 0) return null;

    // Summarize: show the first error's scope + total count if more.
    const first = errors[0];
    const moreCount = errors.length - 1;
    const title = moreCount > 0
        ? `Sync issues (${errors.length})`
        : `Couldn't sync ${first.scope}`;

    const handleRetry = () => {
        clearAll();
        onRetry?.();
    };

    return (
        <View style={styles.banner}>
            <Ionicons name="cloud-offline-outline" size={20} color={Colors.error} />
            <View style={styles.content}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle} numberOfLines={2}>
                    {first.message}
                </Text>
            </View>
            {onRetry ? (
                <Pressable onPress={handleRetry} style={styles.retryButton} hitSlop={8}>
                    <Text style={styles.retryText}>Retry</Text>
                </Pressable>
            ) : (
                <Pressable onPress={clearAll} hitSlop={12}>
                    <Ionicons name="close" size={18} color={Colors.textTertiary} />
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.errorLight,
        borderColor: Colors.error,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 10,
        marginHorizontal: 16,
        marginTop: 8,
    },
    content: {
        flex: 1,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: Colors.error,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 11,
        lineHeight: 14,
        color: Colors.textSecondary,
        marginTop: 1,
    },
    retryButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: Colors.error,
    },
    retryText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        color: '#FFFFFF',
    },
});
