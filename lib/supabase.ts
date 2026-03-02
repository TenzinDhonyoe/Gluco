import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Get Supabase configuration from environment variables or app.json extra config
// Priority: EXPO_PUBLIC_* env vars > app.json extra
const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    Constants.expoConfig?.extra?.supabaseUrl;

const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    Constants.expoConfig?.extra?.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: {
            getItem: async (key: string) => {
                if (typeof window === 'undefined') return null;
                try {
                    if (Platform.OS === 'web') {
                        return await AsyncStorage.getItem(key);
                    }
                    const secureValue = await SecureStore.getItemAsync(key);
                    if (secureValue !== null) return secureValue;
                    return await AsyncStorage.getItem(key);
                } catch {
                    return await AsyncStorage.getItem(key);
                }
            },
            setItem: async (key: string, value: string) => {
                if (typeof window === 'undefined') return;
                try {
                    if (Platform.OS === 'web') {
                        await AsyncStorage.setItem(key, value);
                        return;
                    }
                    await SecureStore.setItemAsync(key, value);
                } catch {
                    await AsyncStorage.setItem(key, value);
                }
            },
            removeItem: async (key: string) => {
                if (typeof window === 'undefined') return;
                try {
                    if (Platform.OS === 'web') {
                        await AsyncStorage.removeItem(key);
                        return;
                    }
                    await SecureStore.deleteItemAsync(key);
                } catch {
                    // Ignore SecureStore errors and fall back to AsyncStorage
                }
                await AsyncStorage.removeItem(key);
            },
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

type SupabaseErrorLike = { code?: string; message?: string } | null | undefined;

const schemaFallbackWarnings = new Set<string>();

function warnSchemaFallbackOnce(key: string, message: string, error?: SupabaseErrorLike) {
    if (schemaFallbackWarnings.has(key)) return;
    schemaFallbackWarnings.add(key);
    const detail = error?.message ? ` (${error.message})` : '';
    console.warn(`${message}${detail}`);
}

function matchesMissingEntity(message: string, entity?: string): boolean {
    if (!entity) return true;
    return message.includes(entity.toLowerCase());
}

function isMissingTableError(error: SupabaseErrorLike, tableName?: string): boolean {
    if (!error) return false;
    const message = (error.message || '').toLowerCase();

    if (error.code === 'PGRST205' || error.code === '42P01') {
        return matchesMissingEntity(message, tableName);
    }

    if (message.includes('could not find the table')) {
        return matchesMissingEntity(message, tableName);
    }

    if (message.includes('relation') && message.includes('does not exist')) {
        return matchesMissingEntity(message, tableName);
    }

    return false;
}

/**
 * Helper to invoke Edge Functions with retry logic
 * Handles transient network errors and cold starts
 */
export async function invokeWithRetry<T>(
    functionName: string,
    body: any,
    maxRetries: number = 3
): Promise<T | null> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const { data, error } = await supabase.functions.invoke(functionName, {
                body,
            });

            if (error) throw error;
            return data as T;
        } catch (err: any) {
            lastError = err;

            // Should we retry?
            // Retry on network errors or timeouts (FunctionsFetchError)
            // Or 5xx server errors. Don't retry 4xx (client errors).
            const isRetryable =
                err.name === 'FunctionsFetchError' ||
                err.message?.includes('Failed to send') ||
                (err.status && err.status >= 500);

            if (!isRetryable) {
                console.error(`Error invoking ${functionName} (fatal):`, err);
                return null;
            }

            console.warn(`Retry attempt ${attempt + 1}/${maxRetries} for ${functionName}:`, err.message);

            // Exponential backoff: 500ms, 1000ms, 2000ms
            if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
            }
        }
    }

    console.error(`Failed to invoke ${functionName} after ${maxRetries} attempts:`, lastError);
    return null;
}

// Types for user profile
export type GlucoseUnit = 'mmol/L' | 'mg/dL';

export type ExperienceVariant = 'legacy' | 'behavior_v1';
export type COMBBarrier = 'capability' | 'opportunity' | 'motivation' | 'unsure';
export type ReadinessLevel = 'low' | 'medium' | 'high';
export type PromptWindow = 'morning' | 'midday' | 'evening';

export interface NotificationPreferences {
    meal_reminders?: boolean;
    post_meal_reviews?: boolean;
    daily_insights?: boolean;
    experiment_updates?: boolean;
    active_action_midday?: boolean;
    post_meal_action?: boolean;
    weekly_summary?: boolean;
}

// Tracking modes: new wellness-first modes + legacy modes for backward compatibility
export type TrackingMode =
    | 'meals_wearables'          // Default: Meals + Apple Health
    | 'meals_only'               // Meals only, no device data
    | 'manual_glucose_optional'  // Meals + optional manual readings
    | 'wearables_only'           // Legacy: kept for existing data
    | 'glucose_tracking';        // Legacy: kept for existing data

export type CoachingStyle = 'light' | 'balanced' | 'structured';

export interface UserProfile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    region: string | null;
    birth_date: string | null;
    biological_sex: string | null;
    goals: string[] | null;
    onboarding_completed: boolean;
    target_min: number | null;  // Custom glucose target minimum (mmol/L)
    target_max: number | null;  // Custom glucose target maximum (mmol/L)
    glucose_unit: GlucoseUnit;  // User preferred display unit (default: mmol/L)
    // Tracking mode settings
    tracking_mode: TrackingMode;
    manual_glucose_enabled: boolean;
    // Body metrics (new for wellness onboarding)
    height_cm: number | null;
    weight_kg: number | null;
    // Coaching preferences (new for wellness onboarding)
    coaching_style: CoachingStyle | null;
    notifications_enabled: boolean;
    ai_enabled: boolean;
    ai_consent_at: string | null;
    experience_variant: ExperienceVariant;
    framework_reset_completed_at: string | null;
    com_b_barrier: COMBBarrier | null;
    readiness_level: ReadinessLevel | null;
    primary_habit: string | null;
    if_then_plan: string | null;
    prompt_window: PromptWindow | null;
    show_glucose_advanced: boolean;
    notification_preferences: NotificationPreferences | null;
    dietary_preferences: string[];
    cultural_food_context: string | null;
    created_at: string;
    updated_at: string;
}

// Helper functions for user profile
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }

    return data;
}

export async function updateUserProfile(
    userId: string,
    updates: Partial<Omit<UserProfile, 'id' | 'created_at' | 'email'>>
): Promise<UserProfile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

    if (error) {
        console.error('Error updating user profile:', error);
        return null;
    }

    return data;
}

// ============================================
// MEAL PHOTO ANALYSIS
// ============================================

export type MealPhotoAnalysisStatus = 'pending' | 'complete' | 'failed';

export interface NutrientEstimate {
    calories_kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
}

export interface AnalyzedItem {
    display_name: string;
    quantity: number;
    unit: string;
    confidence: 'low' | 'medium' | 'high';
    nutrients: NutrientEstimate;
}

export interface MealPhotoAnalysisResult {
    status: MealPhotoAnalysisStatus;
    disclaimer: string;
    items: AnalyzedItem[];
    totals: {
        calories_kcal: number | null;
        carbs_g: number | null;
        protein_g: number | null;
        fat_g: number | null;
        fibre_g: number | null;
    };
}

export interface MealPhotoAnalysisRow {
    id: string;
    user_id: string;
    meal_id: string;
    photo_path: string;
    status: MealPhotoAnalysisStatus;
    result: MealPhotoAnalysisResult | null;
    model: string | null;
    created_at: string;
}

export async function createMealPhotoAnalysisPending(
    mealId: string,
    userId: string,
    photoPath: string
): Promise<MealPhotoAnalysisRow | null> {
    const { data, error } = await supabase
        .from('meal_photo_analysis')
        .upsert({
            meal_id: mealId,
            user_id: userId,
            photo_path: photoPath,
            status: 'pending',
            model: 'gpt-4o-mini'
        }, { onConflict: 'meal_id' })
        .select()
        .single();

    if (error) {
        console.error('Error creating pending analysis:', error);
        return null;
    }
    return data;
}

export async function getMealPhotoAnalysis(
    mealId: string,
    userId: string
): Promise<MealPhotoAnalysisRow | null> {
    const { data, error } = await supabase
        .from('meal_photo_analysis')
        .select('*')
        .eq('meal_id', mealId)
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') { // Ignore "no rows found"
        console.error('Error fetching analysis:', error);
    }
    return data || null;
}

export async function ensureSignedMealPhotoUrl(photoPath: string): Promise<string | null> {
    // If it's already a full URL (public or signed), just return it
    if (photoPath.startsWith('http')) return photoPath;

    // Local file URIs are not in Supabase Storage yet.
    // Callers should upload first, then pass storage path.
    if (
        photoPath.startsWith('file://') ||
        photoPath.startsWith('ph://') ||
        photoPath.startsWith('assets-library://')
    ) {
        if (__DEV__) {
            console.warn('Local meal photo URI is not uploaded to storage yet; skipping signed URL.');
        }
        return null;
    }

    // Otherwise, assume it's a storage path and get a signed URL
    try {
        const { data, error } = await supabase.storage
            .from('meal-photos')
            .createSignedUrl(photoPath, 60 * 60); // 1 hour

        if (error) {
            // If object is missing, just return null without loud error
            if (error.message.includes('Object not found')) {
                console.warn('Image not found in storage:', photoPath);
                return null;
            }
            console.error('Failed to create signed URL:', error.message);
            return null;
        }
        if (!data?.signedUrl) {
            console.error('No signed URL returned for path:', photoPath);
            return null;
        }
        return data.signedUrl;
    } catch (e) {
        console.error('Exception creating signed URL:', e);
        return null;
    }
}

export async function invokeMealPhotoAnalyze(
    userId: string,
    mealId: string | null,
    photoPath: string,
    mealTime?: string,
    mealType?: string,
    mealName?: string,
    mealNotes?: string
): Promise<MealPhotoAnalysisResult | null> {
    try {
        if (__DEV__) console.log('[meal-photo-analyze] Starting analysis for path:', photoPath);

        const photoUrl = await ensureSignedMealPhotoUrl(photoPath);
        if (!photoUrl) {
            console.error('[meal-photo-analyze] Failed to get signed URL for:', photoPath);
            return null;
        }
        if (__DEV__) console.log('[meal-photo-analyze] Got signed URL, invoking edge function...');

        const { data, error } = await supabase.functions.invoke('meal-photo-analyze', {
            body: {
                user_id: userId,
                meal_id: mealId ?? undefined,
                photo_url: photoUrl,
                meal_time: mealTime,
                meal_type: mealType,
                meal_name: mealName,
                meal_notes: mealNotes,
            }
        });

        if (error) {
            console.error('[meal-photo-analyze] Edge function error:', error);
            throw error;
        }

        if (__DEV__) console.log('[meal-photo-analyze] Response:', JSON.stringify(data, null, 2));

        // Check if response indicates an error from the edge function
        if (data?.error) {
            console.error('[meal-photo-analyze] Server returned error:', data.error);
            return null;
        }

        return data as MealPhotoAnalysisResult;
    } catch (e) {
        console.error('[meal-photo-analyze] Exception:', e);
        return null; // Let UI handle failure
    }
}

export async function createUserProfile(
    userId: string,
    email: string
): Promise<UserProfile | null> {
    // The profile is automatically created by a database trigger when a user signs up
    // So we just need to fetch it. If it doesn't exist yet, wait a moment and retry.
    let profile = await getUserProfile(userId);

    if (!profile) {
        // Wait a moment for the trigger to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        profile = await getUserProfile(userId);
    }

    return profile;
}

// Types for glucose logs
export type GlucoseContext = 'pre_meal' | 'post_meal' | 'random' | 'fasting' | 'bedtime';

export interface GlucoseLog {
    id: string;
    user_id: string;
    glucose_level: number;
    unit: string;
    logged_at: string;
    context: GlucoseContext | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateGlucoseLogInput {
    glucose_level: number;
    unit?: string;
    logged_at: string;
    context?: GlucoseContext | null;
    notes?: string | null;
}

// Helper functions for glucose logs
export async function createGlucoseLog(
    userId: string,
    input: CreateGlucoseLogInput
): Promise<GlucoseLog | null> {
    const { data, error } = await supabase
        .from('glucose_logs')
        .insert({
            user_id: userId,
            glucose_level: input.glucose_level,
            unit: input.unit || 'mmol/L',
            logged_at: input.logged_at,
            context: input.context || null,
            notes: input.notes || null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating glucose log:', error);
        return null;
    }

    return data;
}

export async function getGlucoseLogs(
    userId: string,
    limit: number = 50
): Promise<GlucoseLog[]> {
    const { data, error } = await supabase
        .from('glucose_logs')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching glucose logs:', error);
        return [];
    }

    return data || [];
}

export async function getGlucoseLogById(
    logId: string,
    userId: string
): Promise<GlucoseLog | null> {
    const { data, error } = await supabase
        .from('glucose_logs')
        .select('*')
        .eq('id', logId)
        .eq('user_id', userId)
        .single();

    if (error) {
        console.error('Error fetching glucose log by id:', error);
        return null;
    }

    return data;
}

export async function updateGlucoseLog(
    logId: string,
    userId: string,
    updates: Partial<Pick<GlucoseLog, 'glucose_level' | 'unit' | 'context' | 'notes' | 'logged_at'>>
): Promise<GlucoseLog | null> {
    const { data, error } = await supabase
        .from('glucose_logs')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', logId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        console.error('Error updating glucose log:', error);
        return null;
    }

    return data;
}

export async function deleteGlucoseLog(logId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
        .from('glucose_logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);

    if (error) {
        console.error('Error deleting glucose log:', error);
        return false;
    }
    return true;
}

export async function getGlucoseLogsByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
): Promise<GlucoseLog[]> {
    const { data, error } = await supabase
        .from('glucose_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', startDate.toISOString())
        .lte('logged_at', endDate.toISOString())
        .order('logged_at', { ascending: true });

    if (error) {
        console.error('Error fetching glucose logs by date range:', error);
        return [];
    }

    return data || [];
}

// Types for activity logs
export type ActivityIntensity = 'light' | 'moderate' | 'intense';

export interface ActivityLog {
    id: string;
    user_id: string;
    activity_name: string;
    logged_at: string;
    duration_minutes: number;
    intensity: ActivityIntensity;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateActivityLogInput {
    activity_name: string;
    logged_at: string;
    duration_minutes: number;
    intensity: ActivityIntensity;
    notes?: string | null;
}

// Helper functions for activity logs
export async function createActivityLog(
    userId: string,
    input: CreateActivityLogInput
): Promise<ActivityLog | null> {
    const { data, error } = await supabase
        .from('activity_logs')
        .insert({
            user_id: userId,
            activity_name: input.activity_name,
            logged_at: input.logged_at,
            duration_minutes: input.duration_minutes,
            intensity: input.intensity,
            notes: input.notes || null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating activity log:', error);
        return null;
    }

    return data;
}

export async function getActivityLogs(
    userId: string,
    limit: number = 50
): Promise<ActivityLog[]> {
    const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching activity logs:', error);
        return [];
    }

    return data || [];
}

export async function getActivityLogById(
    logId: string,
    userId: string
): Promise<ActivityLog | null> {
    const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('id', logId)
        .eq('user_id', userId)
        .single();

    if (error) {
        console.error('Error fetching activity log by id:', error);
        return null;
    }

    return data;
}

export async function updateActivityLog(
    logId: string,
    userId: string,
    updates: Partial<Pick<ActivityLog, 'activity_name' | 'duration_minutes' | 'intensity' | 'notes' | 'logged_at'>>
): Promise<ActivityLog | null> {
    const { data, error } = await supabase
        .from('activity_logs')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', logId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        console.error('Error updating activity log:', error);
        return null;
    }

    return data;
}

export async function deleteActivityLog(logId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
        .from('activity_logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);

    if (error) {
        console.error('Error deleting activity log:', error);
        return false;
    }
    return true;
}

export async function getActivityLogsByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
): Promise<ActivityLog[]> {
    const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', startDate.toISOString())
        .lte('logged_at', endDate.toISOString())
        .order('logged_at', { ascending: true });

    if (error) {
        console.error('Error fetching activity logs by date range:', error);
        return [];
    }

    return data || [];
}

// Types for weight logs
export type WeightSource = 'manual' | 'apple_health' | 'imported';

export interface WeightLog {
    id: string;
    user_id: string;
    weight_kg: number;
    logged_at: string;
    source: WeightSource;
    created_at: string;
    updated_at: string;
}

export interface CreateWeightLogInput {
    weight_kg: number;
    logged_at: string;
    source?: WeightSource;
}

export async function createWeightLog(
    userId: string,
    input: CreateWeightLogInput
): Promise<WeightLog | null> {
    const { data, error } = await supabase
        .from('weight_logs')
        .insert({
            user_id: userId,
            weight_kg: input.weight_kg,
            logged_at: input.logged_at,
            source: input.source ?? 'manual',
        })
        .select()
        .single();

    if (error) {
        if (isMissingTableError(error, 'weight_logs')) {
            warnSchemaFallbackOnce(
                'missing_weight_logs_table',
                'Weight logging is unavailable until the latest migration is applied.',
                error
            );
            return null;
        }
        console.error('Error creating weight log:', error);
        return null;
    }

    return data;
}

export async function getWeightLogsByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
): Promise<WeightLog[]> {
    const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', startDate.toISOString())
        .lte('logged_at', endDate.toISOString())
        .order('logged_at', { ascending: true });

    if (error) {
        if (isMissingTableError(error, 'weight_logs')) {
            warnSchemaFallbackOnce(
                'missing_weight_logs_table',
                'Weight trends are temporarily unavailable until the latest migration is applied.',
                error
            );
            return [];
        }
        console.error('Error fetching weight logs by date range:', error);
        return [];
    }

    return data || [];
}

export async function updateWeightLog(
    logId: string,
    userId: string,
    updates: Partial<Pick<WeightLog, 'weight_kg' | 'logged_at' | 'source'>>
): Promise<WeightLog | null> {
    const { data, error } = await supabase
        .from('weight_logs')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', logId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        if (isMissingTableError(error, 'weight_logs')) {
            warnSchemaFallbackOnce(
                'missing_weight_logs_table',
                'Weight logging updates are unavailable until the latest migration is applied.',
                error
            );
            return null;
        }
        console.error('Error updating weight log:', error);
        return null;
    }

    return data;
}

export async function deleteWeightLog(logId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
        .from('weight_logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);

    if (error) {
        if (isMissingTableError(error, 'weight_logs')) {
            warnSchemaFallbackOnce(
                'missing_weight_logs_table',
                'Weight log deletion is unavailable until the latest migration is applied.',
                error
            );
            return false;
        }
        console.error('Error deleting weight log:', error);
        return false;
    }

    return true;
}

// ==========================================
// MEAL AND FOOD TYPES
// ==========================================

export interface NormalizedFood {
    provider: 'fdc' | 'off';
    external_id: string;
    display_name: string;
    brand: string | null;
    serving_size: number | null;
    serving_unit: string | null;
    calories_kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    per_100g?: {
        calories_kcal: number | null;
        carbs_g: number | null;
        protein_g: number | null;
        fat_g: number | null;
    };
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Meal {
    id: string;
    user_id: string;
    name: string;
    meal_type: MealType | null;
    logged_at: string;
    photo_path: string | null;
    notes: string | null;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
    created_at: string;
    updated_at: string;
}

export interface MealItem {
    id: string;
    meal_id: string;
    user_id: string;
    provider: 'fdc' | 'off';
    external_id: string;
    display_name: string;
    brand: string | null;
    quantity: number;
    unit: string;
    serving_size: number | null;
    serving_unit: string | null;
    nutrients: {
        calories_kcal: number | null;
        carbs_g: number | null;
        protein_g: number | null;
        fat_g: number | null;
        fibre_g: number | null;
        sugar_g: number | null;
        sodium_mg: number | null;
    };
    created_at: string;
}

export interface CreateMealInput {
    name: string;
    meal_type?: MealType | null;
    logged_at: string;
    photo_path?: string | null;
    notes?: string | null;
}

export interface CreateMealItemInput {
    provider: 'fdc' | 'off';
    external_id: string;
    display_name: string;
    brand?: string | null;
    quantity: number;
    unit: string;
    serving_size?: number | null;
    serving_unit?: string | null;
    nutrients: {
        calories_kcal: number | null;
        carbs_g: number | null;
        protein_g: number | null;
        fat_g: number | null;
        fibre_g: number | null;
        sugar_g: number | null;
        sodium_mg: number | null;
    };
}

// ==========================================
// MEAL FUNCTIONS
// ==========================================

export async function createMeal(
    userId: string,
    input: CreateMealInput
): Promise<Meal | null> {
    const { data, error } = await supabase
        .from('meals')
        .insert({
            user_id: userId,
            name: input.name,
            meal_type: input.meal_type || null,
            logged_at: input.logged_at,
            photo_path: input.photo_path || null,
            notes: input.notes || null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating meal:', error);
        return null;
    }

    return data;
}

export async function addMealItems(
    userId: string,
    mealId: string,
    items: CreateMealItemInput[]
): Promise<MealItem[]> {
    const itemsToInsert = items.map(item => ({
        meal_id: mealId,
        user_id: userId,
        provider: item.provider,
        external_id: item.external_id,
        display_name: item.display_name,
        brand: item.brand || null,
        quantity: item.quantity,
        unit: item.unit,
        serving_size: item.serving_size || null,
        serving_unit: item.serving_unit || null,
        nutrients: item.nutrients,
    }));

    const { data, error } = await supabase
        .from('meal_items')
        .insert(itemsToInsert)
        .select();

    if (error) {
        console.error('Error adding meal items:', error);
        throw new Error(`Failed to save meal items: ${error.message}`);
    }

    return data || [];
}

export async function deleteMeal(mealId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
        .from('meals')
        .delete()
        .eq('id', mealId)
        .eq('user_id', userId);

    if (error) {
        console.error('Error deleting meal:', error);
        return false;
    }
    return true;
}

export async function getMealsByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
): Promise<Meal[]> {
    const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', startDate.toISOString())
        .lte('logged_at', endDate.toISOString())
        .order('logged_at', { ascending: false });

    if (error) {
        console.error('Error fetching meals:', error);
        return [];
    }

    return data || [];
}

export async function getMeals(
    userId: string,
    limit: number = 50
): Promise<Meal[]> {
    const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching meals:', error);
        return [];
    }

    return data || [];
}

export async function getMealById(
    mealId: string,
    userId: string
): Promise<Meal | null> {
    const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('id', mealId)
        .eq('user_id', userId)
        .single();

    if (error) {
        console.error('Error fetching meal by id:', error);
        return null;
    }

    return data;
}

export async function updateMeal(
    mealId: string,
    userId: string,
    updates: Partial<Pick<Meal, 'name' | 'meal_type' | 'notes' | 'logged_at'>>
): Promise<Meal | null> {
    const { data, error } = await supabase
        .from('meals')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', mealId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        console.error('Error updating meal:', error);
        return null;
    }

    return data;
}

export async function getMealItems(mealId: string): Promise<MealItem[]> {
    const { data, error } = await supabase
        .from('meal_items')
        .select('*')
        .eq('meal_id', mealId);

    if (error) {
        console.error('Error fetching meal items:', error);
        return [];
    }

    return data || [];
}

// ==========================================
// FIBRE INTAKE SUMMARY
// ==========================================

export type FibreRange = 'today' | 'week' | 'month';

export interface FibreIntakeSummary {
    totalFibre: number;
    avgPerDay: number;
    startDate: string;
    endDate: string;
}

/**
 * Get fibre intake summary for a given time range
 * @param userId - User ID
 * @param range - 'today' | 'week' | 'month'
 * @returns Summary with total fibre, avg per day, and date range
 */
export async function getFibreIntakeSummary(
    userId: string,
    range: FibreRange
): Promise<FibreIntakeSummary | null> {
    // Calculate date range based on local time
    const now = new Date();
    let startDate: Date;
    let daysInRange: number;

    switch (range) {
        case 'today':
            // Start of today (local midnight)
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            daysInRange = 1;
            break;
        case 'week':
            // 7 days ago at midnight
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            daysInRange = 7;
            break;
        case 'month':
            // 30 days ago at midnight
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
            daysInRange = 30;
            break;
    }

    const endDate = now;

    try {
        // Try using optimized database function first (if migration has been run)
        const { data: functionResult, error: functionError } = await supabase
            .rpc('get_fibre_intake_summary', {
                p_user_id: userId,
                p_start_date: startDate.toISOString(),
                p_end_date: endDate.toISOString(),
            });

        // If function exists and succeeds, use it
        if (!functionError && functionResult && functionResult.length > 0) {
            const result = functionResult[0];
            return {
                totalFibre: Math.round(Number(result.total_fibre) * 10) / 10,
                avgPerDay: Math.round(Number(result.avg_per_day) * 10) / 10,
                startDate: result.start_date,
                endDate: result.end_date,
            };
        }

        // Fallback to 2-query approach if function doesn't exist yet
        // This ensures backward compatibility before migration is run
        const { data: meals, error: mealsError } = await supabase
            .from('meals')
            .select('id')
            .eq('user_id', userId)
            .gte('logged_at', startDate.toISOString())
            .lte('logged_at', endDate.toISOString());

        if (mealsError) {
            console.error('Error fetching meals for fibre:', mealsError);
            return null;
        }

        if (!meals || meals.length === 0) {
            // No meals in range
            return {
                totalFibre: 0,
                avgPerDay: 0,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            };
        }

        const mealIds = meals.map(m => m.id);

        // Get all meal items for these meals
        const { data: mealItems, error: itemsError } = await supabase
            .from('meal_items')
            .select('quantity, nutrients')
            .in('meal_id', mealIds);

        if (itemsError) {
            console.error('Error fetching meal items for fibre:', itemsError);
            return null;
        }

        // Calculate total fibre (fibre_g * quantity for each item)
        let totalFibre = 0;
        (mealItems || []).forEach(item => {
            const fibreG = item.nutrients?.fibre_g ?? 0;
            const quantity = item.quantity ?? 1;
            totalFibre += fibreG * quantity;
        });

        // Calculate average per day
        const avgPerDay = totalFibre / daysInRange;

        return {
            totalFibre: Math.round(totalFibre * 10) / 10,
            avgPerDay: Math.round(avgPerDay * 10) / 10,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
        };
    } catch (error) {
        console.error('Error calculating fibre intake:', error);
        return null;
    }
}

// ==========================================
// FOOD SEARCH FUNCTIONS (via Edge Functions)
// ==========================================

export async function searchFoods(query: string, pageSize: number = 25): Promise<NormalizedFood[]> {
    try {
        const { data, error } = await supabase.functions.invoke('food-search', {
            body: { query, pageSize },
        });

        if (error) {
            console.error('Food search error:', error);
            return [];
        }

        return data?.results || [];
    } catch (err) {
        console.error('Food search failed:', err);
        return [];
    }
}

/**
 * Search for foods with variants in a single Edge call
 * Reduces network round trips by batching main query + variants
 * 
 * @param query - Main search query
 * @param variants - Alternative query variants (typo fixes, synonyms)
 * @param pageSize - Maximum results to return
 */
export async function searchFoodsWithVariants(
    query: string,
    variants: string[] = [],
    pageSize: number = 25
): Promise<NormalizedFood[]> {
    try {
        const { data, error } = await supabase.functions.invoke('food-search', {
            body: {
                query,
                pageSize,
                variants: variants.slice(0, 3), // Limit to 3 variants
            },
        });

        if (error) {
            console.error('Food search with variants error:', error);
            return [];
        }

        return data?.results || [];
    } catch (err) {
        console.error('Food search with variants failed:', err);
        return [];
    }
}

export async function getFoodDetails(
    provider: 'fdc' | 'off',
    externalId: string
): Promise<NormalizedFood | null> {
    try {
        const { data, error } = await supabase.functions.invoke('food-details', {
            body: { provider, externalId },
        });

        if (error) {
            console.error('Food details error:', error);
            return null;
        }

        return data?.food || null;
    } catch (err) {
        console.error('Food details failed:', err);
        return null;
    }
}

export async function getFoodByBarcode(barcode: string): Promise<NormalizedFood | null> {
    try {
        const { data, error } = await supabase.functions.invoke('food-barcode', {
            body: { barcode },
        });

        if (error) {
            console.error('Barcode lookup error:', error);
            return null;
        }

        return data?.food || null;
    } catch (err) {
        console.error('Barcode lookup failed:', err);
        return null;
    }
}

// ============ FAVORITE FOODS ============

export interface FavoriteFood {
    id: string;
    user_id: string;
    provider: 'fdc' | 'off';
    external_id: string;
    display_name: string;
    brand: string | null;
    serving_size: number | null;
    serving_unit: string | null;
    nutrients: {
        calories_kcal?: number | null;
        carbs_g?: number | null;
        protein_g?: number | null;
        fat_g?: number | null;
        fibre_g?: number | null;
        sugar_g?: number | null;
        sodium_mg?: number | null;
    };
    created_at: string;
}

export async function addFavoriteFood(
    userId: string,
    food: NormalizedFood
): Promise<FavoriteFood | null> {
    const { data, error } = await supabase
        .from('favorite_foods')
        .upsert({
            user_id: userId,
            provider: food.provider,
            external_id: food.external_id,
            display_name: food.display_name,
            brand: food.brand,
            serving_size: food.serving_size,
            serving_unit: food.serving_unit,
            nutrients: {
                calories_kcal: food.calories_kcal,
                carbs_g: food.carbs_g,
                protein_g: food.protein_g,
                fat_g: food.fat_g,
                fibre_g: food.fibre_g,
                sugar_g: food.sugar_g,
                sodium_mg: food.sodium_mg,
            },
        }, { onConflict: 'user_id,provider,external_id' })
        .select()
        .single();

    if (error) {
        console.error('Error adding favorite:', error);
        return null;
    }
    return data;
}

export async function removeFavoriteFood(
    userId: string,
    provider: 'fdc' | 'off',
    externalId: string
): Promise<boolean> {
    const { error } = await supabase
        .from('favorite_foods')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('external_id', externalId);

    if (error) {
        console.error('Error removing favorite:', error);
        return false;
    }
    return true;
}

export async function getFavoriteFoods(userId: string): Promise<NormalizedFood[]> {
    const { data, error } = await supabase
        .from('favorite_foods')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching favorites:', error);
        return [];
    }

    // Convert to NormalizedFood format
    return (data || []).map((fav: FavoriteFood) => ({
        provider: fav.provider,
        external_id: fav.external_id,
        display_name: fav.display_name,
        brand: fav.brand,
        serving_size: fav.serving_size,
        serving_unit: fav.serving_unit,
        calories_kcal: fav.nutrients?.calories_kcal ?? null,
        carbs_g: fav.nutrients?.carbs_g ?? null,
        protein_g: fav.nutrients?.protein_g ?? null,
        fat_g: fav.nutrients?.fat_g ?? null,
        fibre_g: fav.nutrients?.fibre_g ?? null,
        sugar_g: fav.nutrients?.sugar_g ?? null,
        sodium_mg: fav.nutrients?.sodium_mg ?? null,
    }));
}

export async function isFoodFavorited(
    userId: string,
    provider: 'fdc' | 'off',
    externalId: string
): Promise<boolean> {
    const { count, error } = await supabase
        .from('favorite_foods')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('external_id', externalId);

    if (error) {
        console.error('Error checking favorite:', error);
        return false;
    }
    return (count ?? 0) > 0;
}

// ============ RECENT FOODS ============

export interface RecentFood {
    id: string;
    user_id: string;
    provider: 'fdc' | 'off';
    external_id: string;
    display_name: string;
    brand: string | null;
    serving_size: number | null;
    serving_unit: string | null;
    nutrients: {
        calories_kcal?: number | null;
        carbs_g?: number | null;
        protein_g?: number | null;
        fat_g?: number | null;
        fibre_g?: number | null;
        sugar_g?: number | null;
        sodium_mg?: number | null;
    };
    used_at: string;
}

export async function addRecentFood(
    userId: string,
    food: NormalizedFood
): Promise<RecentFood | null> {
    const { data, error } = await supabase
        .from('recent_foods')
        .upsert({
            user_id: userId,
            provider: food.provider,
            external_id: food.external_id,
            display_name: food.display_name,
            brand: food.brand,
            serving_size: food.serving_size,
            serving_unit: food.serving_unit,
            nutrients: {
                calories_kcal: food.calories_kcal,
                carbs_g: food.carbs_g,
                protein_g: food.protein_g,
                fat_g: food.fat_g,
                fibre_g: food.fibre_g,
                sugar_g: food.sugar_g,
                sodium_mg: food.sodium_mg,
            },
            used_at: new Date().toISOString(),
        }, { onConflict: 'user_id,provider,external_id' })
        .select()
        .single();

    if (error) {
        console.error('Error adding recent:', error);
        return null;
    }
    return data;
}

export async function getRecentFoods(userId: string, limit = 50): Promise<NormalizedFood[]> {
    const { data, error } = await supabase
        .from('recent_foods')
        .select('*')
        .eq('user_id', userId)
        .order('used_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching recents:', error);
        return [];
    }

    // Convert to NormalizedFood format with used_at for display
    return (data || []).map((recent: RecentFood) => ({
        provider: recent.provider,
        external_id: recent.external_id,
        display_name: recent.display_name,
        brand: recent.brand,
        serving_size: recent.serving_size,
        serving_unit: recent.serving_unit,
        calories_kcal: recent.nutrients?.calories_kcal ?? null,
        carbs_g: recent.nutrients?.carbs_g ?? null,
        protein_g: recent.nutrients?.protein_g ?? null,
        fat_g: recent.nutrients?.fat_g ?? null,
        fibre_g: recent.nutrients?.fibre_g ?? null,
        sugar_g: recent.nutrients?.sugar_g ?? null,
        sodium_mg: recent.nutrients?.sodium_mg ?? null,
        // Add used_at for display purposes (as a custom field)
        _usedAt: recent.used_at,
    })) as NormalizedFood[];
}

// ==========================================
// PRE MEAL CHECK (AI ANALYSIS)
// ==========================================

export interface PremealDriver {
    text: string;
    reason_code: string;
}

export interface PremealAdjustmentTip {
    title: string;
    detail: string;
    benefit_level: 'low' | 'medium' | 'high'; // Replaced risk_reduction_pct
    action_type: string;
}

export interface PremealResult {
    drivers: PremealDriver[];
    adjustment_tips: PremealAdjustmentTip[];
    debug: {
        net_carbs: number;
        fibre_g: number;
        protein_g: number;
        fat_g: number;
        time_bucket: string;
        recent_spike_avg: number | null;
    };
    wellness_score?: number;
}

export interface PremealMealItem {
    display_name: string;
    quantity: number;
    unit?: string | null;
    nutrients: {
        calories_kcal?: number | null;
        carbs_g?: number | null;
        protein_g?: number | null;
        fat_g?: number | null;
        fibre_g?: number | null;
    };
}

export interface PremealMealDraft {
    name: string;
    logged_at: string;
    items: PremealMealItem[];
}

/**
 * Calls the premeal-analyze Edge Function to get AI-powered meal analysis
 * Returns meal drivers and wellness-focused adjustment tips
 */
export async function invokePremealAnalyze(
    userId: string,
    mealDraft: PremealMealDraft
): Promise<PremealResult | null> {
    try {
        const { data, error } = await supabase.functions.invoke('premeal-analyze', {
            body: {
                user_id: userId,
                meal_draft: mealDraft,
            },
        });

        if (error) {
            console.error('Error invoking premeal-analyze:', error);
            return null;
        }

        return data as PremealResult;
    } catch (error) {
        console.error('Pre Meal Check error:', error);
        return null;
    }
}

// ==========================================
// DAILY CONTEXT (HealthKit Data Persistence)
// ==========================================

export type DailyContextSource = 'apple_health' | 'manual' | 'estimated';

export type SleepQuality = 'poor' | 'fair' | 'good' | 'excellent';

export interface DailyContext {
    user_id: string;
    date: string; // YYYY-MM-DD format
    steps: number | null;
    active_minutes: number | null;
    sleep_hours: number | null;
    sleep_quality: SleepQuality | null;
    resting_hr: number | null;
    hrv_ms: number | null;
    stress_level: number | null; // 1-5 scale
    source: DailyContextSource;
    last_synced_at: string;
    created_at: string;
    updated_at: string;
}

export interface DailyContextInput {
    date: string;
    steps?: number | null;
    active_minutes?: number | null;
    sleep_hours?: number | null;
    sleep_quality?: SleepQuality | null;
    resting_hr?: number | null;
    hrv_ms?: number | null;
    stress_level?: number | null; // 1-5 scale
    source?: DailyContextSource;
}

/**
 * Upsert daily context data (HealthKit or manual)
 * Uses ON CONFLICT to update existing records
 */
export async function upsertDailyContext(
    userId: string,
    input: DailyContextInput
): Promise<DailyContext | null> {
    const { data, error } = await supabase
        .from('daily_context')
        .upsert(
            {
                user_id: userId,
                date: input.date,
                steps: input.steps,
                active_minutes: input.active_minutes,
                sleep_hours: input.sleep_hours,
                sleep_quality: input.sleep_quality,
                resting_hr: input.resting_hr,
                hrv_ms: input.hrv_ms,
                stress_level: input.stress_level,
                source: input.source || 'apple_health',
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,date' }
        )
        .select()
        .single();

    if (error) {
        console.error('Error upserting daily context:', error);
        return null;
    }

    return data;
}

/**
 * Get daily context for a date range
 */
export async function getDailyContextByRange(
    userId: string,
    startDate: string,
    endDate: string
): Promise<DailyContext[]> {
    const { data, error } = await supabase
        .from('daily_context')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

    if (error) {
        // specific handling for HTML/Cloudflare errors to avoid console spam
        if (typeof error.message === 'string' && error.message.trim().startsWith('<')) {
            console.warn('Supabase service returned a 500/HTML error for daily context. Service might be down or paused.');
            return [];
        }
        console.error('Error fetching daily context:', error);
        return [];
    }

    return data || [];
}

/**
 * Get daily context for a specific date
 */
export async function getDailyContextForDate(
    userId: string,
    date: string
): Promise<DailyContext | null> {
    const { data, error } = await supabase
        .from('daily_context')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .single();

    if (error) {
        if (error.code !== 'PGRST116') { // Not found is OK
            console.error('Error fetching daily context:', error);
        }
        return null;
    }

    return data;
}

// ==========================================
// USER APP SESSIONS (retention)
// ==========================================

export interface UserAppSession {
    user_id: string;
    session_date: string;
    first_opened_at: string;
    platform: string;
    app_version: string | null;
    created_at: string;
    updated_at: string;
}

export async function upsertUserAppSessionForToday(
    userId: string,
    appVersion?: string
): Promise<UserAppSession | null> {
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
        .from('user_app_sessions')
        .upsert(
            {
                user_id: userId,
                session_date: today,
                first_opened_at: nowIso,
                platform: Platform.OS,
                app_version: appVersion ?? null,
                updated_at: nowIso,
            },
            { onConflict: 'user_id,session_date', ignoreDuplicates: true }
        )
        .select()
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error, 'user_app_sessions')) {
            warnSchemaFallbackOnce(
                'missing_user_app_sessions_table',
                'Session retention tracking is unavailable until the latest migration is applied.',
                error
            );
            return null;
        }
        console.error('Error upserting user app session:', error);
        return null;
    }

    if (data) return data;

    // If conflict ignored, fetch existing row for deterministic return value.
    const { data: existing, error: fetchError } = await supabase
        .from('user_app_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('session_date', today)
        .maybeSingle();

    if (fetchError) {
        if (isMissingTableError(fetchError, 'user_app_sessions')) {
            warnSchemaFallbackOnce(
                'missing_user_app_sessions_table',
                'Session retention tracking is unavailable until the latest migration is applied.',
                fetchError
            );
            return null;
        }
        console.error('Error fetching existing app session:', fetchError);
        return null;
    }

    return existing ?? null;
}

// ==========================================
// ACTION LOOPS (Insight -> Action -> Outcome)
// ==========================================

export type UserActionStatus = 'active' | 'completed' | 'expired' | 'cancelled';

export interface UserAction {
    id: string;
    user_id: string;
    source_insight_id: string | null;
    title: string;
    description: string;
    action_type: string;
    action_params: Record<string, any>;
    window_start: string;
    window_end: string;
    status: UserActionStatus;
    completed_at: string | null;
    completion_source: string | null;
    baseline_metric: Record<string, any> | null;
    outcome_metric: Record<string, any> | null;
    delta_value: number | null;
    improved: boolean | null;
    last_evaluated_at: string | null;
    created_at: string;
    updated_at: string;
    cta?: {
        label: string;
        route: string;
    };
}

export interface CreateUserActionInput {
    source_insight_id?: string | null;
    title: string;
    description: string;
    action_type: string;
    action_params?: Record<string, any>;
    window_start?: string;
    window_end: string;
    baseline_metric?: Record<string, any> | null;
}

export async function createUserAction(
    userId: string,
    input: CreateUserActionInput
): Promise<UserAction | null> {
    const { data, error } = await supabase
        .from('user_actions')
        .insert({
            user_id: userId,
            source_insight_id: input.source_insight_id ?? null,
            title: input.title,
            description: input.description,
            action_type: input.action_type,
            action_params: input.action_params ?? {},
            window_start: input.window_start ?? new Date().toISOString(),
            window_end: input.window_end,
            baseline_metric: input.baseline_metric ?? null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating user action:', error);
        return null;
    }

    return data;
}

export async function updateUserAction(
    actionId: string,
    updates: Partial<UserAction>
): Promise<UserAction | null> {
    const { data, error } = await supabase
        .from('user_actions')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', actionId)
        .select()
        .single();

    if (error) {
        console.error('Error updating user action:', error);
        return null;
    }

    return data;
}

export async function getUserActionsByStatus(
    userId: string,
    statuses: UserActionStatus[] = ['active']
): Promise<UserAction[]> {
    const { data, error } = await supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .in('status', statuses)
        .order('window_end', { ascending: true });

    if (error) {
        console.error('Error fetching user actions:', error);
        return [];
    }

    return data || [];
}

// ==========================================
// CARE PATHWAYS (Structured 7-day plans)
// ==========================================

export interface CarePathwayStep {
    id: string;
    day: number;
    title: string;
    description: string;
    action_type: string;
    action_params?: Record<string, any>;
}

export interface CarePathwayTemplate {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    duration_days: number;
    steps: CarePathwayStep[];
    eligibility_rules: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export type CarePathwayStatus = 'active' | 'completed' | 'expired' | 'cancelled';

export interface UserCarePathway {
    id: string;
    user_id: string;
    template_id: string;
    status: CarePathwayStatus;
    start_at: string;
    end_at: string;
    baseline_metrics: Record<string, any> | null;
    outcome_metrics: Record<string, any> | null;
    delta: Record<string, any> | null;
    progress: Record<string, any>;
    created_at: string;
    updated_at: string;
    template?: CarePathwayTemplate;
}

export async function getCarePathwayTemplates(): Promise<CarePathwayTemplate[]> {
    const { data, error } = await supabase
        .from('care_pathway_templates')
        .select('*')
        .order('duration_days', { ascending: true });

    if (error) {
        console.error('Error fetching care pathway templates:', error);
        return [];
    }

    return data || [];
}

export async function getActiveCarePathway(
    userId: string
): Promise<UserCarePathway | null> {
    const { data, error } = await supabase
        .from('user_care_pathways')
        .select('*, template:care_pathway_templates(*)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('start_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error fetching active care pathway:', error);
        return null;
    }

    return data || null;
}

export async function startCarePathway(
    userId: string,
    templateId: string,
    endAt: string,
    baselineMetrics?: Record<string, any> | null
): Promise<UserCarePathway | null> {
    const { data, error } = await supabase
        .from('user_care_pathways')
        .insert({
            user_id: userId,
            template_id: templateId,
            end_at: endAt,
            baseline_metrics: baselineMetrics ?? null,
        })
        .select('*, template:care_pathway_templates(*)')
        .single();

    if (error) {
        console.error('Error starting care pathway:', error);
        return null;
    }

    return data;
}

export async function updateCarePathway(
    pathwayId: string,
    updates: Partial<UserCarePathway>
): Promise<UserCarePathway | null> {
    const { data, error } = await supabase
        .from('user_care_pathways')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', pathwayId)
        .select('*, template:care_pathway_templates(*)')
        .single();

    if (error) {
        console.error('Error updating care pathway:', error);
        return null;
    }

    return data;
}

// ==========================================
// METABOLIC DAILY FEATURE STORE
// ==========================================

export interface MetabolicDailyFeature {
    user_id: string;
    date: string;
    feature_version: number;
    glucose_avg: number | null;
    glucose_cv: number | null;
    glucose_logs_count: number;
    time_in_range_pct: number | null;
    meal_count: number;
    meal_checkin_count: number;
    fibre_g_avg: number | null;
    steps: number | null;
    active_minutes: number | null;
    sleep_hours: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
    interactions: Record<string, any>;
    last_synced_at: string;
    created_at: string;
    updated_at: string;
}

export async function upsertMetabolicDailyFeature(
    userId: string,
    input: Omit<MetabolicDailyFeature, 'user_id' | 'created_at' | 'updated_at' | 'last_synced_at'>
): Promise<MetabolicDailyFeature | null> {
    const { data, error } = await supabase
        .from('metabolic_daily_features')
        .upsert(
            {
                user_id: userId,
                ...input,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,date' }
        )
        .select()
        .single();

    if (error) {
        console.error('Error upserting daily feature:', error);
        return null;
    }

    return data;
}

export async function getMetabolicDailyFeaturesByRange(
    userId: string,
    startDate: string,
    endDate: string
): Promise<MetabolicDailyFeature[]> {
    const { data, error } = await supabase
        .from('metabolic_daily_features')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

    if (error) {
        console.error('Error fetching daily features:', error);
        return [];
    }

    return data || [];
}

// ==========================================
// METABOLIC WEEKLY SCORES
// ==========================================

export interface MetabolicWeeklyScore {
    user_id: string;
    week_start: string;
    score7d: number | null;
    created_at: string;
    updated_at: string;
}

export async function getMetabolicWeeklyScores(
    userId: string,
    limit: number = 26
): Promise<MetabolicWeeklyScore[]> {
    const { data, error } = await supabase
        .from('user_metabolic_weekly_scores')
        .select('*')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching metabolic weekly scores:', error);
        return [];
    }

    return data || [];
}

// ==========================================
// EXERCISE ANALYSIS
// ==========================================

export interface ExerciseParsed {
    name: string;
    duration_min: number;
    intensity: 'light' | 'moderate' | 'vigorous';
    met_value: number;
    category: string;
}

export interface ExerciseTip {
    title: string;
    detail: string;
    icon: string;
}

export interface ExerciseGlucoseImpact {
    reduction_pct: number;
    timing_benefit: string;
    optimal_timing: string;
    personalized: boolean;
    based_on_history: boolean;
}

export interface ExercisePersonalization {
    data_quality: 'none' | 'low' | 'medium' | 'high';
    glucose_observations: number;
    activity_observations: number;
    baseline_glucose: number;
    exercise_effect: number;
}

export interface ExerciseAnalysisResult {
    exercise: ExerciseParsed;
    calories_burned: number;
    glucose_impact: ExerciseGlucoseImpact;
    tips: ExerciseTip[];
    user_stats: {
        weight_kg: number;
        age: number;
        bmi: number | null;
    };
    personalization: ExercisePersonalization;
}

/**
 * Calls the exercise-analyze Edge Function to get AI-powered exercise analysis
 * Returns calories burned, glucose impact, and personalized tips
 */
export async function invokeExerciseAnalyze(
    userId: string,
    exerciseText: string
): Promise<ExerciseAnalysisResult | null> {
    try {
        const { data, error } = await supabase.functions.invoke('exercise-analyze', {
            body: {
                user_id: userId,
                exercise_text: exerciseText,
            },
        });

        if (error) {
            console.error('Error invoking exercise-analyze:', error);
            return null;
        }

        return data as ExerciseAnalysisResult;
    } catch (error) {
        console.error('Exercise Analysis error:', error);
        return null;
    }
}

// ==========================================
// PERSONALIZED TIPS
// ==========================================

export interface PersonalizedTip {
    id: string;
    category: 'glucose' | 'meal' | 'activity';
    title: string;
    description: string;
    articleUrl: string;
    metric?: string;
}

export interface PersonalizedTipsResult {
    tips: PersonalizedTip[];
    stats: {
        glucose: { avgLevel: number | null; inRangePct: number | null; highReadingsCount: number; totalReadings: number };
        meal: { avgFibrePerDay: number | null; totalMeals: number };
        activity: { totalMinutes: number; sessionCount: number; activeDays: number };
    };
}

export async function getPersonalizedTips(userId: string): Promise<PersonalizedTipsResult | null> {
    try {
        const { data, error } = await supabase.functions.invoke('personalized-tips', {
            body: { user_id: userId },
        });

        if (error) {
            console.error('Error fetching personalized tips:', error);
            return null;
        }

        return data as PersonalizedTipsResult;
    } catch (error) {
        console.error('Personalized tips error:', error);
        return null;
    }
}

// ==========================================
// MEAL CHECKIN FUNCTIONS (Wellness-only after-meal check-ins)
// ==========================================

export type EnergyLevel = 'low' | 'steady' | 'high';
export type FullnessLevel = 'low' | 'okay' | 'high';
export type CravingsLevel = 'low' | 'medium' | 'high';
export type MoodLevel = 'low' | 'okay' | 'good';

export interface MealCheckin {
    id: string;
    user_id: string;
    meal_id: string;
    energy: EnergyLevel | null;
    fullness: FullnessLevel | null;
    cravings: CravingsLevel | null;
    mood: MoodLevel | null;
    movement_after: boolean | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface MealCheckinInput {
    energy?: EnergyLevel | null;
    fullness?: FullnessLevel | null;
    cravings?: CravingsLevel | null;
    mood?: MoodLevel | null;
    movement_after?: boolean | null;
    notes?: string | null;
}

// Upsert a meal check-in (create or update)
export async function upsertMealCheckin(
    userId: string,
    mealId: string,
    input: MealCheckinInput
): Promise<MealCheckin | null> {
    try {
        const { data, error } = await supabase
            .from('meal_checkins')
            .upsert({
                user_id: userId,
                meal_id: mealId,
                energy: input.energy ?? null,
                fullness: input.fullness ?? null,
                cravings: input.cravings ?? null,
                mood: input.mood ?? null,
                movement_after: input.movement_after ?? null,
                notes: input.notes ?? null,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,meal_id',
            })
            .select()
            .single();

        if (error) {
            console.error('Error upserting meal checkin:', error);
            return null;
        }

        return data as MealCheckin;
    } catch (error) {
        console.error('Meal checkin upsert error:', error);
        return null;
    }
}

// Get a meal check-in by meal ID
export async function getMealCheckin(mealId: string): Promise<MealCheckin | null> {
    try {
        const { data, error } = await supabase
            .from('meal_checkins')
            .select('*')
            .eq('meal_id', mealId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned - not an error
                return null;
            }
            console.error('Error fetching meal checkin:', error);
            return null;
        }

        return data as MealCheckin;
    } catch (error) {
        console.error('Get meal checkin error:', error);
        return null;
    }
}

// Get meals with their check-ins for a date range
export interface MealWithCheckin extends Meal {
    meal_checkins: MealCheckin[] | null;
}

export async function getMealsWithCheckinsByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
): Promise<MealWithCheckin[]> {
    try {
        const { data, error } = await supabase
            .from('meals')
            .select('*, meal_checkins(*)')
            .eq('user_id', userId)
            .gte('logged_at', startDate.toISOString())
            .lte('logged_at', endDate.toISOString())
            .order('logged_at', { ascending: false });

        if (error) {
            console.error('Error fetching meals with checkins:', error);
            return [];
        }

        return (data || []) as MealWithCheckin[];
    } catch (error) {
        console.error('Get meals with checkins error:', error);
        return [];
    }
}

// Delete a meal check-in
export async function deleteMealCheckin(mealId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('meal_checkins')
            .delete()
            .eq('meal_id', mealId);

        if (error) {
            console.error('Error deleting meal checkin:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Delete meal checkin error:', error);
        return false;
    }
}

// ==========================================
// EXPERIMENTS SYSTEM
// ==========================================

// Types for experiment templates (admin-seeded catalog)
export interface ExperimentTemplate {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    category: 'meal' | 'habit' | 'timing' | 'portion';
    protocol: {
        duration_days?: number;
        exposures_per_variant?: number;
        alternating?: boolean;
        meal_type?: string;
        checkin_questions?: string[];
        instructions?: string;
        science?: {
            title: string;
            description: string;
            steps: string[];
            study_link?: string;
        };
        [key: string]: any;
    };
    eligibility_rules: Record<string, any>;
    icon: string | null;
    is_active: boolean;
    sort_order: number;
    difficulty: 'easy' | 'medium' | 'hard' | null;
    impact: 'high' | 'medium' | 'low' | null;
    short_description: string | null;
    icon_color: string | null;
    created_at: string;
    updated_at: string;
}

// Types for experiment variants (A/B arms)
export interface ExperimentVariant {
    id: string;
    template_id: string;
    key: string;
    name: string;
    description: string | null;
    parameters: Record<string, any>;
    sort_order: number;
    created_at: string;
}

// Types for user's experiment run
export type ExperimentStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface UserExperiment {
    id: string;
    user_id: string;
    template_id: string;
    status: ExperimentStatus;
    start_at: string | null;
    end_at: string | null;
    completed_at: string | null;
    plan: Record<string, any>;
    primary_metric: string;
    metric_config: Record<string, any>;
    personalization: {
        reasons?: string[];
        predicted_impact?: 'high' | 'moderate' | 'low';
        [key: string]: any;
    };
    exposures_logged: number;
    checkins_logged: number;
    created_at: string;
    updated_at: string;
    // Joined data
    experiment_templates?: ExperimentTemplate;
}

// Types for experiment events
export type ExperimentEventType = 'exposure' | 'checkin' | 'note' | 'link_meal' | 'link_activity';

export interface UserExperimentEvent {
    id: string;
    user_id: string;
    user_experiment_id: string;
    occurred_at: string;
    type: ExperimentEventType;
    payload: {
        variant_id?: string;
        variant_key?: string;
        meal_id?: string;
        activity_log_id?: string;
        adherence_pct?: number;
        energy_1_5?: number;
        hunger_1_5?: number;
        cravings_1_5?: number;
        difficulty_1_5?: number;
        notes?: string;
        text?: string;
        [key: string]: any;
    };
    created_at: string;
}

// Types for experiment analysis
export interface VariantMetrics {
    n_exposures: number;
    n_with_glucose_data: number;
    median_peak_delta: number | null;
    mean_peak_delta: number | null;
    median_time_to_peak: number | null;
    avg_energy: number | null;
    avg_hunger: number | null;
    avg_cravings: number | null;
}

export interface ExperimentComparison {
    winner: string | null;
    delta: number | null;
    confidence: 'high' | 'moderate' | 'low' | 'insufficient';
    direction: 'better' | 'worse' | 'similar' | 'unknown';
}

export interface UserExperimentAnalysis {
    id: string;
    user_id: string;
    user_experiment_id: string;
    computed_at: string;
    metrics: Record<string, VariantMetrics>;
    comparison: ExperimentComparison;
    summary: string | null;
    suggestions: string[];
    is_final: boolean;
    created_at: string;
}

// Types for suggested experiments (from Edge Function)
export interface SuggestedExperiment {
    template: ExperimentTemplate;
    variants: ExperimentVariant[];
    score: number;
    reasons: string[];
    recommended_parameters: Record<string, any>;
    predicted_impact: 'high' | 'moderate' | 'low';
}

// ==========================================
// EXPERIMENT HELPER FUNCTIONS
// ==========================================

/**
 * Fetch all active experiment templates
 */
export async function getExperimentTemplates(): Promise<ExperimentTemplate[]> {
    const { data, error } = await supabase
        .from('experiment_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

    if (error) {
        console.error('Error fetching experiment templates:', error);
        return [];
    }

    return data || [];
}

/**
 * Fetch variants for a specific template
 */
export async function getExperimentVariants(templateId: string): Promise<ExperimentVariant[]> {
    const { data, error } = await supabase
        .from('experiment_variants')
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order');

    if (error) {
        console.error('Error fetching experiment variants:', error);
        return [];
    }

    return data || [];
}

/**
 * Get personalized experiment suggestions via Edge Function
 */
export async function getSuggestedExperiments(
    userId: string,
    limit: number = 6
): Promise<{
    suggestions: SuggestedExperiment[];
    patterns: Record<string, any>;
} | null> {
    try {
        const { data, error } = await supabase.functions.invoke('experiments-suggest', {
            body: { user_id: userId, limit },
        });

        if (error) {
            console.error('Error fetching suggested experiments:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Suggested experiments error:', err);
        return null;
    }
}

/**
 * Start a new experiment from a template
 */
export async function startUserExperiment(
    userId: string,
    templateId: string,
    planOverrides?: Record<string, any>,
    personalization?: { reasons?: string[]; predicted_impact?: string }
): Promise<UserExperiment | null> {
    const { data, error } = await supabase
        .from('user_experiments')
        .insert({
            user_id: userId,
            template_id: templateId,
            status: 'active',
            start_at: new Date().toISOString(),
            plan: planOverrides || {},
            personalization: personalization || {},
        })
        .select()
        .single();

    if (error) {
        console.error('Error starting experiment:', error);
        return null;
    }

    return data;
}

/**
 * Update experiment status
 */
export async function updateUserExperimentStatus(
    experimentId: string,
    status: ExperimentStatus
): Promise<boolean> {
    const updateData: any = { status, updated_at: new Date().toISOString() };

    if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
        .from('user_experiments')
        .update(updateData)
        .eq('id', experimentId);

    if (error) {
        console.error('Error updating experiment status:', error);
        return false;
    }

    return true;
}

/**
 * Get user's experiments (optionally filtered by status)
 */
export async function getUserExperiments(
    userId: string,
    status?: ExperimentStatus | ExperimentStatus[]
): Promise<UserExperiment[]> {
    let query = supabase
        .from('user_experiments')
        .select('*, experiment_templates(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (status) {
        if (Array.isArray(status)) {
            query = query.in('status', status);
        } else {
            query = query.eq('status', status);
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching user experiments:', error);
        return [];
    }

    return data || [];
}

/**
 * Get a single user experiment by ID
 */
export async function getUserExperiment(experimentId: string): Promise<UserExperiment | null> {
    const { data, error } = await supabase
        .from('user_experiments')
        .select('*, experiment_templates(*)')
        .eq('id', experimentId)
        .single();

    if (error) {
        console.error('Error fetching user experiment:', error);
        return null;
    }

    return data;
}

/**
 * Log an experiment event (exposure, checkin, note, etc.)
 */
export async function logExperimentEvent(
    userId: string,
    userExperimentId: string,
    type: ExperimentEventType,
    payload: UserExperimentEvent['payload'],
    occurredAt?: Date
): Promise<UserExperimentEvent | null> {
    const { data, error } = await supabase
        .from('user_experiment_events')
        .insert({
            user_id: userId,
            user_experiment_id: userExperimentId,
            type,
            payload,
            occurred_at: (occurredAt || new Date()).toISOString(),
        })
        .select()
        .single();

    if (error) {
        console.error('Error logging experiment event:', error);
        return null;
    }

    // Update experiment counters
    if (type === 'exposure' || type === 'checkin') {
        const field = type === 'exposure' ? 'exposures_logged' : 'checkins_logged';

        // Try RPC first
        const { error: rpcError } = await supabase.rpc('increment_experiment_counter', {
            p_experiment_id: userExperimentId,
            p_field: field,
        });

        // Fallback if RPC fails (e.g. function doesn't exist)
        if (rpcError) {
            const { data: exp } = await supabase
                .from('user_experiments')
                .select(field)
                .eq('id', userExperimentId)
                .single();

            if (exp) {
                const currentVal = (exp as any)[field] || 0;
                await supabase
                    .from('user_experiments')
                    .update({ [field]: currentVal + 1, updated_at: new Date().toISOString() })
                    .eq('id', userExperimentId);
            }
        }
    }

    return data;
}

/**
 * Get events for an experiment
 */
export async function getExperimentEvents(
    userExperimentId: string,
    type?: ExperimentEventType
): Promise<UserExperimentEvent[]> {
    let query = supabase
        .from('user_experiment_events')
        .select('*')
        .eq('user_experiment_id', userExperimentId)
        .order('occurred_at', { ascending: true });

    if (type) {
        query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching experiment events:', error);
        return [];
    }

    return data || [];
}

/**
 * Get experiment analysis via Edge Function
 */
export async function getExperimentAnalysis(
    userId: string,
    userExperimentId: string,
    saveSnapshot: boolean = true
): Promise<{
    analysis: {
        metrics: Record<string, VariantMetrics>;
        comparison: ExperimentComparison;
        summary: string | null;
        suggestions: string[];
        is_final: boolean;
    };
    experiment: {
        id: string;
        status: string;
        template_title: string;
        total_exposures: number;
        required_exposures: number;
        completion_pct: number;
    };
} | null> {
    try {
        const { data, error } = await supabase.functions.invoke('experiments-evaluate', {
            body: {
                user_id: userId,
                user_experiment_id: userExperimentId,
                save_snapshot: saveSnapshot,
            },
        });

        if (error) {
            console.error('Error fetching experiment analysis:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Experiment analysis error:', err);
        return null;
    }
}

/**
 * Get latest analysis snapshot for an experiment
 */
export async function getLatestExperimentAnalysis(
    userExperimentId: string
): Promise<UserExperimentAnalysis | null> {
    const { data, error } = await supabase
        .from('user_experiment_analysis')
        .select('*')
        .eq('user_experiment_id', userExperimentId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        // No analysis found is not an error
        if (error.code === 'PGRST116') return null;
        console.error('Error fetching experiment analysis:', error);
        return null;
    }

    return data;
}


// ============================================================================
// PHOTO UPLOAD
// ============================================================================

/**
 * Upload a meal photo to Supabase Storage
 * Returns the storage path of the uploaded image (not a URL, as bucket is private)
 * Use ensureSignedMealPhotoUrl() to get a signed URL for display
 */
export async function uploadMealPhoto(
    userId: string,
    imageUri: string
): Promise<string | null> {
    try {
        // Get the file extension from the URI
        const fileName = `${userId}/${Date.now()}.jpg`;

        // Fetch the image as a blob
        const response = await fetch(imageUri);
        const blob = await response.blob();

        // Convert blob to ArrayBuffer for upload
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { data, error } = await supabase.storage
            .from('meal-photos')
            .upload(fileName, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: false,
            });

        if (error) {
            console.error('Error uploading photo:', error);
            return null;
        }

        // Return the storage path - MealCheckinCard will convert to signed URL
        return data.path;
    } catch (err) {
        console.error('Photo upload error:', err);
        return null;
    }
}


// ============================================================================
// DATA EXPORT
// ============================================================================

async function fetchAllRows<T>(
    table: string,
    select: string,
    filterColumn: string,
    filterValue: string,
    pageSize: number = 500
): Promise<T[]> {
    const results: T[] = [];
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select(select)
            .eq(filterColumn, filterValue)
            .range(from, from + pageSize - 1);

        if (error) {
            console.error(`Export query failed for ${table}:`, error);
            break;
        }

        if (!data || data.length === 0) break;

        results.push(...(data as T[]));

        if (data.length < pageSize) break;
        from += pageSize;
    }

    return results;
}

async function listMealPhotos(userId: string): Promise<{ path: string; signed_url: string | null }[]> {
    const bucket = supabase.storage.from('meal-photos');
    const paths: string[] = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
        const { data, error } = await bucket.list(userId, { limit, offset });
        if (error) {
            console.error('Meal photo list error:', error);
            break;
        }
        if (!data || data.length === 0) break;

        data.forEach(item => {
            if (item.name) paths.push(`${userId}/${item.name}`);
        });

        if (data.length < limit) break;
        offset += limit;
    }

    if (paths.length === 0) return [];

    const { data: signed, error } = await bucket.createSignedUrls(paths, 60 * 60);
    if (error || !signed) {
        console.error('Meal photo signing error:', error);
        return paths.map(path => ({ path, signed_url: null }));
    }

    return signed.map(entry => ({ path: entry.path || '', signed_url: entry.signedUrl || null }));
}

/**
 * Export all user data as a JSON object
 */
export async function exportUserData(userId: string): Promise<{
    profile: UserProfile | null;
    meals: Meal[];
    meal_items: MealItem[];
    meal_checkins: MealCheckin[];
    post_meal_reviews: Record<string, any>[];
    premeal_checks: Record<string, any>[];
    glucose_logs: GlucoseLog[];
    activity_logs: ActivityLog[];
    daily_context: DailyContext[];
    user_calibration: Record<string, any> | null;
    favorite_foods: NormalizedFood[];
    recent_foods: NormalizedFood[];
    experiments: UserExperiment[];
    experiment_events: UserExperimentEvent[];
    experiment_analysis: UserExperimentAnalysis[];
    meal_photo_analysis: MealPhotoAnalysisRow[];
    meal_photos: { path: string; signed_url: string | null }[];
} | null> {
    try {
        const [
            profile,
            meals,
            mealItems,
            mealCheckins,
            postMealReviews,
            premealChecks,
            glucoseLogs,
            activityLogs,
            dailyContext,
            userCalibrationRows,
            favoriteFoods,
            recentFoods,
            experiments,
            experimentEvents,
            experimentAnalysis,
            mealPhotoAnalysis,
            mealPhotos,
        ] = await Promise.all([
            getUserProfile(userId),
            fetchAllRows<Meal>('meals', '*', 'user_id', userId),
            fetchAllRows<MealItem>('meal_items', '*', 'user_id', userId),
            fetchAllRows<MealCheckin>('meal_checkins', '*', 'user_id', userId),
            fetchAllRows<Record<string, any>>('post_meal_reviews', '*', 'user_id', userId),
            fetchAllRows<Record<string, any>>('premeal_checks', '*', 'user_id', userId),
            fetchAllRows<GlucoseLog>('glucose_logs', '*', 'user_id', userId),
            fetchAllRows<ActivityLog>('activity_logs', '*', 'user_id', userId),
            fetchAllRows<DailyContext>('daily_context', '*', 'user_id', userId),
            fetchAllRows<Record<string, any>>('user_calibration', '*', 'user_id', userId),
            fetchAllRows<NormalizedFood>('favorite_foods', '*', 'user_id', userId),
            fetchAllRows<NormalizedFood>('recent_foods', '*', 'user_id', userId),
            fetchAllRows<UserExperiment>('user_experiments', '*', 'user_id', userId),
            fetchAllRows<UserExperimentEvent>('user_experiment_events', '*', 'user_id', userId),
            fetchAllRows<UserExperimentAnalysis>('user_experiment_analysis', '*', 'user_id', userId),
            fetchAllRows<MealPhotoAnalysisRow>('meal_photo_analysis', '*', 'user_id', userId),
            listMealPhotos(userId),
        ]);

        return {
            profile,
            meals,
            meal_items: mealItems,
            meal_checkins: mealCheckins,
            post_meal_reviews: postMealReviews,
            premeal_checks: premealChecks,
            glucose_logs: glucoseLogs,
            activity_logs: activityLogs,
            daily_context: dailyContext,
            user_calibration: userCalibrationRows?.[0] ?? null,
            favorite_foods: favoriteFoods,
            recent_foods: recentFoods,
            experiments,
            experiment_events: experimentEvents,
            experiment_analysis: experimentAnalysis,
            meal_photo_analysis: mealPhotoAnalysis,
            meal_photos: mealPhotos,
        };
    } catch (err) {
        console.error('Data export error:', err);
        return null;
    }
}

// ============================================================================
// RESET LEARNING
// ============================================================================

/**
 * Reset personalized learning data for a user
 * This clears calibration data and experiment analysis
 */
export async function resetUserLearning(userId: string): Promise<boolean> {
    try {
        // Delete user calibration data
        const { error: calibrationError } = await supabase
            .from('user_calibration')
            .delete()
            .eq('user_id', userId);

        if (calibrationError) {
            console.error('Error deleting calibration data:', calibrationError);
            return false;
        }

        // Delete experiment analysis data
        const { error: analysisError } = await supabase
            .from('user_experiment_analysis')
            .delete()
            .eq('user_id', userId);

        if (analysisError) {
            console.error('Error deleting analysis data:', analysisError);
            // Continue even if this fails
        }

        return true;
    } catch (err) {
        console.error('Reset learning error:', err);
        return false;
    }
}

// ============================================================================
// DELETE USER DATA
// ============================================================================

/**
 * Update a post-meal review with a manually logged glucose value
 */
export async function updatePostMealReviewWithManualGlucose(
    reviewId: string,
    glucoseVal: number
): Promise<boolean> {
    const { error } = await supabase
        .from('post_meal_reviews')
        .update({
            manual_glucose_mg_dl: glucoseVal, // Assuming DB stores in mg/dL or adapt based on column
            updated_at: new Date().toISOString()
        })
        .eq('id', reviewId);

    if (error) {
        console.error('Error updating review with glucose:', error);
        return false;
    }

    return true;
}

/**
 * Delete all user data from the database
 * Note: This does not delete the auth user - that must be done separately
 */
export async function deleteUserData(_userId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase.functions.invoke('delete-account', {
            body: { confirm: true },
        });

        if (error) {
            console.error('Delete account error:', error);
            return false;
        }

        return Boolean(data?.success);
    } catch (err) {
        console.error('Delete user data error:', err);
        return false;
    }
}

// ==========================================
// METABOLIC RESPONSE SCORE
// ==========================================

export type MetabolicScoreRangeKey = '7d' | '14d' | '30d' | '90d';
export type MetabolicScoreBand = 'low' | 'medium' | 'high';
export type MetabolicScoreConfidence = 'low' | 'medium' | 'high';

export interface MetabolicScoreDriver {
    key: string;
    points: number;
    text: string;
}

export interface MetabolicScoreComponents {
    base: number;
    sleep_pen: number;
    act_pen: number;
    steps_pen: number;
    rhr_pen: number;
    hrv_pen: number;
    fibre_bonus: number;
    lab_pen: number;
}

export type MetabolicScoreConfidenceV2 = 'low' | 'medium' | 'high' | 'insufficient_data';

export interface MetabolicScoreComponentsV2 {
    rhrBad: number | null;
    stepsBad: number | null;
    sleepBad: number | null;
    hrvBad: number | null;
    contextNorm: number;
    wearableStrain: number;
    contextMultiplier: number;
    strain: number;
}

export interface MetabolicScoreV2Result {
    score7d: number | null;
    score28d: number | null;
    confidence: MetabolicScoreConfidenceV2;
    atypicalActivityWeek: boolean;
    mode: 'baseline_relative' | 'absolute_fallback';
    reason?: 'insufficient_data';
    components?: MetabolicScoreComponentsV2;
    debug?: {
        validDays: {
            rhrDays: number;
            stepsDays: number;
            sleepDays: number;
            hrvDays: number;
            hasAge: boolean;
            hasBmi: boolean;
        };
        usedBaseline: {
            rhr: boolean;
            steps: boolean;
            sleep: boolean;
            hrv: boolean;
        };
        usedFallbacks: {
            rhr: boolean;
            steps: boolean;
            sleep: boolean;
            hrv: boolean;
        };
        smoothingUnavailable: boolean;
    };
}

export interface MetabolicScoreResult {
    status: 'ok' | 'insufficient';
    range: MetabolicScoreRangeKey;
    metabolic_response_score: number | null;
    strain_score: number | null;
    band: MetabolicScoreBand | null;
    confidence: MetabolicScoreConfidence;
    wearables_days: number;
    lab_present: boolean;
    drivers: MetabolicScoreDriver[];
    components: MetabolicScoreComponents;
    score7d?: number | null;
    score28d?: number | null;
    confidence_v2?: MetabolicScoreConfidenceV2;
    atypicalActivityWeek?: boolean;
    mode?: 'baseline_relative' | 'absolute_fallback';
    components_v2?: MetabolicScoreComponentsV2;
    debug_v2?: MetabolicScoreV2Result['debug'];
    v2?: MetabolicScoreV2Result;
}

export async function invokeMetabolicScore(
    userId: string,
    range: MetabolicScoreRangeKey = '30d'
): Promise<MetabolicScoreResult | null> {
    return invokeWithRetry<MetabolicScoreResult>('metabolic-score', { user_id: userId, range });
}

// ==========================================
// PERSONALIZED INSIGHTS
// ==========================================

export interface UserMetabolicProfile {
    user_id: string;
    baseline_resting_hr: number | null;
    baseline_steps: number | null;
    baseline_sleep_hours: number | null;
    baseline_hrv_ms: number | null;
    baseline_metabolic_score: number | null;
    sensitivity_sleep: 'low' | 'medium' | 'high' | 'unknown';
    sensitivity_steps: 'low' | 'medium' | 'high' | 'unknown';
    sensitivity_recovery: 'slow' | 'average' | 'fast' | 'unknown';
    pattern_weekend_disruption: boolean;
    pattern_sleep_sensitive: boolean;
    pattern_activity_sensitive: boolean;
    data_coverage_days: number;
    valid_days_for_sensitivity: number;
    last_updated_at: string;
    created_at: string;
    updated_at: string;
}

export type InsightMode = 'single_conversational' | 'bullets';
// TrackingMode already defined at top of file

export interface BulletInsight {
    category: 'meals' | 'activity' | 'sleep' | 'wellness';
    title: string;
    description: string;
}

export interface PersonalInsightResult {
    // Single conversational mode
    insight?: string;
    // Bullets mode
    insights?: BulletInsight[];
    // Common
    mode: InsightMode;
    profile_exists: boolean;
    recent_trend?: 'up' | 'flat' | 'down';
}

export interface ComputeProfileResult {
    profile: UserMetabolicProfile;
    cached: boolean;
    hours_since_update?: number;
    message?: string;
}

/**
 * Invoke personalized insights Edge Function
 * Returns either a single conversational insight or multiple bullet insights
 */
export async function invokePersonalInsight(
    userId: string,
    trackingMode: TrackingMode = 'meals_wearables',
    insightMode: InsightMode = 'single_conversational'
): Promise<PersonalInsightResult | null> {
    return invokeWithRetry<PersonalInsightResult>('personal-insights', {
        user_id: userId,
        tracking_mode: trackingMode,
        insight_mode: insightMode,
    });
}

/**
 * Invoke compute metabolic profile Edge Function
 * Computes and caches user baselines, sensitivities, and patterns
 */
export async function invokeComputeMetabolicProfile(
    userId: string,
    forceRefresh: boolean = false
): Promise<ComputeProfileResult | null> {
    return invokeWithRetry<ComputeProfileResult>('compute-metabolic-profile', {
        user_id: userId,
        force_refresh: forceRefresh,
    });
}

/**
 * Get cached metabolic profile from database (faster than Edge Function)
 */
export async function getMetabolicProfile(
    userId: string
): Promise<UserMetabolicProfile | null> {
    try {
        const { data, error } = await supabase
            .from('user_metabolic_profile')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // No row found
            console.error('Error fetching metabolic profile:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Get metabolic profile error:', err);
        return null;
    }
}

/**
 * Check if metabolic profile needs refresh (> 24h old or doesn't exist)
 */
export async function needsProfileRefresh(userId: string): Promise<boolean> {
    const profile = await getMetabolicProfile(userId);
    if (!profile) return true;

    const lastUpdated = new Date(profile.last_updated_at);
    const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
    return hoursSinceUpdate >= 24;
}

// ==========================================
// MEAL ADJUSTMENTS
// ==========================================

export interface MealAdjustment {
    id: string;
    action: string;
    impact: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
}

export interface MealAdjustmentsResult {
    adjustments: MealAdjustment[];
    context?: {
        patterns: string[];
    };
}

export interface MealItemForAdjustments {
    display_name: string;
    calories_kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    quantity: number;
}

/**
 * Invoke meal-adjustments Edge Function
 * Generates personalized meal adjustment suggestions based on meal composition and user history
 */
export async function invokeMealAdjustments(
    userId: string,
    mealItems: MealItemForAdjustments[],
    mealType?: string
): Promise<MealAdjustmentsResult | null> {
    return invokeWithRetry<MealAdjustmentsResult>('meal-adjustments', {
        user_id: userId,
        meal_items: mealItems,
        meal_type: mealType,
    });
}

// ==========================================
// AI PERSONALIZATION ENGINE
// ==========================================

export interface NextBestAction {
    title: string;
    description: string;
    action_type: string;
    time_context: string;
    because: string;
    cta: { label: string; route: string };
}

export interface NextBestActionResponse {
    action: NextBestAction;
    source: 'ai' | 'rules' | 'fallback';
}

export interface WeeklyReview {
    id: string;
    text: string;
    experiment_suggestion: string | null;
    key_metric: string;
    metric_direction: 'up' | 'down' | 'stable';
    week_start: string;
    dismissed_at: string | null;
}

export interface WeeklyReviewResponse {
    review: {
        text: string;
        experiment_suggestion: string | null;
        key_metric: string;
        metric_direction: 'up' | 'down' | 'stable';
        week_start: string;
    };
    source: 'ai' | 'fallback';
}

export interface ScoreExplanation {
    summary: string;
    top_contributor: string;
    biggest_opportunity: string;
    one_thing_this_week: string;
}

export interface ScoreExplanationResponse {
    explanation: ScoreExplanation;
    source: 'ai' | 'fallback';
}

/**
 * Invoke next-best-action Edge Function
 */
export async function invokeNextBestAction(
    userId: string,
    localHour: number
): Promise<NextBestActionResponse | null> {
    return invokeWithRetry<NextBestActionResponse>('next-best-action', {
        user_id: userId,
        local_hour: localHour,
    });
}

/**
 * Invoke weekly-review Edge Function
 */
export async function invokeWeeklyReview(
    userId: string
): Promise<WeeklyReviewResponse | null> {
    return invokeWithRetry<WeeklyReviewResponse>('weekly-review', {
        user_id: userId,
    });
}

/**
 * Invoke score-explanation Edge Function
 */
export async function invokeScoreExplanation(
    userId: string,
    score: number,
    components: { rhr: number; steps: number; sleep: number; hrv: number }
): Promise<ScoreExplanationResponse | null> {
    return invokeWithRetry<ScoreExplanationResponse>('score-explanation', {
        user_id: userId,
        score,
        components,
    });
}

/**
 * Get the current week's review from the weekly_reviews table
 */
export async function getWeeklyReview(userId: string): Promise<WeeklyReview | null> {
    // Calculate current week start (Monday)
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(now.setDate(diff));
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const { data, error } = await supabase
        .from('weekly_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start', weekStartStr)
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error, 'weekly_reviews')) {
            warnSchemaFallbackOnce('weekly_reviews', 'weekly_reviews table not found', error);
            return null;
        }
        console.error('Error fetching weekly review:', error);
        return null;
    }

    return data ? {
        id: data.id,
        text: data.review_text,
        experiment_suggestion: data.experiment_suggestion,
        key_metric: data.key_metric,
        metric_direction: data.metric_direction,
        week_start: data.week_start,
        dismissed_at: data.dismissed_at,
    } : null;
}

/**
 * Dismiss a weekly review by setting dismissed_at
 */
export async function dismissWeeklyReview(reviewId: string): Promise<boolean> {
    const { error } = await supabase
        .from('weekly_reviews')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', reviewId);

    if (error) {
        console.error('Error dismissing weekly review:', error);
        return false;
    }
    return true;
}

// ==========================================
// AI SUGGESTION EVENT TRACKING
// ==========================================

export type AiSuggestionOutputType = 'next_best_action' | 'weekly_review' | 'score_explanation';
export type AiSuggestionEventType = 'shown' | 'tapped' | 'completed' | 'dismissed';

export interface AiSuggestionEvent {
    id: string;
    user_id: string;
    ai_output_id: string | null;
    output_type: AiSuggestionOutputType;
    event_type: AiSuggestionEventType;
    metadata: Record<string, unknown>;
    created_at: string;
}

export async function trackAiSuggestionEvent(
    userId: string,
    outputType: AiSuggestionOutputType,
    eventType: AiSuggestionEventType,
    aiOutputId?: string | null,
    metadata?: Record<string, unknown>
): Promise<void> {
    try {
        const { error } = await supabase
            .from('ai_suggestion_events')
            .insert({
                user_id: userId,
                output_type: outputType,
                event_type: eventType,
                ai_output_id: aiOutputId ?? null,
                metadata: metadata ?? {},
            });

        if (error) {
            if (isMissingTableError(error, 'ai_suggestion_events')) {
                warnSchemaFallbackOnce('ai_suggestion_events', 'ai_suggestion_events table not found', error);
                return;
            }
            console.error('Error tracking AI suggestion event:', error);
        }
    } catch {
        // Silently fail — tracking is non-critical
    }
}

// ==========================================
// WELLNESS CHAT
// ==========================================

export interface ChatMessagePayload {
    user_id: string;
    message: string;
    conversation_history: Array<{
        role: 'user' | 'model';
        content: string;
    }>;
    local_hour: number;
    session_id?: string;
}

export type ChatBlockType = 'metric_card' | 'meal_summary' | 'score_ring' | 'streak';

export interface ChatBlock {
    type: ChatBlockType;
    data: Record<string, unknown>;
    fallback_text: string;
}

export interface ChatMessageResponse {
    reply: string;
    source: 'ai' | 'fallback';
    blocks?: ChatBlock[];
}

/**
 * Send a message to the chat-wellness Edge Function
 */
export async function sendChatMessage(
    payload: ChatMessagePayload
): Promise<ChatMessageResponse | null> {
    return invokeWithRetry<ChatMessageResponse>('chat-wellness', payload);
}

// ==========================================
// CHAT PERSISTENCE
// ==========================================

export interface ChatSession {
    id: string;
    user_id: string;
    is_active: boolean;
    created_at: string;
    last_message_at: string;
}

export interface ChatMessageRow {
    id: string;
    session_id: string;
    user_id: string;
    role: 'user' | 'assistant';
    content: string;
    status: 'sending' | 'sent' | 'error';
    blocks: ChatBlock[] | null;
    created_at: string;
}

/**
 * Get the user's active chat session, or null if none exists.
 */
export async function getActiveChatSession(
    userId: string
): Promise<ChatSession | null> {
    try {
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            if (isMissingTableError(error, 'chat_sessions')) {
                warnSchemaFallbackOnce('missing_chat_sessions', 'Chat persistence unavailable');
                return null;
            }
            console.error('Error fetching chat session:', error);
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

/**
 * Create a new active chat session. Archives any existing active session first.
 */
export async function createChatSession(
    userId: string
): Promise<ChatSession | null> {
    try {
        // Archive existing active sessions
        await supabase
            .from('chat_sessions')
            .update({ is_active: false })
            .eq('user_id', userId)
            .eq('is_active', true);

        const { data, error } = await supabase
            .from('chat_sessions')
            .insert({ user_id: userId, is_active: true })
            .select()
            .single();

        if (error) {
            if (isMissingTableError(error, 'chat_sessions')) {
                warnSchemaFallbackOnce('missing_chat_sessions', 'Chat persistence unavailable');
                return null;
            }
            console.error('Error creating chat session:', error);
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

/**
 * Load messages for a session, ordered chronologically.
 */
export async function getChatMessages(
    sessionId: string,
    limit: number = 50
): Promise<ChatMessageRow[]> {
    try {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            if (isMissingTableError(error, 'chat_messages')) {
                warnSchemaFallbackOnce('missing_chat_messages', 'Chat persistence unavailable');
                return [];
            }
            console.error('Error fetching chat messages:', error);
            return [];
        }
        return data || [];
    } catch {
        return [];
    }
}

/**
 * Save a single message to the session.
 * Also updates last_message_at on the session.
 */
export async function saveChatMessage(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    status: 'sending' | 'sent' | 'error' = 'sent',
    blocks?: ChatBlock[]
): Promise<ChatMessageRow | null> {
    try {
        const insertPayload: Record<string, unknown> = {
            session_id: sessionId,
            user_id: userId,
            role,
            content,
            status,
        };
        if (blocks && blocks.length > 0) {
            insertPayload.blocks = blocks;
        }

        let { data, error } = await supabase
            .from('chat_messages')
            .insert(insertPayload)
            .select()
            .single();

        // If the blocks column doesn't exist yet, retry without it
        if (error?.code === 'PGRST204' && insertPayload.blocks) {
            delete insertPayload.blocks;
            ({ data, error } = await supabase
                .from('chat_messages')
                .insert(insertPayload)
                .select()
                .single());
        }

        if (error) {
            if (isMissingTableError(error, 'chat_messages')) {
                warnSchemaFallbackOnce('missing_chat_messages', 'Chat persistence unavailable');
                return null;
            }
            console.error('Error saving chat message:', error);
            return null;
        }

        // Update session timestamp (fire-and-forget)
        supabase
            .from('chat_sessions')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', sessionId)
            .then(() => {});

        return data;
    } catch {
        return null;
    }
}

/**
 * Update a message's status (e.g., sending -> sent, or sending -> error).
 */
export async function updateChatMessageStatus(
    messageId: string,
    status: 'sent' | 'error'
): Promise<void> {
    try {
        await supabase
            .from('chat_messages')
            .update({ status })
            .eq('id', messageId);
    } catch {
        // Non-critical — best effort
    }
}

/**
 * Archive (deactivate) the current session. Used by "New chat".
 */
export async function archiveChatSession(
    sessionId: string
): Promise<void> {
    try {
        await supabase
            .from('chat_sessions')
            .update({ is_active: false })
            .eq('id', sessionId);
    } catch {
        // Non-critical — best effort
    }
}
