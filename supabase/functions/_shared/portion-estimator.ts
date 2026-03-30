// supabase/functions/_shared/portion-estimator.ts
// Portion estimation interface with placeholder for ARKit/ARCore depth data

import { DetectedFoodItem, PortionEstimateType, PortionUnit } from './gemini-structured.ts';

/**
 * Depth payload from device sensors (ARKit/ARCore)
 */
export interface DeviceDepthPayload {
    source: 'arkit' | 'arcore' | 'none';
    depth_map_base64?: string;
    depth_map_width?: number;
    depth_map_height?: number;
    focal_length?: number;
    principal_point?: { x: number; y: number };
    confidence_map_base64?: string;
}

/**
 * Bounding box for a detected item in the image
 */
export interface BoundingBox {
    x: number;      // Left edge (0-1 normalized)
    y: number;      // Top edge (0-1 normalized)
    width: number;  // Width (0-1 normalized)
    height: number; // Height (0-1 normalized)
}

/**
 * Portion estimate result
 */
export interface PortionEstimate {
    estimate_type: PortionEstimateType;
    value: number | null;
    unit: PortionUnit;
    confidence: number;
    method: 'visual' | 'depth' | 'reference_object';
    details?: string;
}

/**
 * Detection with optional bounding box for portion estimation
 */
export interface DetectionWithBounds extends DetectedFoodItem {
    bounding_box?: BoundingBox;
}

/**
 * Abstract interface for portion estimation strategies
 */
export interface PortionEstimator {
    /**
     * Estimate portion for a detected food item
     */
    estimate(
        detection: DetectionWithBounds,
        depthPayload?: DeviceDepthPayload
    ): Promise<PortionEstimate>;

    /**
     * Check if this estimator can handle the given payload
     */
    canHandle(depthPayload?: DeviceDepthPayload): boolean;
}

/**
 * Visual-only portion estimator (current default)
 * Uses Gemini's visual analysis without depth data
 */
export class VisualPortionEstimator implements PortionEstimator {
    canHandle(depthPayload?: DeviceDepthPayload): boolean {
        // Visual estimator can always handle (it's the fallback)
        return true;
    }

    async estimate(
        detection: DetectionWithBounds,
        _depthPayload?: DeviceDepthPayload
    ): Promise<PortionEstimate> {
        // Use the portion already estimated by Gemini
        // This is a pass-through since Gemini does visual estimation
        return {
            estimate_type: detection.portion.estimate_type,
            value: detection.portion.value,
            unit: detection.portion.unit,
            confidence: detection.portion.confidence,
            method: 'visual',
            details: detection.visible_portion_descriptor,
        };
    }
}

/**
 * Depth-based portion estimator (placeholder for ARKit/ARCore)
 * This will use depth data to more accurately estimate portion sizes
 */
export class DepthPortionEstimator implements PortionEstimator {
    canHandle(depthPayload?: DeviceDepthPayload): boolean {
        return depthPayload?.source !== 'none' &&
            depthPayload?.source !== undefined &&
            Boolean(depthPayload?.depth_map_base64);
    }

    async estimate(
        detection: DetectionWithBounds,
        depthPayload?: DeviceDepthPayload
    ): Promise<PortionEstimate> {
        // TODO: Implement depth-based portion estimation
        // This would involve:
        // 1. Decoding the depth map
        // 2. Using the bounding box to find the region of interest
        // 3. Computing volume from depth differences
        // 4. Converting volume to weight based on food density

        console.warn('DepthPortionEstimator: Not yet implemented, falling back to visual');

        // For now, fall back to visual estimation with slightly higher confidence
        // since we know depth data is available (just not processed)
        return {
            estimate_type: detection.portion.estimate_type,
            value: detection.portion.value,
            unit: detection.portion.unit,
            confidence: Math.min(detection.portion.confidence + 0.1, 0.9),
            method: 'visual', // Would be 'depth' when implemented
            details: `${detection.visible_portion_descriptor} (depth data available but not processed)`,
        };
    }
}

/**
 * Reference object-based portion estimator
 * Uses known objects (plate, hand, utensil) to calibrate portion estimates
 */
export class ReferenceObjectEstimator implements PortionEstimator {
    // Standard reference object sizes in cm
    private static readonly REFERENCE_SIZES: Record<string, { width: number; height: number }> = {
        'dinner_plate': { width: 27, height: 27 },
        'salad_plate': { width: 20, height: 20 },
        'bowl': { width: 15, height: 10 },
        'mug': { width: 8, height: 10 },
        'fork': { width: 2, height: 20 },
        'knife': { width: 2, height: 24 },
        'spoon': { width: 4, height: 17 },
        'hand': { width: 10, height: 19 },
    };

    canHandle(_depthPayload?: DeviceDepthPayload): boolean {
        // Reference object estimation doesn't require depth data
        // It requires detecting reference objects in the image
        // For now, return false as this needs Gemini to detect reference objects
        return false;
    }

    async estimate(
        detection: DetectionWithBounds,
        _depthPayload?: DeviceDepthPayload
    ): Promise<PortionEstimate> {
        // TODO: Implement reference object-based estimation
        // This would involve:
        // 1. Detecting reference objects in the image (plate, hand, etc.)
        // 2. Computing pixel-to-cm ratio based on known reference sizes
        // 3. Measuring the food item's dimensions
        // 4. Estimating volume/weight from dimensions

        console.warn('ReferenceObjectEstimator: Not yet implemented, falling back to visual');

        return {
            estimate_type: detection.portion.estimate_type,
            value: detection.portion.value,
            unit: detection.portion.unit,
            confidence: detection.portion.confidence,
            method: 'visual',
            details: detection.visible_portion_descriptor,
        };
    }
}

/**
 * Factory function to create the appropriate portion estimator
 */
export function createPortionEstimator(
    depthPayload?: DeviceDepthPayload
): PortionEstimator {
    // Priority: Depth > Reference Object > Visual
    const depthEstimator = new DepthPortionEstimator();
    if (depthEstimator.canHandle(depthPayload)) {
        return depthEstimator;
    }

    const referenceEstimator = new ReferenceObjectEstimator();
    if (referenceEstimator.canHandle(depthPayload)) {
        return referenceEstimator;
    }

    // Default to visual estimation
    return new VisualPortionEstimator();
}

/**
 * Estimate portions for multiple detected items
 */
export async function estimatePortions(
    detections: DetectionWithBounds[],
    depthPayload?: DeviceDepthPayload
): Promise<PortionEstimate[]> {
    const estimator = createPortionEstimator(depthPayload);

    const estimates = await Promise.all(
        detections.map(detection => estimator.estimate(detection, depthPayload))
    );

    return estimates;
}

/**
 * Volume-to-grams conversion map (approximate, water-density based)
 */
export const VOLUME_TO_GRAMS: Record<string, number> = {
    cup: 240,
    tbsp: 15,
    tsp: 5,
    oz: 28.35,
    fl_oz: 30,
    ml: 1,
    l: 1000,
    pint: 473,
    quart: 946,
};

/**
 * Default portion weights by food category (grams)
 */
export const CATEGORY_DEFAULT_WEIGHTS: Record<string, number> = {
    fruit: 150,
    vegetable: 120,
    protein: 150,
    grain: 180,
    dairy: 170,
    beverage: 240,
    snack: 50,
    dessert: 100,
    prepared_meal: 350,
    other: 150,
};

/**
 * Common portion size references for validation
 */
export const PORTION_REFERENCES: Record<string, { typical_g: number; range_g: [number, number] }> = {
    // Fruits
    'apple': { typical_g: 180, range_g: [120, 250] },
    'banana': { typical_g: 120, range_g: [80, 180] },
    'orange': { typical_g: 130, range_g: [80, 200] },
    'grapes': { typical_g: 150, range_g: [80, 250] },
    'strawberry': { typical_g: 150, range_g: [80, 250] },
    'blueberry': { typical_g: 100, range_g: [50, 200] },
    'mango': { typical_g: 200, range_g: [150, 300] },
    'watermelon': { typical_g: 280, range_g: [150, 400] },
    'pineapple': { typical_g: 165, range_g: [80, 250] },
    'pear': { typical_g: 180, range_g: [130, 250] },
    'peach': { typical_g: 150, range_g: [100, 200] },
    'avocado': { typical_g: 150, range_g: [100, 200] },
    'avocado_half': { typical_g: 75, range_g: [50, 100] },
    'papaya': { typical_g: 300, range_g: [150, 500] },
    'papaya_piece': { typical_g: 40, range_g: [25, 60] },
    'kiwi': { typical_g: 75, range_g: [50, 100] },
    'guava': { typical_g: 70, range_g: [40, 120] },
    'dragonfruit': { typical_g: 200, range_g: [120, 300] },
    'passion_fruit': { typical_g: 18, range_g: [10, 30] },
    'lychee': { typical_g: 10, range_g: [6, 15] },
    'pomegranate': { typical_g: 175, range_g: [120, 250] },
    'cantaloupe': { typical_g: 150, range_g: [80, 250] },
    'honeydew': { typical_g: 150, range_g: [80, 250] },
    'plum': { typical_g: 70, range_g: [45, 100] },
    'cherry': { typical_g: 8, range_g: [5, 12] },
    'fig': { typical_g: 50, range_g: [30, 80] },
    'dates': { typical_g: 24, range_g: [15, 35] },

    // Proteins
    'chicken_breast': { typical_g: 150, range_g: [100, 250] },
    'chicken': { typical_g: 150, range_g: [80, 300] },
    'steak': { typical_g: 200, range_g: [120, 350] },
    'beef': { typical_g: 170, range_g: [100, 300] },
    'fish_fillet': { typical_g: 150, range_g: [100, 200] },
    'fish': { typical_g: 150, range_g: [80, 250] },
    'salmon': { typical_g: 170, range_g: [100, 250] },
    'shrimp': { typical_g: 100, range_g: [60, 200] },
    'egg': { typical_g: 50, range_g: [40, 65] },
    'tofu': { typical_g: 150, range_g: [80, 250] },
    'burger': { typical_g: 200, range_g: [120, 300] },
    'sausage': { typical_g: 75, range_g: [40, 150] },
    'bacon': { typical_g: 30, range_g: [15, 60] },

    // Grains
    'rice_cooked': { typical_g: 150, range_g: [80, 300] },
    'rice': { typical_g: 200, range_g: [100, 400] },
    'pasta_cooked': { typical_g: 200, range_g: [100, 350] },
    'pasta': { typical_g: 200, range_g: [100, 350] },
    'noodle': { typical_g: 200, range_g: [100, 350] },
    'bread_slice': { typical_g: 30, range_g: [20, 45] },
    'bread': { typical_g: 50, range_g: [25, 100] },
    'sandwich': { typical_g: 200, range_g: [150, 350] },
    'tortilla': { typical_g: 60, range_g: [30, 100] },
    'pizza': { typical_g: 120, range_g: [80, 200] },
    'pancake': { typical_g: 75, range_g: [40, 130] },
    'oatmeal': { typical_g: 250, range_g: [150, 400] },
    'cereal': { typical_g: 60, range_g: [30, 100] },
    'roti': { typical_g: 35, range_g: [25, 50] },
    'chapati': { typical_g: 35, range_g: [25, 50] },
    'naan': { typical_g: 100, range_g: [70, 140] },
    'dosa': { typical_g: 100, range_g: [70, 150] },
    'idli': { typical_g: 35, range_g: [25, 50] },

    // Dairy
    'milk_glass': { typical_g: 240, range_g: [200, 300] },
    'cheese_slice': { typical_g: 28, range_g: [15, 45] },
    'cheese': { typical_g: 40, range_g: [15, 80] },
    'yogurt_cup': { typical_g: 170, range_g: [120, 250] },
    'yogurt': { typical_g: 170, range_g: [120, 250] },
    'butter': { typical_g: 14, range_g: [5, 30] },
    'cream': { typical_g: 30, range_g: [15, 60] },
    'ice_cream': { typical_g: 130, range_g: [70, 200] },

    // Vegetables
    'potato': { typical_g: 200, range_g: [100, 350] },
    'sweet_potato': { typical_g: 180, range_g: [100, 300] },
    'broccoli': { typical_g: 150, range_g: [80, 250] },
    'carrot': { typical_g: 80, range_g: [40, 150] },
    'tomato': { typical_g: 120, range_g: [60, 200] },
    'corn': { typical_g: 100, range_g: [60, 170] },
    'salad': { typical_g: 150, range_g: [80, 300] },
    'spinach': { typical_g: 80, range_g: [30, 150] },

    // Prepared meals & mixed
    'soup': { typical_g: 300, range_g: [200, 500] },
    'curry': { typical_g: 300, range_g: [200, 450] },
    'stew': { typical_g: 300, range_g: [200, 450] },
    'dal': { typical_g: 200, range_g: [120, 300] },
    'sambar': { typical_g: 200, range_g: [120, 300] },
    'burrito': { typical_g: 300, range_g: [200, 450] },
    'taco': { typical_g: 120, range_g: [80, 180] },
    'sushi': { typical_g: 40, range_g: [25, 60] },
    'dumpling': { typical_g: 30, range_g: [20, 50] },
    'fries': { typical_g: 120, range_g: [70, 200] },
    'french_fries': { typical_g: 120, range_g: [70, 200] },

    // Snacks & desserts
    'cookie': { typical_g: 40, range_g: [20, 80] },
    'cake': { typical_g: 100, range_g: [50, 180] },
    'muffin': { typical_g: 110, range_g: [60, 170] },
    'donut': { typical_g: 60, range_g: [40, 100] },
    'brownie': { typical_g: 60, range_g: [30, 100] },
    'chips': { typical_g: 50, range_g: [25, 100] },
    'nuts': { typical_g: 40, range_g: [20, 80] },
    'chocolate': { typical_g: 40, range_g: [20, 100] },
    'granola_bar': { typical_g: 40, range_g: [25, 60] },

    // Beverages
    'coffee_cup': { typical_g: 240, range_g: [180, 350] },
    'smoothie': { typical_g: 350, range_g: [250, 500] },
    'juice': { typical_g: 240, range_g: [150, 350] },

    // === EXPANDED: Additional common foods (USDA FNDDS top consumption) ===

    // More proteins
    'turkey': { typical_g: 150, range_g: [80, 250] },
    'lamb': { typical_g: 150, range_g: [80, 250] },
    'pork_chop': { typical_g: 170, range_g: [100, 280] },
    'pork': { typical_g: 150, range_g: [80, 250] },
    'chicken_thigh': { typical_g: 130, range_g: [80, 200] },
    'chicken_wing': { typical_g: 50, range_g: [30, 80] },
    'chicken_drumstick': { typical_g: 80, range_g: [50, 120] },
    'chicken_tender': { typical_g: 40, range_g: [25, 60] },
    'meatball': { typical_g: 30, range_g: [15, 50] },
    'hot_dog': { typical_g: 50, range_g: [35, 80] },
    'ham': { typical_g: 60, range_g: [30, 120] },
    'tuna': { typical_g: 140, range_g: [80, 200] },
    'crab': { typical_g: 100, range_g: [50, 180] },
    'lobster': { typical_g: 150, range_g: [100, 250] },
    'clam': { typical_g: 100, range_g: [50, 200] },
    'scallop': { typical_g: 80, range_g: [40, 150] },
    'tempeh': { typical_g: 100, range_g: [60, 170] },
    'seitan': { typical_g: 100, range_g: [60, 170] },
    'lentils': { typical_g: 200, range_g: [100, 350] },
    'chickpeas': { typical_g: 160, range_g: [80, 250] },
    'black_beans': { typical_g: 170, range_g: [80, 300] },
    'edamame': { typical_g: 120, range_g: [60, 200] },

    // More grains & starches
    'quinoa': { typical_g: 185, range_g: [100, 300] },
    'couscous': { typical_g: 160, range_g: [80, 250] },
    'bagel': { typical_g: 100, range_g: [70, 130] },
    'croissant': { typical_g: 60, range_g: [40, 90] },
    'waffle': { typical_g: 75, range_g: [50, 120] },
    'english_muffin': { typical_g: 60, range_g: [45, 80] },
    'pita': { typical_g: 60, range_g: [40, 90] },
    'biscuit': { typical_g: 60, range_g: [35, 100] },
    'cornbread': { typical_g: 65, range_g: [40, 100] },
    'cracker': { typical_g: 15, range_g: [5, 30] },
    'wrap': { typical_g: 70, range_g: [40, 110] },
    'fried_rice': { typical_g: 250, range_g: [150, 400] },
    'risotto': { typical_g: 250, range_g: [150, 400] },
    'polenta': { typical_g: 200, range_g: [120, 300] },

    // More vegetables
    'bell_pepper': { typical_g: 120, range_g: [80, 200] },
    'cucumber': { typical_g: 100, range_g: [50, 200] },
    'onion': { typical_g: 110, range_g: [50, 200] },
    'mushroom': { typical_g: 70, range_g: [30, 150] },
    'zucchini': { typical_g: 130, range_g: [70, 220] },
    'eggplant': { typical_g: 150, range_g: [80, 250] },
    'green_beans': { typical_g: 100, range_g: [50, 180] },
    'asparagus': { typical_g: 100, range_g: [50, 170] },
    'cauliflower': { typical_g: 130, range_g: [70, 220] },
    'kale': { typical_g: 70, range_g: [30, 130] },
    'cabbage': { typical_g: 100, range_g: [50, 200] },
    'lettuce': { typical_g: 50, range_g: [20, 100] },
    'celery': { typical_g: 50, range_g: [20, 100] },
    'peas': { typical_g: 80, range_g: [40, 150] },
    'artichoke': { typical_g: 120, range_g: [80, 180] },
    'beet': { typical_g: 80, range_g: [50, 150] },

    // More prepared meals
    'fried_chicken': { typical_g: 150, range_g: [80, 250] },
    'chicken_nugget': { typical_g: 20, range_g: [12, 30] },
    'mac_and_cheese': { typical_g: 250, range_g: [150, 400] },
    'lasagna': { typical_g: 300, range_g: [200, 450] },
    'pad_thai': { typical_g: 300, range_g: [200, 450] },
    'ramen': { typical_g: 400, range_g: [250, 550] },
    'pho': { typical_g: 400, range_g: [250, 550] },
    'biryani': { typical_g: 300, range_g: [200, 450] },
    'fried_egg': { typical_g: 50, range_g: [40, 65] },
    'scrambled_egg': { typical_g: 120, range_g: [60, 200] },
    'omelette': { typical_g: 150, range_g: [80, 250] },
    'quiche': { typical_g: 130, range_g: [80, 200] },
    'stir_fry': { typical_g: 250, range_g: [150, 400] },
    'casserole': { typical_g: 300, range_g: [200, 450] },
    'pot_pie': { typical_g: 250, range_g: [180, 350] },
    'meatloaf': { typical_g: 170, range_g: [100, 280] },
    'fish_and_chips': { typical_g: 300, range_g: [200, 450] },
    'gyro': { typical_g: 250, range_g: [180, 350] },
    'falafel': { typical_g: 35, range_g: [20, 55] },
    'hummus': { typical_g: 60, range_g: [30, 120] },
    'guacamole': { typical_g: 60, range_g: [30, 120] },
    'salsa': { typical_g: 40, range_g: [20, 80] },
    'spring_roll': { typical_g: 70, range_g: [40, 120] },
    'egg_roll': { typical_g: 80, range_g: [50, 130] },

    // More dairy
    'cottage_cheese': { typical_g: 120, range_g: [60, 200] },
    'cream_cheese': { typical_g: 30, range_g: [15, 60] },
    'mozzarella': { typical_g: 30, range_g: [15, 60] },
    'parmesan': { typical_g: 10, range_g: [5, 25] },
    'whipped_cream': { typical_g: 15, range_g: [8, 30] },

    // More snacks & desserts
    'popcorn': { typical_g: 30, range_g: [15, 60] },
    'pretzel': { typical_g: 30, range_g: [15, 60] },
    'trail_mix': { typical_g: 40, range_g: [20, 80] },
    'energy_bar': { typical_g: 50, range_g: [30, 70] },
    'pie': { typical_g: 130, range_g: [80, 200] },
    'cheesecake': { typical_g: 120, range_g: [80, 180] },
    'pudding': { typical_g: 150, range_g: [80, 230] },
    'jelly': { typical_g: 130, range_g: [70, 200] },
    'candy_bar': { typical_g: 50, range_g: [30, 80] },
    'peanut_butter': { typical_g: 32, range_g: [15, 60] },
    'jam': { typical_g: 20, range_g: [10, 40] },
    'honey': { typical_g: 21, range_g: [10, 40] },
    'maple_syrup': { typical_g: 20, range_g: [10, 40] },

    // More beverages
    'tea': { typical_g: 240, range_g: [180, 350] },
    'latte': { typical_g: 350, range_g: [240, 480] },
    'cappuccino': { typical_g: 180, range_g: [120, 250] },
    'hot_chocolate': { typical_g: 240, range_g: [180, 350] },
    'protein_shake': { typical_g: 350, range_g: [240, 500] },
    'soda': { typical_g: 355, range_g: [240, 500] },
    'beer': { typical_g: 355, range_g: [240, 500] },
    'wine': { typical_g: 150, range_g: [100, 200] },
};

/**
 * Convert a portion to grams using food name, category, and portion info.
 *
 * Resolution order:
 * 1. Already weight_g with a numeric value → return as-is
 * 2. Numeric value with a convertible volume unit → VOLUME_TO_GRAMS
 * 3. Fuzzy match against PORTION_REFERENCES → typical_g
 * 4. CATEGORY_DEFAULT_WEIGHTS fallback
 */
export function convertToGrams(
    foodName: string,
    category: string,
    portion: { estimate_type: string; value: number | null; unit: string }
): number {
    // 1. Already grams
    if (portion.estimate_type === 'weight_g' && typeof portion.value === 'number' && portion.value > 0) {
        return portion.value;
    }

    // 2. Numeric value with convertible unit
    if (typeof portion.value === 'number' && portion.value > 0) {
        const unitLower = portion.unit.toLowerCase().replace(/\s+/g, '_');
        const gramsPerUnit = VOLUME_TO_GRAMS[unitLower];
        if (gramsPerUnit) {
            return Math.round(portion.value * gramsPerUnit);
        }
    }

    // 3. Fuzzy match against PORTION_REFERENCES
    const nameLower = foodName.toLowerCase();
    // Try exact key match first, then substring match
    for (const [key, ref] of Object.entries(PORTION_REFERENCES)) {
        const keyWords = key.replace(/_/g, ' ');
        if (nameLower === keyWords || nameLower.includes(keyWords) || keyWords.includes(nameLower)) {
            return ref.typical_g;
        }
    }
    // Second pass: partial token match
    for (const [key, ref] of Object.entries(PORTION_REFERENCES)) {
        const keyWords = key.replace(/_/g, ' ');
        const nameTokens = nameLower.split(/\s+/);
        const keyTokens = keyWords.split(/\s+/);
        if (nameTokens.some(t => t.length > 2 && keyTokens.some(k => k.includes(t) || t.includes(k)))) {
            return ref.typical_g;
        }
    }

    // 4. Category fallback
    return CATEGORY_DEFAULT_WEIGHTS[category] ?? CATEGORY_DEFAULT_WEIGHTS['other'] ?? 150;
}

/**
 * Validate a portion estimate against typical ranges
 */
export function validatePortionEstimate(
    foodName: string,
    estimate: PortionEstimate
): { isValid: boolean; suggestion?: string } {
    // Only validate weight estimates
    if (estimate.estimate_type !== 'weight_g' || estimate.value === null) {
        return { isValid: true };
    }

    // Find matching reference
    const nameLower = foodName.toLowerCase();
    for (const [key, ref] of Object.entries(PORTION_REFERENCES)) {
        if (nameLower.includes(key.replace('_', ' '))) {
            const [min, max] = ref.range_g;
            if (estimate.value < min || estimate.value > max) {
                return {
                    isValid: false,
                    suggestion: `Typical ${key.replace('_', ' ')} is ${min}-${max}g (you estimated ${estimate.value}g)`,
                };
            }
            return { isValid: true };
        }
    }

    return { isValid: true };
}

/**
 * Clamp a gram value to a food-specific range if available,
 * otherwise use generic bounds [1, 5000].
 */
export function clampToFoodRange(
    foodName: string,
    category: string,
    grams: number
): { clamped: number; wasClamped: boolean; range?: [number, number] } {
    const nameLower = foodName.toLowerCase();

    // Try food-specific range first
    for (const [key, ref] of Object.entries(PORTION_REFERENCES)) {
        if (nameLower.includes(key.replace('_', ' ')) || key.replace('_', ' ').includes(nameLower)) {
            const [min, max] = ref.range_g;
            const clamped = Math.max(min, Math.min(max, grams));
            return {
                clamped,
                wasClamped: clamped !== grams,
                range: ref.range_g,
            };
        }
    }

    // Generic bounds
    const clamped = Math.max(1, Math.min(5000, grams));
    return { clamped, wasClamped: clamped !== grams };
}

/**
 * Get food-specific Small/Medium/Large gram presets.
 * Returns presets based on portion reference ranges, or category defaults.
 */
export function getFoodSizePresets(
    foodName: string,
    category: string
): { small_g: number; medium_g: number; large_g: number } {
    const nameLower = foodName.toLowerCase();

    for (const [key, ref] of Object.entries(PORTION_REFERENCES)) {
        if (nameLower.includes(key.replace('_', ' ')) || key.replace('_', ' ').includes(nameLower)) {
            const [min, max] = ref.range_g;
            return {
                small_g: Math.round(min + (ref.typical_g - min) * 0.3),
                medium_g: ref.typical_g,
                large_g: Math.round(ref.typical_g + (max - ref.typical_g) * 0.6),
            };
        }
    }

    // Category-based defaults
    const defaultWeight = CATEGORY_DEFAULT_WEIGHTS[category] || 150;
    return {
        small_g: Math.round(defaultWeight * 0.6),
        medium_g: defaultWeight,
        large_g: Math.round(defaultWeight * 1.5),
    };
}
