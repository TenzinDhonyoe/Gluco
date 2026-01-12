// supabase/functions/exercise-analyze/index.ts
// Edge Function for AI-powered Exercise Analysis
// Estimates calories burned and glucose impact based on exercise type and user profile

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPES
// ============================================

interface ExerciseRequest {
    user_id: string;
    exercise_text: string;
}

interface ParsedExercise {
    name: string;
    duration_min: number;
    intensity: 'light' | 'moderate' | 'vigorous';
    met_value: number;
    category: string;
}

interface ExerciseTip {
    title: string;
    detail: string;
    icon: string;
}

interface ExerciseResult {
    exercise: ParsedExercise;
    calories_burned: number;
    glucose_impact: {
        reduction_pct: number;
        timing_benefit: string;
        optimal_timing: string;
        personalized: boolean;
        based_on_history: boolean;
    };
    tips: ExerciseTip[];
    user_stats: {
        weight_kg: number;
        age: number;
        bmi: number | null;
    };
    personalization: {
        data_quality: 'none' | 'low' | 'medium' | 'high';
        glucose_observations: number;
        activity_observations: number;
        baseline_glucose: number;
        exercise_effect: number;
    };
}

// ============================================
// MET VALUES (Metabolic Equivalent of Task)
// ============================================
// MET is the ratio of working metabolic rate to resting metabolic rate
// 1 MET = ~1 kcal/kg/hour

const MET_DATABASE: Record<string, { light: number; moderate: number; vigorous: number }> = {
    // Walking
    'walk': { light: 2.5, moderate: 3.5, vigorous: 5.0 },
    'walking': { light: 2.5, moderate: 3.5, vigorous: 5.0 },
    'hike': { light: 4.0, moderate: 6.0, vigorous: 8.0 },
    'hiking': { light: 4.0, moderate: 6.0, vigorous: 8.0 },

    // Running
    'jog': { light: 6.0, moderate: 8.0, vigorous: 10.0 },
    'jogging': { light: 6.0, moderate: 8.0, vigorous: 10.0 },
    'run': { light: 7.0, moderate: 10.0, vigorous: 12.5 },
    'running': { light: 7.0, moderate: 10.0, vigorous: 12.5 },
    'sprint': { light: 10.0, moderate: 12.5, vigorous: 15.0 },

    // Cycling
    'bike': { light: 4.0, moderate: 8.0, vigorous: 12.0 },
    'biking': { light: 4.0, moderate: 8.0, vigorous: 12.0 },
    'cycle': { light: 4.0, moderate: 8.0, vigorous: 12.0 },
    'cycling': { light: 4.0, moderate: 8.0, vigorous: 12.0 },

    // Swimming
    'swim': { light: 4.0, moderate: 6.0, vigorous: 10.0 },
    'swimming': { light: 4.0, moderate: 6.0, vigorous: 10.0 },

    // Gym/Strength
    'gym': { light: 3.0, moderate: 5.0, vigorous: 8.0 },
    'weights': { light: 3.5, moderate: 5.0, vigorous: 6.0 },
    'weightlifting': { light: 3.5, moderate: 5.0, vigorous: 6.0 },
    'strength': { light: 3.5, moderate: 5.0, vigorous: 6.0 },
    'resistance': { light: 3.5, moderate: 5.0, vigorous: 6.0 },

    // Cardio
    'aerobics': { light: 4.0, moderate: 6.5, vigorous: 8.5 },
    'hiit': { light: 6.0, moderate: 8.0, vigorous: 12.0 },
    'cardio': { light: 5.0, moderate: 7.0, vigorous: 10.0 },
    'elliptical': { light: 4.0, moderate: 6.0, vigorous: 8.0 },
    'rowing': { light: 4.0, moderate: 7.0, vigorous: 12.0 },
    'stairmaster': { light: 6.0, moderate: 9.0, vigorous: 12.0 },

    // Sports
    'basketball': { light: 4.5, moderate: 6.5, vigorous: 8.0 },
    'soccer': { light: 5.0, moderate: 7.0, vigorous: 10.0 },
    'football': { light: 5.0, moderate: 7.0, vigorous: 10.0 },
    'tennis': { light: 4.0, moderate: 7.0, vigorous: 10.0 },
    'badminton': { light: 4.0, moderate: 5.5, vigorous: 7.0 },
    'golf': { light: 3.5, moderate: 4.5, vigorous: 5.5 },
    'volleyball': { light: 3.0, moderate: 4.0, vigorous: 8.0 },

    // Yoga/Flexibility
    'yoga': { light: 2.5, moderate: 3.5, vigorous: 5.0 },
    'pilates': { light: 2.5, moderate: 4.0, vigorous: 5.5 },
    'stretching': { light: 2.0, moderate: 2.5, vigorous: 3.0 },
    'tai chi': { light: 2.5, moderate: 3.0, vigorous: 4.0 },

    // Dance
    'dance': { light: 3.0, moderate: 5.0, vigorous: 7.5 },
    'dancing': { light: 3.0, moderate: 5.0, vigorous: 7.5 },
    'zumba': { light: 4.5, moderate: 6.5, vigorous: 8.5 },

    // Other
    'jump rope': { light: 8.0, moderate: 10.0, vigorous: 12.5 },
    'jumping': { light: 6.0, moderate: 8.0, vigorous: 10.0 },
    'boxing': { light: 5.0, moderate: 7.5, vigorous: 10.0 },
    'martial arts': { light: 5.0, moderate: 7.0, vigorous: 10.0 },
    'climbing': { light: 5.0, moderate: 8.0, vigorous: 11.0 },

    // Default
    'exercise': { light: 4.0, moderate: 6.0, vigorous: 8.0 },
    'workout': { light: 4.0, moderate: 6.0, vigorous: 8.0 },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function parseExerciseText(text: string): ParsedExercise {
    const lowerText = text.toLowerCase();

    // Extract duration (look for numbers followed by min/minutes/hour/hr)
    let duration_min = 30; // default
    const durationMatch = lowerText.match(/(\d+)\s*(min|minutes?|hr|hour|hours?)/i);
    if (durationMatch) {
        duration_min = parseInt(durationMatch[1]);
        if (durationMatch[2].startsWith('h')) {
            duration_min *= 60;
        }
    }

    // Detect intensity from keywords
    let intensity: 'light' | 'moderate' | 'vigorous' = 'moderate';
    if (/light|easy|slow|gentle|relaxed|leisure/i.test(lowerText)) {
        intensity = 'light';
    } else if (/vigorous|intense|hard|fast|sprint|heavy|high.?intensity|hiit/i.test(lowerText)) {
        intensity = 'vigorous';
    }

    // Find exercise type
    let exerciseType = 'exercise';
    let category = 'General';

    for (const [key, _] of Object.entries(MET_DATABASE)) {
        if (lowerText.includes(key)) {
            exerciseType = key;
            break;
        }
    }

    // Categorize
    if (['walk', 'walking', 'hike', 'hiking'].includes(exerciseType)) {
        category = 'Walking';
    } else if (['jog', 'jogging', 'run', 'running', 'sprint'].includes(exerciseType)) {
        category = 'Running';
    } else if (['bike', 'biking', 'cycle', 'cycling'].includes(exerciseType)) {
        category = 'Cycling';
    } else if (['swim', 'swimming'].includes(exerciseType)) {
        category = 'Swimming';
    } else if (['gym', 'weights', 'weightlifting', 'strength', 'resistance'].includes(exerciseType)) {
        category = 'Strength Training';
    } else if (['yoga', 'pilates', 'stretching', 'tai chi'].includes(exerciseType)) {
        category = 'Flexibility';
    } else if (['dance', 'dancing', 'zumba'].includes(exerciseType)) {
        category = 'Dance';
    } else if (['basketball', 'soccer', 'football', 'tennis', 'badminton', 'golf', 'volleyball'].includes(exerciseType)) {
        category = 'Sports';
    }

    const metValues = MET_DATABASE[exerciseType] || MET_DATABASE['exercise'];
    const met_value = metValues[intensity];

    // Create display name
    const displayName = exerciseType.charAt(0).toUpperCase() + exerciseType.slice(1);

    return {
        name: displayName,
        duration_min,
        intensity,
        met_value,
        category,
    };
}

function calculateCaloriesBurned(
    metValue: number,
    durationMin: number,
    weightKg: number
): number {
    // Calories = MET × weight (kg) × duration (hours)
    const durationHours = durationMin / 60;
    const calories = metValue * weightKg * durationHours;
    return Math.round(calories);
}

function calculateGlucoseImpact(
    exercise: ParsedExercise,
    timingContext: string,
    calibration: UserCalibration | null,
    recentGlucose: { avg: number; count: number } | null
): { reduction_pct: number; timing_benefit: string; optimal_timing: string; personalized: boolean; based_on_history: boolean } {
    // Base glucose reduction based on exercise intensity and duration
    let baseReduction = 0;

    switch (exercise.intensity) {
        case 'light':
            baseReduction = 5 + (exercise.duration_min / 60) * 5; // 5-10%
            break;
        case 'moderate':
            baseReduction = 10 + (exercise.duration_min / 60) * 10; // 10-20%
            break;
        case 'vigorous':
            baseReduction = 15 + (exercise.duration_min / 60) * 15; // 15-30%
            break;
    }

    // Apply calibration-based personalization
    let personalized = false;
    let based_on_history = false;

    if (calibration && calibration.n_observations > 0) {
        personalized = true;

        // Use user's learned exercise effect (from user_calibration table)
        // exercise_effect is the learned multiplier from past exercise-glucose correlations
        if (calibration.exercise_effect !== 0) {
            based_on_history = true;
            // Apply personal modifier (positive = exercise helps more, negative = helps less)
            baseReduction *= (1 + calibration.exercise_effect);
        }

        // Adjust based on user's baseline glucose
        // Users with higher baseline glucose tend to see larger reductions
        if (recentGlucose && recentGlucose.count >= 5) {
            const avgGlucose = recentGlucose.avg;
            if (avgGlucose > 7.0) {
                baseReduction *= 1.2; // Higher baseline = more room for improvement
            } else if (avgGlucose < 5.0) {
                baseReduction *= 0.8; // Already low, less impact
            }
        }
    }

    // Cap at reasonable values
    baseReduction = Math.min(baseReduction, 40);
    baseReduction = Math.max(baseReduction, 3);

    // Timing benefit
    let timing_benefit = 'Standard glucose impact';
    let optimal_timing = 'Any time';

    // Post-meal exercise is most beneficial for glucose control
    if (/after|post|following/.test(timingContext.toLowerCase())) {
        baseReduction *= 1.3; // 30% more effective post-meal
        timing_benefit = 'Post-meal exercise is 30% more effective for glucose control';
        optimal_timing = '15-45 min after eating';
    } else if (/before|pre|fasted|morning/.test(timingContext.toLowerCase())) {
        timing_benefit = 'Fasted morning activity may support your energy and metabolism';
        optimal_timing = 'Before breakfast or meals';
    }

    return {
        reduction_pct: Math.round(baseReduction),
        timing_benefit,
        optimal_timing,
        personalized,
        based_on_history,
    };
}

function generateExerciseTips(exercise: ParsedExercise): ExerciseTip[] {
    const tips: ExerciseTip[] = [];

    // Intensity-based tips
    if (exercise.intensity === 'light') {
        tips.push({
            title: 'Consider increasing intensity',
            detail: 'Moderate intensity exercise burns 50-100% more calories',
            icon: 'trending-up',
        });
    }

    if (exercise.intensity === 'vigorous') {
        tips.push({
            title: 'Great intensity choice!',
            detail: 'High intensity exercise provides excellent glucose control benefits',
            icon: 'flame',
        });
    }

    // Duration-based tips
    if (exercise.duration_min < 20) {
        tips.push({
            title: 'Extend duration if possible',
            detail: 'Aim for at least 30 minutes for optimal glucose benefits',
            icon: 'time',
        });
    }

    if (exercise.duration_min >= 30) {
        tips.push({
            title: 'Optimal duration',
            detail: '30+ minutes provides significant metabolic benefits',
            icon: 'checkmark-circle',
        });
    }

    // Category-specific tips
    if (exercise.category === 'Strength Training') {
        tips.push({
            title: 'Build muscle for better metabolism',
            detail: 'Muscle tissue burns more calories at rest and improves glucose uptake',
            icon: 'barbell',
        });
    }

    if (['Walking', 'Running', 'Cycling'].includes(exercise.category)) {
        tips.push({
            title: 'Post-meal timing bonus',
            detail: 'Try this exercise 15-45 min after meals for best glucose impact',
            icon: 'restaurant',
        });
    }

    // General glucose tip
    tips.push({
        title: 'Stay hydrated',
        detail: 'Proper hydration helps maintain stable glucose levels during exercise',
        icon: 'water',
    });

    return tips.slice(0, 4); // Max 4 tips
}

// ============================================
// USER CALIBRATION TYPE
// ============================================

interface UserCalibration {
    user_id: string;
    baseline_glucose: number;
    carb_sensitivity: number;
    avg_peak_time_min: number;
    exercise_effect: number;  // Learned from past exercise-glucose correlations
    sleep_penalty: number;
    n_observations: number;
    n_quality_observations: number;
    confidence: number;
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId, exercise_text }: ExerciseRequest = await req.json();

        if (!requestedUserId || !exercise_text) {
            return new Response(
                JSON.stringify({ error: 'user_id and exercise_text are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) return mismatch;

        const userId = user.id;

        // Fetch user profile for personalization
        const { data: profile } = await supabase
            .from('profiles')
            .select('birth_date, biological_sex')
            .eq('id', userId)
            .single();

        // Fetch user's calibration data (personalized glucose response patterns)
        let calibration: UserCalibration | null = null;
        try {
            const { data: calibData } = await supabase
                .from('user_calibration')
                .select('*')
                .eq('user_id', userId)
                .single();
            if (calibData) {
                calibration = calibData as UserCalibration;
            }
        } catch (e) {
            console.log('No calibration data found, using defaults');
        }

        // Fetch recent glucose logs (last 7 days) for personalization
        let recentGlucose: { avg: number; count: number } | null = null;
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: glucoseLogs } = await supabase
                .from('glucose_logs')
                .select('glucose_level')
                .eq('user_id', userId)
                .gte('logged_at', sevenDaysAgo.toISOString())
                .order('logged_at', { ascending: false })
                .limit(100);

            if (glucoseLogs && glucoseLogs.length > 0) {
                const sum = glucoseLogs.reduce((acc, log) => acc + log.glucose_level, 0);
                recentGlucose = {
                    avg: sum / glucoseLogs.length,
                    count: glucoseLogs.length,
                };
            }
        } catch (e) {
            console.log('Could not fetch glucose logs');
        }

        // Fetch activity log count for personalization context
        let activityObservations = 0;
        try {
            const { count } = await supabase
                .from('activity_log')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);
            activityObservations = count || 0;
        } catch (e) {
            console.log('Could not fetch activity count');
        }

        // Calculate age from birth_date
        let age = 35; // default
        if (profile?.birth_date) {
            const birthDate = new Date(profile.birth_date);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
        }

        // Use default weight (will be replaced when we add weight to profile)
        let weight_kg = 70; // default
        if (profile?.biological_sex === 'female') {
            weight_kg = 65;
        } else if (profile?.biological_sex === 'male') {
            weight_kg = 80;
        }

        // Parse exercise from text
        const parsedExercise = parseExerciseText(exercise_text);

        // Calculate calories burned
        const calories_burned = calculateCaloriesBurned(
            parsedExercise.met_value,
            parsedExercise.duration_min,
            weight_kg
        );

        // Calculate glucose impact with personalization
        const glucose_impact = calculateGlucoseImpact(
            parsedExercise,
            exercise_text,
            calibration,
            recentGlucose
        );

        // Generate personalized tips
        const tips = generateExerciseTips(parsedExercise);

        // Determine data quality
        let dataQuality: 'none' | 'low' | 'medium' | 'high' = 'none';
        const glucoseCount = recentGlucose?.count || 0;
        if (calibration && calibration.n_observations >= 20 && glucoseCount >= 50) {
            dataQuality = 'high';
        } else if (calibration && calibration.n_observations >= 5 && glucoseCount >= 10) {
            dataQuality = 'medium';
        } else if (glucoseCount > 0 || (calibration && calibration.n_observations > 0)) {
            dataQuality = 'low';
        }

        const result: ExerciseResult = {
            exercise: parsedExercise,
            calories_burned,
            glucose_impact,
            tips,
            user_stats: {
                weight_kg,
                age,
                bmi: null,
            },
            personalization: {
                data_quality: dataQuality,
                glucose_observations: glucoseCount,
                activity_observations: activityObservations,
                baseline_glucose: calibration?.baseline_glucose || 5.5,
                exercise_effect: calibration?.exercise_effect || 0,
            },
        };

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Exercise analyze error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
