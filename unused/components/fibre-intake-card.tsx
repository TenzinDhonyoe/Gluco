import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Thresholds based on Canada DV (25g/day target)
const TARGET_FIBRE_G_PER_DAY = 25;
const LOW_THRESHOLD = TARGET_FIBRE_G_PER_DAY * 0.5; // < 12.5g
const MODERATE_THRESHOLD = TARGET_FIBRE_G_PER_DAY; // < 25g

export type FibreStatus = 'low' | 'moderate' | 'high';

export function getFibreStatus(avgPerDay: number): FibreStatus {
    if (avgPerDay < LOW_THRESHOLD) return 'low';
    if (avgPerDay < MODERATE_THRESHOLD) return 'moderate';
    return 'high';
}

interface FibreIntakeCardProps {
    avgPerDay: number;
    daysLabel: string;
    isLoading?: boolean;
}

export function FibreIntakeCard({ avgPerDay, daysLabel, isLoading }: FibreIntakeCardProps) {
    const status = getFibreStatus(avgPerDay);

    const getStatusColor = () => {
        switch (status) {
            case 'high':
                return Colors.success;
            case 'moderate':
                return Colors.warning;
            case 'low':
                return Colors.error;
        }
    };

    const getStatusLabel = () => {
        switch (status) {
            case 'high':
                return 'High';
            case 'moderate':
                return 'Moderate';
            case 'low':
                return 'Low';
        }
    };

    const statusColor = getStatusColor();

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.title}>Fibre Intake</Text>
                <View style={[styles.statusPill, { backgroundColor: statusColor + '25' }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                        {getStatusLabel()}
                    </Text>
                </View>
            </View>

            <View style={styles.valueContainer}>
                {isLoading ? (
                    <Text style={styles.valueText}>--</Text>
                ) : (
                    <Text style={styles.valueText}>
                        {avgPerDay.toFixed(1)}
                        <Text style={styles.unitText}> g/day</Text>
                    </Text>
                )}
            </View>

            <Text style={styles.subtext}>
                Based on {daysLabel}
            </Text>

            {avgPerDay === 0 && !isLoading && (
                <Text style={styles.hintText}>
                    Log a meal to track fibre intake
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(63, 66, 67, 0.25)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    statusText: {
        fontFamily: fonts.medium,
        fontSize: 12,
    },
    valueContainer: {
        marginBottom: 8,
    },
    valueText: {
        fontFamily: fonts.bold,
        fontSize: 32,
        color: '#FFFFFF',
    },
    unitText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#9E9E9E',
    },
    subtext: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#9E9E9E',
    },
    hintText: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#6B6B6B',
        marginTop: 8,
        fontStyle: 'italic',
    },
});
