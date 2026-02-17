import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const DRAFT_KEY = 'onboarding_draft_v2';

// Legacy keys from the old per-screen draft system
const LEGACY_DRAFT_KEYS = [
    'onboarding_profile_draft',
    'onboarding_goals_draft',
    'onboarding_body_draft',
    'onboarding_tracking_draft',
];

export interface OnboardingDraft {
    // Step 1: Profile
    firstName?: string;
    lastName?: string;
    birthDate?: string | null; // ISO string
    biologicalSex?: string;
    region?: string;
    // Step 2: Goals
    selectedGoals?: string[];
    selectedReadiness?: string | null;
    // Step 3: Body
    heightCm?: number | null;
    heightFeet?: number;
    heightInches?: number;
    heightUnit?: 'cm' | 'ft';
    weightKg?: number | null;
    weightLbs?: number;
    weightUnit?: 'kg' | 'lbs';
    dietaryPreferences?: string[];
    culturalFoodContext?: string | null;
    // Step 4: Tracking
    selectedMode?: string;
    promptWindow?: string;
    // Step 5: Coaching
    coachingStyle?: string;
    comBBarrier?: string;
    ifThenPlan?: string;
    // Step 6: AI
    aiEnabled?: boolean;
}

export function useOnboardingDraft() {
    const [draft, setDraft] = useState<OnboardingDraft>({});
    const [isLoaded, setIsLoaded] = useState(false);
    const draftRef = useRef<OnboardingDraft>({});
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load draft from AsyncStorage on mount
    useEffect(() => {
        const load = async () => {
            try {
                const stored = await AsyncStorage.getItem(DRAFT_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored) as OnboardingDraft;
                    draftRef.current = parsed;
                    setDraft(parsed);
                }
            } catch {
                // Ignore load errors
            }
            setIsLoaded(true);
        };
        load();

        // Clean up legacy draft keys in the background
        LEGACY_DRAFT_KEYS.forEach((key) => {
            AsyncStorage.removeItem(key).catch(() => null);
        });
    }, []);

    // Debounced save to AsyncStorage
    const persistDraft = useCallback((data: OnboardingDraft) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(data));
            } catch {
                // Ignore save errors
            }
        }, 400);
    }, []);

    // Save immediately on app background
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftRef.current)).catch(() => null);
            }
        });
        return () => {
            subscription.remove();
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    const updateDraft = useCallback((updates: Partial<OnboardingDraft>) => {
        setDraft((prev) => {
            const next = { ...prev, ...updates };
            draftRef.current = next;
            persistDraft(next);
            return next;
        });
    }, [persistDraft]);

    const clearDraft = useCallback(async () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        draftRef.current = {};
        setDraft({});
        await AsyncStorage.removeItem(DRAFT_KEY).catch(() => null);
    }, []);

    return { draft, updateDraft, clearDraft, isLoaded };
}
