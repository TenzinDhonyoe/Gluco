/**
 * Notifications List Screen
 * Shows list of recent meals with check-in status
 */

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { getMealsWithCheckinsByDateRange, MealWithCheckin } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function NotificationsListScreen() {
    const { user } = useAuth();
    const [meals, setMeals] = useState<MealWithCheckin[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadMeals = useCallback(async () => {
        if (!user?.id) return;

        // Get meals from the last 7 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        const data = await getMealsWithCheckinsByDateRange(user.id, startDate, endDate);
        const nowMs = Date.now();
        const oneHourAgoMs = nowMs - 60 * 60 * 1000;
        const readyMeals = data.filter(meal => {
            const loggedAtMs = new Date(meal.logged_at).getTime();
            return Number.isFinite(loggedAtMs) && loggedAtMs <= oneHourAgoMs;
        });

        setMeals(readyMeals);
        setLoading(false);
    }, [user?.id]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadMeals();
        setRefreshing(false);
    }, [loadMeals]);

    useEffect(() => {
        loadMeals();
    }, [loadMeals]);

    const handleBack = () => {
        router.back();
    };

    const handleMealPress = (meal: MealWithCheckin) => {
        router.push({
            pathname: '/meal-checkin',
            params: {
                mealId: meal.id,
                mealName: meal.name,
                ...(meal.photo_path && { photoPath: meal.photo_path }),
            },
        });
    };

    const getStatusBadge = (meal: MealWithCheckin) => {
        const hasCheckin = meal.meal_checkins && meal.meal_checkins.length > 0;

        if (hasCheckin) {
            return { label: 'Checked in', bg: Colors.successLight, text: Colors.success };
        } else {
            return { label: 'Add check-in', bg: Colors.primaryLight, text: Colors.primary };
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        }
    };

    const renderItem = ({ item }: { item: MealWithCheckin }) => {
        const status = getStatusBadge(item);
        const hasCheckin = item.meal_checkins && item.meal_checkins.length > 0;

        return (
            <TouchableOpacity
                style={[styles.reviewCard, !hasCheckin && styles.reviewCardReady]}
                onPress={() => handleMealPress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.reviewIcon}>
                    <Ionicons
                        name={hasCheckin ? 'checkmark-circle' : 'restaurant'}
                        size={22}
                        color={hasCheckin ? Colors.success : Colors.primary}
                    />
                </View>
                <View style={styles.reviewContent}>
                    <Text style={styles.reviewTitle}>
                        {item.name || 'Meal'}
                    </Text>
                    <Text style={styles.reviewTime}>
                        {formatDate(item.logged_at)} at {formatTime(item.logged_at)}
                    </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>
                        {status.label}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>
        );
    };

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Recent Meals</Text>
            <Text style={styles.emptySubtitle}>
                Log meals to see them here and add check-ins
            </Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.safeArea}>
                {/* Content */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={meals}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        ListEmptyComponent={renderEmpty}
                        contentContainerStyle={styles.listContent}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={Colors.primary}
                            />
                        }
                    />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    safeArea: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        flexGrow: 1,
    },
    reviewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.borderCard,
    },
    reviewCardReady: {
        borderColor: Colors.primaryMedium,
    },
    reviewIcon: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: Colors.inputBackground,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    reviewContent: {
        flex: 1,
    },
    reviewTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    reviewTime: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 8,
    },
    statusText: {
        fontFamily: fonts.medium,
        fontSize: 11,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 80,
    },
    emptyTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: Colors.textPrimary,
        marginTop: 16,
    },
    emptySubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
        marginTop: 8,
        textAlign: 'center',
        maxWidth: 250,
    },
});
