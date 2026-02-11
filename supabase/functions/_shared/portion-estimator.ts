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
