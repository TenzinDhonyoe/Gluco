import { dismissWeeklyReview, getWeeklyReview, invokeWeeklyReview, trackAiSuggestionEvent, WeeklyReview } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';

interface UseWeeklyReviewResult {
    review: WeeklyReview | null;
    loading: boolean;
    dismiss: () => Promise<void>;
}

export function useWeeklyReview(userId: string | undefined, enabled = true): UseWeeklyReviewResult {
    const [review, setReview] = useState<WeeklyReview | null>(null);
    const [loading, setLoading] = useState(false);
    const shownTrackedRef = useRef<string | null>(null);

    const fetchReview = useCallback(async () => {
        if (!userId || !enabled) return;

        setLoading(true);
        try {
            // Check if a review already exists for this week
            const existing = await getWeeklyReview(userId);

            if (existing) {
                // Only show if not dismissed
                if (!existing.dismissed_at) {
                    setReview(existing);

                    // Track 'shown' event (deduplicate by review id)
                    if (shownTrackedRef.current !== existing.id) {
                        shownTrackedRef.current = existing.id;
                        trackAiSuggestionEvent(userId, 'weekly_review', 'shown', null, {
                            week_start: existing.week_start,
                            key_metric: existing.key_metric,
                        });
                    }
                } else {
                    setReview(null);
                }
                return;
            }

            // No review for this week yet — check if it's Monday or later
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
            if (dayOfWeek === 0) {
                // Sunday — don't generate yet
                setReview(null);
                return;
            }

            // Trigger generation via edge function
            const result = await invokeWeeklyReview(userId);
            if (result?.review) {
                // Re-fetch from table to get the stored version with id
                const stored = await getWeeklyReview(userId);
                if (stored && !stored.dismissed_at) {
                    setReview(stored);

                    // Track 'shown' event
                    if (shownTrackedRef.current !== stored.id) {
                        shownTrackedRef.current = stored.id;
                        trackAiSuggestionEvent(userId, 'weekly_review', 'shown', null, {
                            week_start: stored.week_start,
                            key_metric: stored.key_metric,
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching weekly review:', error);
        } finally {
            setLoading(false);
        }
    }, [userId, enabled]);

    useFocusEffect(
        useCallback(() => {
            fetchReview();
        }, [fetchReview])
    );

    const dismiss = useCallback(async () => {
        if (!review || !userId) return;

        // Track 'dismissed' event
        trackAiSuggestionEvent(userId, 'weekly_review', 'dismissed', null, {
            week_start: review.week_start,
            key_metric: review.key_metric,
        });

        const success = await dismissWeeklyReview(review.id);
        if (success) {
            setReview(null);
        }
    }, [review, userId]);

    return { review, loading, dismiss };
}
