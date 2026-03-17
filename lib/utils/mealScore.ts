import type { MealWithCheckin, MealType } from '@/lib/supabase';
import { Colors } from '@/constants/Colors';

/**
 * Compute a 1–10 meal wellness score from check-in responses and nutrition data.
 * Returns null if no check-in exists.
 */
export function computeMealScore(meal: MealWithCheckin): number | null {
    const checkin = meal.meal_checkins?.[0];
    if (!checkin) return null;

    let rawScore = 0;
    let factors = 0;

    // --- Check-in component (70% weight) ---
    if (checkin.energy) {
        factors++;
        rawScore += checkin.energy === 'steady' ? 10 : checkin.energy === 'high' ? 6 : 3;
    }
    if (checkin.fullness) {
        factors++;
        rawScore += checkin.fullness === 'okay' ? 10 : checkin.fullness === 'high' ? 5 : 4;
    }
    if (checkin.cravings) {
        factors++;
        rawScore += checkin.cravings === 'low' ? 10 : checkin.cravings === 'medium' ? 6 : 2;
    }
    if (checkin.mood) {
        factors++;
        rawScore += checkin.mood === 'good' ? 10 : checkin.mood === 'okay' ? 7 : 3;
    }

    if (factors === 0) return 5;

    const checkinNormalized = (rawScore / (factors * 10)) * 7;

    // Movement bonus
    const movementBonus = checkin.movement_after ? 0.5 : 0;

    // --- Nutrition component (30% weight) ---
    let nutritionPoints = 0;
    const hasNutrition = (meal.protein_g ?? 0) > 0 || (meal.carbs_g ?? 0) > 0 || (meal.fat_g ?? 0) > 0 || (meal.fiber_g ?? 0) > 0;

    if (hasNutrition) {
        if ((meal.protein_g ?? 0) >= 10) nutritionPoints++;
        if ((meal.fiber_g ?? 0) >= 3) nutritionPoints++;
        const totalCals = meal.calories ?? 0;
        if (totalCals > 0) {
            const proteinPct = ((meal.protein_g ?? 0) * 4) / totalCals;
            if (proteinPct >= 0.15 && proteinPct <= 0.40) nutritionPoints++;
        }
    }

    const nutritionNormalized = hasNutrition ? nutritionPoints : 1.5;

    const final = checkinNormalized + nutritionNormalized + movementBonus;
    // Round to nearest 0.5, clamp 1–10
    const rounded = Math.round(final * 2) / 2;
    return Math.max(1, Math.min(10, rounded));
}

/**
 * Derive a status label + color from check-in responses.
 */
export function getCheckinStatus(meal: MealWithCheckin): { label: string; color: string; bgColor: string } | null {
    const checkin = meal.meal_checkins?.[0];
    if (!checkin) return null;

    if (checkin.energy === 'steady' && (checkin.cravings === 'low' || checkin.cravings === 'medium')) {
        return { label: 'Stable', color: Colors.success, bgColor: Colors.successLight };
    }
    if (checkin.energy === 'high' && checkin.mood === 'good') {
        return { label: 'Energized', color: Colors.blue, bgColor: Colors.blueLight };
    }
    if (checkin.energy === 'low' || checkin.cravings === 'high') {
        return { label: 'Low energy', color: Colors.warning, bgColor: Colors.warningLight };
    }
    return { label: 'Checked in', color: Colors.textSecondary, bgColor: 'rgba(142, 142, 147, 0.10)' };
}

/**
 * Map meal_type to a food emoji.
 */
export function getMealEmoji(mealType: MealType | null): string {
    switch (mealType) {
        case 'breakfast': return '🥣';
        case 'lunch': return '🥗';
        case 'dinner': return '🍽️';
        case 'snack': return '🍎';
        default: return '🍴';
    }
}

/**
 * Format a date string as relative time (e.g. "2h ago", "Yesterday").
 */
export function formatRelativeTime(dateString: string): string {
    const now = new Date();
    const then = new Date(dateString);
    const diffMin = Math.round((now.getTime() - then.getTime()) / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const hours = Math.floor(diffMin / 60);
    if (hours < 24) return `${hours}h ago`;

    // Check if it was yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';

    // Use weekday name for the past week
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return then.toLocaleDateString('en-US', { weekday: 'long' });
    }

    // Older: show date
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
