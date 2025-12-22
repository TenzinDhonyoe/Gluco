/**
 * Notifications List Screen
 * Shows list of post-meal reviews with status badges
 */

import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { getPendingReviews, PostMealReview } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotificationsListScreen() {
    const { user } = useAuth();
    const [reviews, setReviews] = useState<PostMealReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadReviews = useCallback(async () => {
        if (!user?.id) return;

        const data = await getPendingReviews(user.id);
        setReviews(data);
        setLoading(false);
    }, [user?.id]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadReviews();
        setRefreshing(false);
    }, [loadReviews]);

    useEffect(() => {
        loadReviews();
    }, [loadReviews]);

    const handleBack = () => {
        router.back();
    };

    const handleReviewPress = (review: PostMealReview) => {
        router.push({
            pathname: '/post-meal-review',
            params: { reviewId: review.id },
        });
    };

    const getStatusBadge = (review: PostMealReview) => {
        const now = new Date();
        const scheduledFor = new Date(review.scheduled_for);

        if (review.status === 'opened') {
            return { label: 'Viewed', bg: '#2D2D2D', text: '#878787' };
        } else if (now >= scheduledFor) {
            return { label: 'Ready', bg: '#1E4D2B', text: '#4CAF50' };
        } else {
            return { label: 'Scheduled', bg: '#1E3A5F', text: '#3494D9' };
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

    const renderItem = ({ item }: { item: PostMealReview }) => {
        const status = getStatusBadge(item);
        const isReady = new Date() >= new Date(item.scheduled_for);

        return (
            <TouchableOpacity
                style={[styles.reviewCard, isReady && styles.reviewCardReady]}
                onPress={() => handleReviewPress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.reviewIcon}>
                    <Ionicons
                        name={isReady ? 'restaurant' : 'time-outline'}
                        size={22}
                        color={isReady ? '#26A861' : '#3494D9'}
                    />
                </View>
                <View style={styles.reviewContent}>
                    <Text style={styles.reviewTitle}>
                        {item.meal_name || 'Meal Review'}
                    </Text>
                    <Text style={styles.reviewTime}>
                        {formatDate(item.scheduled_for)} at {formatTime(item.scheduled_for)}
                    </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>
                        {status.label}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#3F4243" />
            </TouchableOpacity>
        );
    };

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color="#3F4243" />
            <Text style={styles.emptyTitle}>No Reviews Yet</Text>
            <Text style={styles.emptySubtitle}>
                Post-meal reviews will appear here after you log meals
            </Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#1a1f24', '#181c20', '#111111']} locations={[0, 0.3, 1]} style={styles.gradient} />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={24} color="#E7E8E9" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Content */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#3494D9" />
                    </View>
                ) : (
                    <FlatList
                        data={reviews}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        ListEmptyComponent={renderEmpty}
                        contentContainerStyle={styles.listContent}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor="#3494D9"
                            />
                        }
                    />
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    gradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 200,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        height: 72,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    headerSpacer: {
        width: 48,
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
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    reviewCardReady: {
        borderWidth: 1,
        borderColor: 'rgba(38, 168, 97, 0.3)',
    },
    reviewIcon: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(63, 66, 67, 0.5)',
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
        color: '#E7E8E9',
    },
    reviewTime: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
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
        color: '#E7E8E9',
        marginTop: 16,
    },
    emptySubtitle: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginTop: 8,
        textAlign: 'center',
        maxWidth: 250,
    },
});
