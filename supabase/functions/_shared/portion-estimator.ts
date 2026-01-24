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
 * Common portion size references for validation
 */
export const PORTION_REFERENCES: Record<string, { typical_g: number; range_g: [number, number] }> = {
    // Fruits
    'apple': { typical_g: 180, range_g: [120, 250] },
    'banana': { typical_g: 120, range_g: [80, 180] },
    'orange': { typical_g: 130, range_g: [80, 200] },

    // Proteins
    'chicken_breast': { typical_g: 150, range_g: [100, 250] },
    'steak': { typical_g: 200, range_g: [120, 350] },
    'fish_fillet': { typical_g: 150, range_g: [100, 200] },
    'egg': { typical_g: 50, range_g: [40, 65] },

    // Grains
    'rice_cooked': { typical_g: 150, range_g: [80, 300] },
    'pasta_cooked': { typical_g: 200, range_g: [100, 350] },
    'bread_slice': { typical_g: 30, range_g: [20, 45] },

    // Dairy
    'milk_glass': { typical_g: 240, range_g: [200, 300] },
    'cheese_slice': { typical_g: 28, range_g: [15, 45] },
    'yogurt_cup': { typical_g: 170, range_g: [120, 250] },

    // Beverages
    'coffee_cup': { typical_g: 240, range_g: [180, 350] },
    'smoothie': { typical_g: 350, range_g: [250, 500] },
};

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
