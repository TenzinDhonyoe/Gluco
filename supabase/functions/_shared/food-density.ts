// Food density lookup for validating/overriding Gemini gram estimates.
// Two-tier: specific food name → category fallback → default.

const FOOD_DENSITIES: Record<string, number> = {
  // Proteins
  'chicken breast': 1.04, 'beef': 1.05, 'fish': 1.02, 'eggs': 1.03, 'tofu': 1.05,
  // Grains
  'cooked rice': 0.93, 'rice': 0.93, 'cooked pasta': 1.08, 'pasta': 1.08,
  'bread': 0.42, 'oatmeal': 1.05,
  // Vegetables
  'leafy greens': 0.35, 'broccoli': 0.59, 'potatoes': 1.09, 'potato': 1.09,
  'mixed salad': 0.45, 'salad': 0.45,
  // Fruits
  'apple': 0.88, 'banana': 0.95, 'berries': 0.72, 'citrus': 0.92,
  // Dairy
  'milk': 1.03, 'yogurt': 1.06, 'cheese': 1.09, 'ice cream': 0.55,
  // Fats/oils
  'olive oil': 0.92, 'butter': 0.91,
  // Mixed dishes
  'curry': 1.05, 'stew': 1.03, 'soup': 1.01, 'stir-fry': 0.88, 'stir fry': 0.88,
  // Beverages
  'water': 1.0, 'juice': 1.05, 'smoothie': 1.02,
};

const CATEGORY_DENSITIES: Record<string, number> = {
  protein: 1.05, grain: 0.93, vegetable: 0.60, fruit: 0.88,
  dairy: 1.06, beverage: 1.02, fat: 0.92, mixed_dish: 0.95,
  condiment: 0.95, dessert: 0.80, snack: 0.55, prepared_meal: 0.95, other: 0.95,
};

const DEFAULT_DENSITY = 0.95;

export function getDensity(foodName: string, category: string): number {
  const normalized = foodName.toLowerCase().trim();

  // Exact match
  if (FOOD_DENSITIES[normalized] !== undefined) {
    return FOOD_DENSITIES[normalized];
  }

  // Substring match: check if any key is in foodName or foodName contains any key
  for (const [key, density] of Object.entries(FOOD_DENSITIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return density;
    }
  }

  // Category fallback
  const catNormalized = category.toLowerCase().trim();
  if (CATEGORY_DENSITIES[catNormalized] !== undefined) {
    return CATEGORY_DENSITIES[catNormalized];
  }

  return DEFAULT_DENSITY;
}

export function validateGramEstimate(
  foodName: string,
  category: string,
  grams: number,
  volumeMl: number,
): number {
  if (volumeMl <= 0) return grams;

  const density = getDensity(foodName, category);
  const densityBasedGrams = volumeMl * density;
  const ratio = grams / densityBasedGrams;

  if (ratio < 0.6 || ratio > 1.4) {
    console.log(
      `[food-density] Override: "${foodName}" (${category}) ` +
      `${grams}g → ${Math.round(densityBasedGrams)}g ` +
      `(density=${density}, volume=${volumeMl}mL, ratio=${ratio.toFixed(2)})`,
    );
    return Math.round(densityBasedGrams);
  }

  return grams;
}
