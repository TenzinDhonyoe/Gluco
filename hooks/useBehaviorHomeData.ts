import { useNextBestAction } from '@/hooks/useNextBestAction';
import { usePersonalInsights } from '@/hooks/usePersonalInsights';
import { InsightData, InsightGenerationOptions, PersonalInsight, TrackingMode } from '@/lib/insights';
import { getUserActionsByStatus, NextBestAction, UserAction } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';

interface UseBehaviorHomeDataParams {
    userId: string | undefined;
    trackingMode: TrackingMode;
    rangeKey?: '7d' | '14d' | '30d' | '90d';
    enabled?: boolean;
    fallbackData?: InsightData;
    generationOptions?: InsightGenerationOptions;
}

interface UseBehaviorHomeDataResult {
    insights: PersonalInsight[];
    primaryAction: PersonalInsight | null;
    secondaryActions: PersonalInsight[];
    activeActions: UserAction[];
    completedActionTypesToday: string[];
    nextBestAction: NextBestAction | null;
    nextBestActionSource: 'ai' | 'rules' | 'fallback' | null;
    loading: boolean;
    dismissInsight: (id: string) => void;
    refetchActions: () => Promise<void>;
    trackNextBestActionTap: () => void;
}

function toLocalDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function useBehaviorHomeData({
    userId,
    trackingMode,
    rangeKey = '7d',
    enabled = true,
    fallbackData,
    generationOptions,
}: UseBehaviorHomeDataParams): UseBehaviorHomeDataResult {
    const [actions, setActions] = useState<UserAction[]>([]);
    const [actionsLoading, setActionsLoading] = useState(false);

    const {
        action: nbaAction,
        source: nbaSource,
        loading: nbaLoading,
        trackTap: nbaTrackTap,
    } = useNextBestAction(userId, enabled);

    const {
        insights,
        loading: insightsLoading,
        dismissInsight,
    } = usePersonalInsights({
        userId,
        trackingMode,
        rangeKey,
        enabled,
        fallbackData,
        generationOptions,
    });

    const refetchActions = useCallback(async () => {
        if (!userId || !enabled) {
            setActions([]);
            return;
        }

        setActionsLoading(true);
        try {
            const fetchedActions = await getUserActionsByStatus(userId, ['active', 'completed']);
            setActions(fetchedActions);
        } catch (error) {
            console.error('Error fetching active actions for behavior home:', error);
            setActions([]);
        } finally {
            setActionsLoading(false);
        }
    }, [userId, enabled]);

    useFocusEffect(
        useCallback(() => {
            refetchActions();
        }, [refetchActions])
    );

    const activeActions = useMemo(
        () => actions.filter((action) => action.status === 'active'),
        [actions]
    );

    const completedActionTypesToday = useMemo(() => {
        const todayKey = toLocalDateKey(new Date());
        const completedToday = new Set<string>();

        actions.forEach((action) => {
            if (action.status !== 'completed' || !action.completed_at) return;

            const completedAt = new Date(action.completed_at);
            if (Number.isNaN(completedAt.getTime())) return;
            if (toLocalDateKey(completedAt) !== todayKey) return;

            const normalizedActionType = action.action_type?.toLowerCase().trim();
            if (normalizedActionType) {
                completedToday.add(normalizedActionType);
            }
        });

        return Array.from(completedToday);
    }, [actions]);

    const { primaryAction, secondaryActions } = useMemo(() => {
        const activeTypes = new Set(activeActions.map(a => a.action_type));

        const prioritized = insights
            .filter(insight => !activeTypes.has(insight.action.actionType))
            .slice(0, 3);

        return {
            primaryAction: prioritized[0] ?? null,
            secondaryActions: prioritized.slice(1, 3),
        };
    }, [insights, activeActions]);

    return {
        insights,
        primaryAction,
        secondaryActions,
        activeActions,
        completedActionTypesToday,
        nextBestAction: nbaAction,
        nextBestActionSource: nbaSource,
        loading: insightsLoading || actionsLoading || nbaLoading,
        dismissInsight,
        refetchActions,
        trackNextBestActionTap: nbaTrackTap,
    };
}
