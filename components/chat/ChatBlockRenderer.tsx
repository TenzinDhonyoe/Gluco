import type { ChatBlock } from '@/hooks/useChat';
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MetricChatCard } from './cards/MetricChatCard';
import { MealSummaryChatCard } from './cards/MealSummaryChatCard';
import { ScoreRingChatCard } from './cards/ScoreRingChatCard';
import { StreakChatCard } from './cards/StreakChatCard';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';

interface ChatBlockRendererProps {
    blocks?: ChatBlock[];
}

function renderBlock(block: ChatBlock, index: number): React.ReactNode {
    try {
        switch (block.type) {
            case 'metric_card':
                return (
                    <MetricChatCard
                        metric={block.data.metric as string}
                        icon={block.data.icon as string}
                        label={block.data.label as string}
                        value={block.data.value as string}
                        unit={block.data.unit as string}
                        color={block.data.color as string}
                        history={block.data.history as (number | null)[]}
                    />
                );
            case 'meal_summary':
                return (
                    <MealSummaryChatCard
                        meals={block.data.meals as MealSummaryData['meals']}
                    />
                );
            case 'score_ring':
                return (
                    <ScoreRingChatCard
                        score={block.data.score as number}
                        trend={block.data.trend as 'up' | 'down' | 'stable' | null}
                        components={block.data.components as ScoreRingData['components']}
                    />
                );
            case 'streak':
                return (
                    <StreakChatCard
                        days={block.data.days as number}
                        mealsLogged={block.data.meals_logged as number}
                    />
                );
            default:
                // Unknown block type — render fallback text
                return (
                    <View style={styles.fallback}>
                        <Text style={styles.fallbackText}>{block.fallback_text}</Text>
                    </View>
                );
        }
    } catch {
        // Render error silently with fallback
        return (
            <View style={styles.fallback}>
                <Text style={styles.fallbackText}>{block.fallback_text}</Text>
            </View>
        );
    }
}

export function ChatBlockRenderer({ blocks }: ChatBlockRendererProps) {
    if (!blocks || blocks.length === 0) return null;

    return (
        <View style={styles.container}>
            {blocks.map((block, index) => (
                <Animated.View
                    key={`${block.type}-${index}`}
                    entering={FadeInDown.duration(200).delay(index * 80)}
                >
                    {renderBlock(block, index)}
                </Animated.View>
            ))}
        </View>
    );
}

// Type helpers for the renderBlock switch
interface MealSummaryData {
    meals: {
        name: string;
        meal_type: string | null;
        logged_at: string;
        calories: number | null;
        protein_g: number | null;
        carbs_g: number | null;
        fiber_g: number | null;
    }[];
}

interface ScoreRingData {
    components: {
        rhr: number | null;
        steps: number | null;
        sleep: number | null;
        hrv: number | null;
    } | null;
}

const styles = StyleSheet.create({
    container: {
        marginTop: 6,
        gap: 6,
    },
    fallback: {
        borderRadius: 16,
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.10)',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    fallbackText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
    },
});
