import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface WeeklyDayTrackerProps {
    startDate: Date;
    totalDays: number;
    completedDates: string[]; // ISO date strings (YYYY-MM-DD)
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAYS_PER_ROW = 7;

function toDateKey(d: Date): string {
    return d.toISOString().split('T')[0];
}

interface DayInfo {
    letter: string;
    dayNumber: number;
    isCompleted: boolean;
    isToday: boolean;
    isPast: boolean;
}

export function WeeklyDayTracker({ startDate, totalDays, completedDates }: WeeklyDayTrackerProps) {
    const rows = useMemo(() => {
        const completedSet = new Set(completedDates);
        const today = toDateKey(new Date());
        const allDays: DayInfo[] = [];

        for (let i = 0; i < totalDays; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateKey = toDateKey(date);
            const dayOfWeek = date.getDay(); // 0=Sun

            allDays.push({
                letter: DAY_LETTERS[dayOfWeek],
                dayNumber: i + 1,
                isCompleted: completedSet.has(dateKey),
                isToday: dateKey === today,
                isPast: dateKey < today,
            });
        }

        // Chunk into rows of 7
        const chunked: DayInfo[][] = [];
        for (let i = 0; i < allDays.length; i += DAYS_PER_ROW) {
            chunked.push(allDays.slice(i, i + DAYS_PER_ROW));
        }
        return chunked;
    }, [startDate, totalDays, completedDates]);

    return (
        <View style={styles.container}>
            {rows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                    {row.map((day, index) => {
                        const isActive = day.isCompleted || day.isToday;
                        return (
                            <View key={index} style={styles.dayColumn}>
                                <Text style={[styles.dayLetter, isActive && styles.dayLetterActive]}>
                                    {day.letter}
                                </Text>
                                <View
                                    style={[
                                        styles.circle,
                                        day.isCompleted && styles.circleCompleted,
                                        day.isToday && !day.isCompleted && styles.circleToday,
                                        day.isPast && !day.isCompleted && styles.circleMissed,
                                        !day.isPast && !day.isToday && !day.isCompleted && styles.circleFuture,
                                    ]}
                                >
                                    {day.isCompleted ? (
                                        <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                                    ) : (
                                        <Text
                                            style={[
                                                styles.dayNumber,
                                                day.isToday && styles.dayNumberToday,
                                                (day.isPast || (!day.isToday && !day.isPast)) && styles.dayNumberMuted,
                                            ]}
                                        >
                                            {day.dayNumber}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                    {/* Pad last row with empty spacers so items stay left-aligned at consistent width */}
                    {row.length < DAYS_PER_ROW &&
                        Array.from({ length: DAYS_PER_ROW - row.length }).map((_, i) => (
                            <View key={`pad-${i}`} style={styles.dayColumn} />
                        ))}
                </View>
            ))}
        </View>
    );
}

const CIRCLE_SIZE = 38;

const styles = StyleSheet.create({
    container: {
        gap: 14,
        paddingVertical: 4,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    dayColumn: {
        width: CIRCLE_SIZE + 4,
        alignItems: 'center',
        gap: 5,
    },
    dayLetter: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: Colors.textTertiary,
        textTransform: 'uppercase',
    },
    dayLetterActive: {
        color: Colors.primary,
        fontFamily: fonts.bold,
    },
    circle: {
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        borderRadius: CIRCLE_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleCompleted: {
        backgroundColor: Colors.primary,
    },
    circleToday: {
        borderWidth: 2,
        borderColor: Colors.primary,
        backgroundColor: 'rgba(45, 212, 191, 0.06)',
    },
    circleMissed: {
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
    circleFuture: {
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
    },
    dayNumber: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    dayNumberToday: {
        color: Colors.primary,
        fontFamily: fonts.bold,
    },
    dayNumberMuted: {
        color: Colors.textTertiary,
    },
});
