import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import type { MealWithCheckin } from '@/lib/supabase';
import { computeMealScore, getCheckinStatus, getMealEmoji, formatRelativeTime } from '@/lib/utils/mealScore';

interface TodayMealCheckinsListProps {
    meals: MealWithCheckin[];
    onMealPress: (meal: MealWithCheckin) => void;
    onViewAllPress: () => void;
}

function MealCheckinRow({ meal, onPress }: { meal: MealWithCheckin; onPress: () => void }) {
    const hasCheckin = meal.meal_checkins && meal.meal_checkins.length > 0;
    const score = computeMealScore(meal);
    const status = getCheckinStatus(meal);
    const emoji = getMealEmoji(meal.meal_type);
    const relativeTime = formatRelativeTime(meal.logged_at);

    return (
        <AnimatedPressable style={styles.mealRow} onPress={onPress}>
            <View style={styles.emojiCircle}>
                <Text style={styles.emojiText}>{emoji}</Text>
            </View>

            <View style={styles.centerColumn}>
                <Text style={styles.mealName} numberOfLines={1}>{meal.name}</Text>
                <View style={styles.statusRow}>
                    {status && (
                        <View style={[styles.statusPill, { backgroundColor: status.bgColor }]}>
                            <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
                        </View>
                    )}
                    <Text style={styles.timeText}>Logged {relativeTime}</Text>
                </View>
            </View>

            <View style={styles.rightColumn}>
                {hasCheckin && score != null ? (
                    <>
                        <Text style={styles.scoreValue}>{score % 1 === 0 ? score : score.toFixed(1)}/10</Text>
                        <Text style={styles.scoreLabel}>Score</Text>
                    </>
                ) : (
                    <View style={styles.checkinButton}>
                        <Text style={styles.checkinButtonText}>Check in</Text>
                    </View>
                )}
            </View>
        </AnimatedPressable>
    );
}

export function TodayMealCheckinsList({ meals, onMealPress, onViewAllPress }: TodayMealCheckinsListProps) {
    return (
        <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>MEAL CHECK-INS</Text>

            <View style={styles.cardContainer}>
                {meals.length > 0 ? (
                    meals.map((meal, index) => (
                        <React.Fragment key={meal.id}>
                            {index > 0 && <View style={styles.separator} />}
                            <MealCheckinRow meal={meal} onPress={() => onMealPress(meal)} />
                        </React.Fragment>
                    ))
                ) : (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="restaurant-outline" size={32} color={Colors.textTertiary} />
                        <Text style={styles.emptyTitle}>No meals logged yet</Text>
                        <Text style={styles.emptySubtitle}>Log a meal to track how you feel</Text>
                    </View>
                )}
            </View>

            <AnimatedPressable style={styles.viewAllButton} onPress={onViewAllPress}>
                <Text style={styles.viewAllText}>View all meal logs</Text>
            </AnimatedPressable>
        </View>
    );
}

const styles = StyleSheet.create({
    sectionContainer: {
        marginBottom: 14,
    },
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 10,
    },
    cardContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    mealRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    separator: {
        height: 1,
        backgroundColor: Colors.borderLight,
        marginLeft: 72,
    },
    emojiCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.mealLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    emojiText: {
        fontSize: 22,
    },
    centerColumn: {
        flex: 1,
        gap: 3,
    },
    mealName: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusPill: {
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    statusPillText: {
        fontFamily: fonts.semiBold,
        fontSize: 11,
    },
    timeText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    rightColumn: {
        alignItems: 'center',
        marginLeft: 12,
    },
    scoreValue: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
    },
    scoreLabel: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textTertiary,
    },
    checkinButton: {
        backgroundColor: '#1C1C1E',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    checkinButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 13,
        color: '#FFFFFF',
    },
    viewAllButton: {
        alignSelf: 'center',
        marginTop: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 24,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
        elevation: 1,
    },
    viewAllText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    emptyContainer: {
        paddingVertical: 32,
        alignItems: 'center',
        gap: 8,
    },
    emptyTitle: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    emptySubtitle: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
        textAlign: 'center',
    },
});
