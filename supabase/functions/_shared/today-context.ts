// supabase/functions/_shared/today-context.ts
// Fetches today's granular user data for the AI chat context.
// Designed to run in parallel with buildUserContext().

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ============================================
// Types
// ============================================

interface TodayMeal {
    name: string;
    meal_type: string | null;
    logged_at: string;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
    items: TodayMealItem[];
}

interface TodayMealItem {
    display_name: string;
    quantity: number;
    unit: string;
    calories_kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fiber_g: number | null;
}

interface TodayCheckin {
    meal_name: string;
    meal_type: string | null;
    energy: string | null;
    fullness: string | null;
    cravings: string | null;
    mood: string | null;
    movement_after: boolean | null;
    notes: string | null;
}

interface TodayGlucoseReading {
    glucose_level: number;
    unit: string;
    context: string | null;
    logged_at: string;
}

interface TodayActivity {
    activity_name: string;
    duration_minutes: number | null;
    intensity: string | null;
    logged_at: string;
}

interface TodayHealthKit {
    steps: number | null;
    active_minutes: number | null;
    sleep_hours: number | null;
    resting_hr: number | null;
}

interface LatestWeight {
    weight_kg: number;
    logged_at: string;
}

export interface TodayContextObject {
    meals: TodayMeal[];
    checkins: TodayCheckin[];
    glucose_readings: TodayGlucoseReading[];
    activities: TodayActivity[];
    healthkit_today: TodayHealthKit | null;
    latest_weight: LatestWeight | null;
}

// ============================================
// Time helpers
// ============================================

function getTodayRange(): { todayStart: string; todayDate: string } {
    const now = new Date();
    const todayDate = now.toISOString().slice(0, 10);
    const todayStart = `${todayDate}T00:00:00.000Z`;
    return { todayStart, todayDate };
}

function formatTime(isoString: string): string {
    const d = new Date(isoString);
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m} ${ampm}`;
}

// ============================================
// Main Builder
// ============================================

export async function buildTodayContext(
    supabase: SupabaseClient,
    userId: string
): Promise<TodayContextObject> {
    const { todayStart, todayDate } = getTodayRange();

    // Run 5 parallel queries + 1 for weight
    const [mealsResult, checkinsResult, glucoseResult, activitiesResult, healthkitResult] =
        await Promise.all([
            // 1. Today's meals
            supabase
                .from('meals')
                .select('id, name, meal_type, logged_at, calories, protein_g, carbs_g, fat_g, fiber_g')
                .eq('user_id', userId)
                .gte('logged_at', todayStart)
                .order('logged_at', { ascending: true })
                .then(r => r),

            // 2. Today's check-ins with meal name
            supabase
                .from('meal_checkins')
                .select('energy, fullness, cravings, mood, movement_after, notes, meal_id, meals!inner(name, meal_type)')
                .eq('user_id', userId)
                .gte('created_at', todayStart)
                .then(r => r),

            // 3. Today's glucose readings
            supabase
                .from('glucose_logs')
                .select('glucose_level, unit, context, logged_at')
                .eq('user_id', userId)
                .gte('logged_at', todayStart)
                .order('logged_at', { ascending: true })
                .then(r => r),

            // 4. Today's activity logs
            supabase
                .from('activity_logs')
                .select('activity_name, duration_minutes, intensity, logged_at')
                .eq('user_id', userId)
                .gte('logged_at', todayStart)
                .order('logged_at', { ascending: true })
                .then(r => r),

            // 5. Today's HealthKit data
            supabase
                .from('daily_context')
                .select('steps, active_minutes, sleep_hours, resting_hr')
                .eq('user_id', userId)
                .eq('date', todayDate)
                .maybeSingle()
                .then(r => r),
        ]);

    // Fetch meal items for today's meals (batch query)
    const meals = mealsResult.data || [];
    const mealIds = meals.map((m: { id: string }) => m.id);
    let mealItemsByMealId: Record<string, TodayMealItem[]> = {};

    if (mealIds.length > 0) {
        try {
            const { data: itemsData } = await supabase
                .from('meal_items')
                .select('meal_id, display_name, quantity, unit, nutrients')
                .in('meal_id', mealIds);

            if (itemsData) {
                for (const item of itemsData) {
                    const mid = item.meal_id as string;
                    if (!mealItemsByMealId[mid]) mealItemsByMealId[mid] = [];
                    const nutrients = item.nutrients as Record<string, number | null> | null;
                    mealItemsByMealId[mid].push({
                        display_name: item.display_name,
                        quantity: item.quantity,
                        unit: item.unit,
                        calories_kcal: nutrients?.calories_kcal ?? null,
                        protein_g: nutrients?.protein_g ?? null,
                        carbs_g: nutrients?.carbs_g ?? null,
                        fiber_g: nutrients?.fibre_g ?? null,
                    });
                }
            }
        } catch {
            // meal_items query failed — proceed without items
        }
    }

    // Fetch latest weight (separate due to potential missing table)
    let latestWeight: LatestWeight | null = null;
    try {
        const { data } = await supabase
            .from('weight_logs')
            .select('weight_kg, logged_at')
            .eq('user_id', userId)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (data) {
            latestWeight = { weight_kg: data.weight_kg, logged_at: data.logged_at };
        }
    } catch {
        // weight_logs table may not exist yet
    }

    // Assemble meals with items
    const todayMeals: TodayMeal[] = meals.map((m: Record<string, unknown>) => ({
        name: m.name as string,
        meal_type: (m.meal_type as string) ?? null,
        logged_at: m.logged_at as string,
        calories: (m.calories as number) ?? null,
        protein_g: (m.protein_g as number) ?? null,
        carbs_g: (m.carbs_g as number) ?? null,
        fat_g: (m.fat_g as number) ?? null,
        fiber_g: (m.fiber_g as number) ?? null,
        items: mealItemsByMealId[m.id as string] || [],
    }));

    // Assemble check-ins
    const checkins: TodayCheckin[] = (checkinsResult.data || []).map(
        (c: Record<string, unknown>) => {
            const meal = c.meals as Record<string, unknown> | null;
            return {
                meal_name: (meal?.name as string) ?? 'Unknown meal',
                meal_type: (meal?.meal_type as string) ?? null,
                energy: (c.energy as string) ?? null,
                fullness: (c.fullness as string) ?? null,
                cravings: (c.cravings as string) ?? null,
                mood: (c.mood as string) ?? null,
                movement_after: (c.movement_after as boolean) ?? null,
                notes: (c.notes as string) ?? null,
            };
        }
    );

    // Assemble glucose
    const glucoseReadings: TodayGlucoseReading[] = (glucoseResult.data || []).map(
        (g: Record<string, unknown>) => ({
            glucose_level: g.glucose_level as number,
            unit: (g.unit as string) ?? 'mmol/L',
            context: (g.context as string) ?? null,
            logged_at: g.logged_at as string,
        })
    );

    // Assemble activities
    const activities: TodayActivity[] = (activitiesResult.data || []).map(
        (a: Record<string, unknown>) => ({
            activity_name: a.activity_name as string,
            duration_minutes: (a.duration_minutes as number) ?? null,
            intensity: (a.intensity as string) ?? null,
            logged_at: a.logged_at as string,
        })
    );

    // HealthKit
    const hk = healthkitResult.data;
    const healthkitToday: TodayHealthKit | null = hk
        ? {
              steps: (hk.steps as number) ?? null,
              active_minutes: (hk.active_minutes as number) ?? null,
              sleep_hours: (hk.sleep_hours as number) ?? null,
              resting_hr: (hk.resting_hr as number) ?? null,
          }
        : null;

    return {
        meals: todayMeals,
        checkins,
        glucose_readings: glucoseReadings,
        activities,
        healthkit_today: healthkitToday,
        latest_weight: latestWeight,
    };
}

// ============================================
// Serializer for Prompt
// ============================================

export function serializeTodayContextForPrompt(ctx: TodayContextObject): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const lines: string[] = [];

    lines.push(`## Today's Data (${dateStr})`);

    // Meals
    if (ctx.meals.length > 0) {
        lines.push(`\n### Meals`);
        for (const meal of ctx.meals) {
            const time = formatTime(meal.logged_at);
            const type = meal.meal_type ? capitalize(meal.meal_type) : 'Meal';
            const nutritionParts: string[] = [];
            if (meal.calories !== null) nutritionParts.push(`${Math.round(meal.calories)} cal`);
            if (meal.protein_g !== null) nutritionParts.push(`${Math.round(meal.protein_g)}g protein`);
            if (meal.carbs_g !== null) nutritionParts.push(`${Math.round(meal.carbs_g)}g carbs`);
            if (meal.fat_g !== null) nutritionParts.push(`${Math.round(meal.fat_g)}g fat`);
            if (meal.fiber_g !== null) nutritionParts.push(`${Math.round(meal.fiber_g)}g fiber`);

            const nutrition = nutritionParts.length > 0 ? ` — ${nutritionParts.join(', ')}` : '';
            lines.push(`- ${type} (${time}): "${meal.name}"${nutrition}`);

            if (meal.items.length > 0) {
                const itemNames = meal.items.map(i => `${i.display_name} (${i.quantity}${i.unit})`).join(', ');
                lines.push(`  Items: ${itemNames}`);
            }
        }
    } else {
        lines.push(`\n### Meals\nNo meals logged yet today.`);
    }

    // Check-ins
    if (ctx.checkins.length > 0) {
        lines.push(`\n### Check-ins`);
        for (const c of ctx.checkins) {
            const type = c.meal_type ? capitalize(c.meal_type) : c.meal_name;
            const parts: string[] = [];
            if (c.energy) parts.push(`Energy ${c.energy}`);
            if (c.fullness) parts.push(`Fullness ${c.fullness}`);
            if (c.cravings) parts.push(`Cravings ${c.cravings}`);
            if (c.mood) parts.push(`Mood ${c.mood}`);
            if (c.movement_after === true) parts.push(`Walked after: yes`);
            else if (c.movement_after === false) parts.push(`Walked after: no`);

            lines.push(`- ${type}: ${parts.join(', ')}`);
            if (c.notes) lines.push(`  Notes: "${c.notes}"`);
        }
    }

    // Glucose
    if (ctx.glucose_readings.length > 0) {
        lines.push(`\n### Glucose`);
        for (const g of ctx.glucose_readings) {
            const time = formatTime(g.logged_at);
            const ctx_label = g.context ? capitalize(g.context.replace(/_/g, ' ')) : 'Reading';
            lines.push(`- ${ctx_label} (${time}): ${g.glucose_level} ${g.unit}`);
        }
    }

    // Activities
    if (ctx.activities.length > 0) {
        lines.push(`\n### Activity`);
        for (const a of ctx.activities) {
            const duration = a.duration_minutes ? `${a.duration_minutes} min` : '';
            const intensity = a.intensity ? ` (${a.intensity})` : '';
            const time = formatTime(a.logged_at);
            lines.push(`- ${a.activity_name}: ${duration}${intensity} at ${time}`);
        }
    }

    // HealthKit
    if (ctx.healthkit_today) {
        const hk = ctx.healthkit_today;
        const parts: string[] = [];
        if (hk.steps !== null) parts.push(`Steps: ${hk.steps.toLocaleString()}`);
        if (hk.active_minutes !== null) parts.push(`Active min: ${hk.active_minutes}`);
        if (hk.sleep_hours !== null) parts.push(`Sleep: ${hk.sleep_hours}h`);
        if (hk.resting_hr !== null) parts.push(`Resting HR: ${hk.resting_hr}`);
        if (parts.length > 0) {
            lines.push(`\n### HealthKit\n${parts.join(' | ')}`);
        }
    }

    // Weight
    if (ctx.latest_weight) {
        const weightDate = new Date(ctx.latest_weight.logged_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
        lines.push(`\n### Weight\nMost recent: ${ctx.latest_weight.weight_kg} kg (${weightDate})`);
    }

    // If nothing today — give the AI guidance on how to respond
    if (
        ctx.meals.length === 0 &&
        ctx.checkins.length === 0 &&
        ctx.glucose_readings.length === 0 &&
        ctx.activities.length === 0 &&
        !ctx.healthkit_today
    ) {
        lines.push(`\nThe user has not logged any data today yet. This is normal — they may be just starting out or haven't logged yet today. When they ask about meals, activity, or glucose, warmly acknowledge you can see they haven't logged today and suggest specific things to try. For meal suggestions, offer general wellness-friendly ideas based on their dietary preferences and 7-day patterns.`);
    }

    return lines.join('\n');
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
