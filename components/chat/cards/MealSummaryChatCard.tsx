import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface MealData {
    name: string;
    meal_type: string | null;
    logged_at: string;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fiber_g: number | null;
}

interface MealSummaryChatCardProps {
    meals: MealData[];
}

const MEAL_EMOJI: Record<string, string> = {
    breakfast: '\u{1F373}',  // 🍳
    lunch: '\u{1F96A}',      // 🥪
    dinner: '\u{1F35D}',     // 🍝
    snack: '\u{1F34E}',      // 🍎
};

function formatTime(isoString: string): string {
    try {
        const d = new Date(isoString);
        const h = d.getHours();
        const m = d.getMinutes().toString().padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour = h % 12 || 12;
        return `${hour}:${m} ${ampm}`;
    } catch {
        return '';
    }
}

function MealRow({ meal }: { meal: MealData }) {
    const emoji = MEAL_EMOJI[meal.meal_type ?? ''] ?? '\u{1F37D}\u{FE0F}';  // 🍽️
    const time = formatTime(meal.logged_at);

    const macroParts: string[] = [];
    if (meal.calories !== null) macroParts.push(`${Math.round(meal.calories)} cal`);
    if (meal.protein_g !== null) macroParts.push(`${Math.round(meal.protein_g)}g P`);

    return (
        <View style={styles.mealRow}>
            <View style={styles.emojiCircle}>
                <Text style={styles.emoji}>{emoji}</Text>
            </View>
            <View style={styles.mealInfo}>
                <Text style={styles.mealName} numberOfLines={1}>{meal.name}</Text>
                <Text style={styles.mealMeta}>
                    {time}{macroParts.length > 0 ? ` · ${macroParts.join(', ')}` : ''}
                </Text>
            </View>
        </View>
    );
}

export function MealSummaryChatCard({ meals }: MealSummaryChatCardProps) {
    if (meals.length === 0) return null;

    const totalCals = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0);

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.headerText}>Today's Meals</Text>
                {totalCals > 0 && (
                    <Text style={styles.totalCals}>{Math.round(totalCals)} cal</Text>
                )}
            </View>
            {meals.map((meal, i) => (
                <React.Fragment key={`${meal.logged_at}-${i}`}>
                    {i > 0 && <View style={styles.separator} />}
                    <MealRow meal={meal} />
                </React.Fragment>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        backgroundColor: Colors.backgroundCardGlass,
        borderWidth: 1,
        borderColor: 'rgba(60, 60, 67, 0.10)',
        padding: 12,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    headerText: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    totalCals: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    mealRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 4,
    },
    emojiCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: Colors.mealLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emoji: {
        fontSize: 14,
    },
    mealInfo: {
        flex: 1,
    },
    mealName: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    mealMeta: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        marginTop: 1,
    },
    separator: {
        height: 1,
        backgroundColor: Colors.borderLight,
        marginVertical: 4,
    },
});
