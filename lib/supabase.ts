import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ipodxujhoqbdrgxfphou.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwb2R4dWpob3FiZHJneGZwaG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NzM3MjMsImV4cCI6MjA4MTE0OTcyM30.WnSQN9CWwSMER8OnPn_j0ms4cTb86G4m6PmV0tN0XZ8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

// Types for user profile
export interface UserProfile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    region: string | null;
    birth_date: string | null;
    biological_sex: string | null;
    cgm_device: string | null;
    goals: string[] | null;
    onboarding_completed: boolean;
    target_min: number | null;  // Custom glucose target minimum (mmol/L)
    target_max: number | null;  // Custom glucose target maximum (mmol/L)
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
        return [];
    }

    return data || [];
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
        // Query meal_items joined with meals to filter by date range
        // First get meals in range, then get their items
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

export interface PremealCurvePoint {
    t_min: number;
    glucose_delta: number;
}

export interface PremealDriver {
    text: string;
    reason_code: string;
}

export interface PremealAdjustmentTip {
    title: string;
    detail: string;
    risk_reduction_pct: number;
    action_type: string;
}

export interface PremealResult {
    spike_risk_pct: number;
    predicted_curve: PremealCurvePoint[];
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
}

export interface PremealMealItem {
    display_name: string;
    quantity: number;
    unit?: string;
    nutrients: {
        calories_kcal?: number;
        carbs_g?: number;
        protein_g?: number;
        fat_g?: number;
        fibre_g?: number;
    };
}

export interface PremealMealDraft {
    name: string;
    logged_at: string;
    items: PremealMealItem[];
}

/**
 * Calls the premeal-analyze Edge Function to get AI-powered meal analysis
 * Returns spike risk, predicted glucose curve, drivers, and adjustment tips
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
