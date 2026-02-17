import { useAuth } from '@/context/AuthContext';
import { getWeightLogsByDateRange, WeightLog } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';

export interface WeightTrendPoint {
    loggedAt: string;
    weightKg: number;
    avg7d: number;
}

export interface WeightTrendsResult {
    logs: WeightLog[];
    points: WeightTrendPoint[];
    latestWeightKg: number | null;
    delta7dKg: number | null;
    isLoading: boolean;
    refetch: () => Promise<void>;
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

export function useWeightTrends(days: number = 30): WeightTrendsResult {
    const { user } = useAuth();
    const [logs, setLogs] = useState<WeightLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refetch = useCallback(async () => {
        if (!user?.id) {
            setLogs([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - days);

            const data = await getWeightLogsByDateRange(user.id, startDate, endDate);
            setLogs(data);
        } catch (error) {
            console.error('Error fetching weight trends:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user?.id, days]);

    useFocusEffect(
        useCallback(() => {
            refetch();
        }, [refetch])
    );

    const points = useMemo(() => {
        if (!logs.length) return [];

        return logs.map((log, idx) => {
            const windowStart = Math.max(0, idx - 6);
            const window = logs.slice(windowStart, idx + 1);
            const avg7d = window.reduce((sum, item) => sum + item.weight_kg, 0) / window.length;
            return {
                loggedAt: log.logged_at,
                weightKg: log.weight_kg,
                avg7d: round1(avg7d),
            };
        });
    }, [logs]);

    const latestWeightKg = points.length ? points[points.length - 1].avg7d : null;

    const delta7dKg = useMemo(() => {
        if (points.length < 2) return null;
        const latest = points[points.length - 1].avg7d;

        const latestDate = new Date(points[points.length - 1].loggedAt).getTime();
        const targetTs = latestDate - 7 * 24 * 60 * 60 * 1000;

        // Use closest available earlier point as baseline.
        let baseline = points[0].avg7d;
        for (let i = points.length - 1; i >= 0; i--) {
            const ts = new Date(points[i].loggedAt).getTime();
            if (ts <= targetTs) {
                baseline = points[i].avg7d;
                break;
            }
        }

        return round1(latest - baseline);
    }, [points]);

    return {
        logs,
        points,
        latestWeightKg,
        delta7dKg,
        isLoading,
        refetch,
    };
}
