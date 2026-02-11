// supabase/functions/_shared/nutrition-validation.ts
// Shared nutrition validation to prevent calorie hallucination bugs

/**
 * Hard limits for nutrient values per single food item
 * These caps are enforced to prevent AI hallucination of extreme values
 */
export const NUTRIENT_LIMITS = {
    calories: { min: 0, max: 2500 },     // Max per single item (e.g., large pizza)
    carbs: { min: 0, max: 400 },         // grams
    protein: { min: 0, max: 200 },       // grams
    fat: { min: 0, max: 200 },           // grams
    fiber: { min: 0, max: 100 },         // grams
    sugar: { min: 0, max: 200 },         // grams
    sodium: { min: 0, max: 10000 },      // mg
};

/**
 * Stricter limits for beverages - even a large frappuccino is < 800 cal
 */
export const BEVERAGE_LIMITS = {
    calories: { min: 0, max: 800 },
    carbs: { min: 0, max: 150 },
    protein: { min: 0, max: 50 },
    fat: { min: 0, max: 50 },
};

/**
 * Keywords to identify beverages for stricter limits
 */
export const BEVERAGE_KEYWORDS = [
    'coffee', 'tea', 'water', 'juice', 'soda', 'drink', 'smoothie',
    'latte', 'espresso', 'cappuccino', 'mocha', 'frappuccino', 'frappe',
    'milk', 'shake', 'milkshake', 'cola', 'pepsi', 'coke', 'sprite',
    'beer', 'wine', 'cocktail', 'beverage', 'chai', 'matcha',
    'americano', 'macchiato', 'cold brew', 'iced tea', 'iced coffee',
];

/**
 * Interface for nutrient values (flexible to match various formats)
 */
export interface NutrientValues {
    calories?: number | null;
    calories_kcal?: number | null;
    carbs?: number | null;
    carbs_g?: number | null;
    protein?: number | null;
    protein_g?: number | null;
    fat?: number | null;
    fat_g?: number | null;
    fiber?: number | null;
    fibre?: number | null;
    fibre_g?: number | null;
    fiber_g?: number | null;
    sugar?: number | null;
    sugar_g?: number | null;
    sugars_g?: number | null;
    sodium?: number | null;
    sodium_mg?: number | null;
}

/**
 * Check if an item name indicates a beverage
 */
export function isBeverage(name: string): boolean {
    const lowerName = name.toLowerCase();
    return BEVERAGE_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Extract a numeric calorie value from various formats
 */
function getCalorieValue(nutrients: NutrientValues): number | null {
    const val = nutrients.calories ?? nutrients.calories_kcal;
    if (typeof val === 'number' && Number.isFinite(val)) {
        return val;
    }
    return null;
}

/**
 * Extract numeric macro values from various formats
 */
function getMacroValues(nutrients: NutrientValues): {
    carbs: number | null;
    protein: number | null;
    fat: number | null;
    fiber: number | null;
    sugar: number | null;
    sodium: number | null;
} {
    const getNum = (v: number | null | undefined): number | null =>
        typeof v === 'number' && Number.isFinite(v) ? v : null;

    return {
        carbs: getNum(nutrients.carbs ?? nutrients.carbs_g),
        protein: getNum(nutrients.protein ?? nutrients.protein_g),
        fat: getNum(nutrients.fat ?? nutrients.fat_g),
        fiber: getNum(nutrients.fiber ?? nutrients.fibre ?? nutrients.fibre_g ?? nutrients.fiber_g),
        sugar: getNum(nutrients.sugar ?? nutrients.sugar_g ?? nutrients.sugars_g),
        sodium: getNum(nutrients.sodium ?? nutrients.sodium_mg),
    };
}

/**
 * Validate that calories are consistent with macros (within tolerance)
 * Returns true if consistent, false if suspicious
 */
export function validateMacroConsistency(
    calories: number,
    carbs: number | null,
    protein: number | null,
    fat: number | null,
    tolerance: number = 0.35 // 35% tolerance for estimation variance
): { isConsistent: boolean; calculatedCalories: number } {
    const calculatedCal =
        ((carbs ?? 0) * 4) + ((protein ?? 0) * 4) + ((fat ?? 0) * 9);

    if (calculatedCal === 0) {
        // Can't validate if no macros provided
        return { isConsistent: true, calculatedCalories: calculatedCal };
    }

    const diff = Math.abs(calories - calculatedCal) / Math.max(calories, calculatedCal, 1);
    return {
        isConsistent: diff <= tolerance,
        calculatedCalories: Math.round(calculatedCal),
    };
}

/**
 * Result of nutrient enforcement
 */
export interface EnforceNutrientsResult {
    calories: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    _wasClamped: boolean;
    _originalCalories?: number;
    _clampReason?: string;
}

/**
 * Enforce nutrient limits on parsed values
 * This function CAPS extreme values instead of just logging warnings
 *
 * @param itemName - The name of the food item (used to detect beverages)
 * @param nutrients - The nutrient values to validate/cap
 * @param quantity - Item quantity (defaults to 1)
 * @returns Clamped nutrient values with metadata about whether clamping occurred
 */
export function enforceNutrientLimits(
    itemName: string,
    nutrients: NutrientValues,
    quantity: number = 1
): EnforceNutrientsResult {
    const beverage = isBeverage(itemName);
    const limits = beverage ? { ...NUTRIENT_LIMITS, ...BEVERAGE_LIMITS } : NUTRIENT_LIMITS;

    const originalCalories = getCalorieValue(nutrients);
    const macros = getMacroValues(nutrients);

    let wasClamped = false;
    let clampReason = '';

    // Per-unit values (divide by quantity, clamp, then will be multiplied by quantity downstream)
    const perUnit = {
        calories: originalCalories !== null ? originalCalories / Math.max(quantity, 1) : null,
        carbs: macros.carbs !== null ? macros.carbs / Math.max(quantity, 1) : null,
        protein: macros.protein !== null ? macros.protein / Math.max(quantity, 1) : null,
        fat: macros.fat !== null ? macros.fat / Math.max(quantity, 1) : null,
        fiber: macros.fiber !== null ? macros.fiber / Math.max(quantity, 1) : null,
        sugar: macros.sugar !== null ? macros.sugar / Math.max(quantity, 1) : null,
        sodium: macros.sodium !== null ? macros.sodium / Math.max(quantity, 1) : null,
    };

    // Clamp calories
    let clampedCalories = perUnit.calories;
    if (clampedCalories !== null) {
        if (clampedCalories > limits.calories.max) {
            clampedCalories = limits.calories.max;
            wasClamped = true;
            clampReason = beverage ? 'beverage_calorie_cap' : 'calorie_cap';
        } else if (clampedCalories < limits.calories.min) {
            clampedCalories = limits.calories.min;
            wasClamped = true;
            clampReason = 'negative_calorie_correction';
        }
    }

    // Clamp macros
    const clampedCarbs = perUnit.carbs !== null
        ? clamp(perUnit.carbs, limits.carbs?.min ?? 0, limits.carbs?.max ?? NUTRIENT_LIMITS.carbs.max)
        : null;

    const clampedProtein = perUnit.protein !== null
        ? clamp(perUnit.protein, limits.protein?.min ?? 0, limits.protein?.max ?? NUTRIENT_LIMITS.protein.max)
        : null;

    const clampedFat = perUnit.fat !== null
        ? clamp(perUnit.fat, limits.fat?.min ?? 0, limits.fat?.max ?? NUTRIENT_LIMITS.fat.max)
        : null;

    const clampedFiber = perUnit.fiber !== null
        ? clamp(perUnit.fiber, NUTRIENT_LIMITS.fiber.min, NUTRIENT_LIMITS.fiber.max)
        : null;

    const clampedSugar = perUnit.sugar !== null
        ? clamp(perUnit.sugar, NUTRIENT_LIMITS.sugar.min, NUTRIENT_LIMITS.sugar.max)
        : null;

    const clampedSodium = perUnit.sodium !== null
        ? clamp(perUnit.sodium, NUTRIENT_LIMITS.sodium.min, NUTRIENT_LIMITS.sodium.max)
        : null;

    // Track if macros were clamped
    if (perUnit.carbs !== null && clampedCarbs !== perUnit.carbs) wasClamped = true;
    if (perUnit.protein !== null && clampedProtein !== perUnit.protein) wasClamped = true;
    if (perUnit.fat !== null && clampedFat !== perUnit.fat) wasClamped = true;

    // Validate macro consistency after clamping
    if (clampedCalories !== null) {
        const { isConsistent, calculatedCalories } = validateMacroConsistency(
            clampedCalories,
            clampedCarbs,
            clampedProtein,
            clampedFat
        );

        // If calories are way off from macros and macros seem reasonable, use calculated
        if (!isConsistent && calculatedCalories > 0 && calculatedCalories < limits.calories.max) {
            // Only override if calculated is significantly lower (prevents false positives)
            if (clampedCalories > calculatedCalories * 1.5) {
                clampedCalories = calculatedCalories;
                wasClamped = true;
                clampReason = 'macro_consistency_correction';
            }
        }
    }

    return {
        calories: clampedCalories !== null ? Math.round(clampedCalories) : null,
        carbs_g: clampedCarbs !== null ? Math.round(clampedCarbs * 10) / 10 : null,
        protein_g: clampedProtein !== null ? Math.round(clampedProtein * 10) / 10 : null,
        fat_g: clampedFat !== null ? Math.round(clampedFat * 10) / 10 : null,
        fibre_g: clampedFiber !== null ? Math.round(clampedFiber * 10) / 10 : null,
        sugar_g: clampedSugar !== null ? Math.round(clampedSugar * 10) / 10 : null,
        sodium_mg: clampedSodium !== null ? Math.round(clampedSodium) : null,
        _wasClamped: wasClamped,
        _originalCalories: originalCalories ?? undefined,
        _clampReason: clampReason || undefined,
    };
}

/**
 * Common food calorie reference ranges for sanity checking
 */
export const COMMON_FOOD_REFERENCES: Record<string, { min: number; max: number }> = {
    // Beverages
    'black coffee': { min: 0, max: 10 },
    'espresso': { min: 0, max: 10 },
    'latte': { min: 100, max: 400 },
    'cappuccino': { min: 80, max: 200 },
    'frappuccino': { min: 200, max: 600 },
    'tea': { min: 0, max: 50 },
    'orange juice': { min: 80, max: 200 },
    'soda': { min: 100, max: 250 },
    'smoothie': { min: 150, max: 500 },
    'milkshake': { min: 300, max: 800 },

    // Fruits
    'apple': { min: 70, max: 130 },
    'banana': { min: 90, max: 140 },
    'orange': { min: 50, max: 100 },
    'papaya': { min: 30, max: 200 },
    'mango': { min: 50, max: 200 },
    'pineapple': { min: 40, max: 200 },
    'watermelon': { min: 30, max: 200 },
    'guava': { min: 25, max: 120 },
    'kiwi': { min: 35, max: 90 },
    'grapes': { min: 50, max: 200 },
    'strawberry': { min: 5, max: 60 },
    'blueberry': { min: 30, max: 130 },

    // Dairy & Protein
    'yogurt': { min: 80, max: 300 },
    'cheese': { min: 50, max: 250 },
    'milk': { min: 80, max: 200 },
    'egg': { min: 60, max: 100 },

    // Breakfast
    'toast': { min: 60, max: 200 },
    'oatmeal': { min: 100, max: 350 },
    'cereal': { min: 100, max: 300 },

    // Indian foods
    'roti': { min: 70, max: 140 },
    'chapati': { min: 70, max: 140 },
    'dosa': { min: 100, max: 250 },
    'idli': { min: 30, max: 80 },
    'dal': { min: 100, max: 300 },

    // Meals
    'sandwich': { min: 200, max: 700 },
    'salad': { min: 50, max: 500 },
    'pizza slice': { min: 200, max: 400 },
    'burger': { min: 400, max: 900 },
    'rice bowl': { min: 300, max: 800 },
    'pasta': { min: 300, max: 900 },
};

/**
 * Get a reasonable calorie estimate if the AI returns an extreme value
 * Returns null if no reference found
 */
export function getReferenceCalorieRange(itemName: string): { min: number; max: number } | null {
    const lowerName = itemName.toLowerCase();

    for (const [food, range] of Object.entries(COMMON_FOOD_REFERENCES)) {
        if (lowerName.includes(food)) {
            return range;
        }
    }

    return null;
}
