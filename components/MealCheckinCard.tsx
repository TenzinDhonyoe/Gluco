import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { fonts } from '@/hooks/useFonts';
import { MealWithCheckin } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

// Simple time formatter (e.g., "2:30 PM")
function formatTime(dateString: string): string {
    const date = new Date(dateString);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const minStr = minutes < 10 ? '0' + minutes : String(minutes);
    return hours + ':' + minStr + ' ' + ampm;
}

interface MealCheckinCardProps {
    meal: MealWithCheckin;
    onPress: () => void;
}

export const MealCheckinCard = React.memo(({ meal, onPress }: MealCheckinCardProps) => {
    // Check if meal has a check-in
    const hasCheckin = meal.meal_checkins && meal.meal_checkins.length > 0;

    // Format time
    const timeString = formatTime(meal.logged_at);

    // Get status color based on check-in or missing
    // If checkin exists, use green/blue. If not, use orange for action needed.
    const statusColor = hasCheckin ? '#4CAF50' : '#FF9800';

    return (
        <AnimatedPressable
            style={styles.container}
            onPress={onPress}
        >
            {/* Background Image or Gradient */}
            {meal.photo_path ? (
                <Image source={{ uri: meal.photo_path }} style={styles.image} />
            ) : (
                <LinearGradient
                    colors={['#2A2D30', '#1A1B1C']}
                    style={styles.image}
                />
            )}

            {/* Overlay Gradient for readability */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.gradient}
            />

            {/* Content */}
            <View style={styles.content}>
                {/* Top Row: Time & Status */}
                <View style={styles.header}>
                    <View style={styles.timeBadge}>
                        <Ionicons name="time-outline" size={12} color="#E7E8E9" />
                        <Text style={styles.timeText}>{timeString}</Text>
                    </View>

                    {hasCheckin && (
                        <View style={[styles.statusBadge, { backgroundColor: 'rgba(76, 175, 80, 0.2)' }]}>
                            <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                        </View>
                    )}
                </View>

                {/* Bottom Row: Name & Action */}
                <View style={styles.footer}>
                    <Text style={styles.mealName} numberOfLines={1}>
                        {meal.name}
                    </Text>

                    {!hasCheckin && (
                        <View style={styles.actionButton}>
                            <Text style={styles.actionText}>Check In</Text>
                            <Ionicons name="arrow-forward" size={14} color="#151718" />
                        </View>
                    )}
                </View>
            </View>
        </AnimatedPressable>
    );
});

const styles = StyleSheet.create({
    container: {
        width: 300,
        height: 190,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#1E1E1E',
        marginRight: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    image: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
        backgroundColor: '#2A2D30',
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
        padding: 12,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    timeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    timeText: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#E7E8E9',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 14,
    },
    statusText: {
        fontFamily: fonts.bold,
        fontSize: 10,
    },
    footer: {
        gap: 8,
    },
    mealName: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#E7E8E9',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        gap: 4,
    },
    actionText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        color: '#151718',
    },
});

export default MealCheckinCard;
