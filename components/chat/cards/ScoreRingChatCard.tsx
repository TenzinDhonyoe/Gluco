import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { MetabolicScoreRing } from '@/components/charts/MetabolicScoreRing';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ScoreRingChatCardProps {
    score: number;
    trend: 'up' | 'down' | 'stable' | null;
    components: {
        rhr: number | null;
        steps: number | null;
        sleep: number | null;
        hrv: number | null;
    } | null;
}

const TREND_CONFIG: Record<string, { label: string; color: string }> = {
    up: { label: 'Trending up', color: Colors.success },
    down: { label: 'Trending down', color: Colors.warning },
    stable: { label: 'Stable', color: Colors.textTertiary },
};

export function ScoreRingChatCard({ score, trend, components }: ScoreRingChatCardProps) {
    const trendInfo = trend ? TREND_CONFIG[trend] : null;

    const componentParts: string[] = [];
    if (components) {
        if (components.rhr !== null) componentParts.push(`RHR ${components.rhr}`);
        if (components.steps !== null) componentParts.push(`Steps ${components.steps}`);
        if (components.sleep !== null) componentParts.push(`Sleep ${components.sleep}`);
        if (components.hrv !== null) componentParts.push(`HRV ${components.hrv}`);
    }

    return (
        <View style={styles.card}>
            <MetabolicScoreRing size={48} score={score} />

            <View style={styles.info}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Metabolic Score</Text>
                    {trendInfo && (
                        <View style={[styles.trendPill, { backgroundColor: trendInfo.color + '18' }]}>
                            <Text style={[styles.trendText, { color: trendInfo.color }]}>
                                {trendInfo.label}
                            </Text>
                        </View>
                    )}
                </View>
                {componentParts.length > 0 && (
                    <Text style={styles.components} numberOfLines={1}>
                        {componentParts.join(' · ')}
                    </Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.10)',
        padding: 12,
        gap: 12,
    },
    info: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    trendPill: {
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    trendText: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },
    components: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        marginTop: 2,
    },
});
