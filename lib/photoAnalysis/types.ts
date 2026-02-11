// lib/photoAnalysis/types.ts
// TypeScript interfaces for the new meal photo analysis API

/**
 * Food category enum
 */
export type FoodCategory =
    | 'fruit'
    | 'vegetable'
    | 'protein'
    | 'grain'
    | 'dairy'
    | 'beverage'
    | 'snack'
    | 'dessert'
    | 'prepared_meal'
    | 'other';

/**
 * Portion estimate type
 */
export type PortionEstimateType = 'none' | 'qualitative' | 'volume_ml' | 'weight_g';

/**
 * Portion unit type
 */
export type PortionUnit = 'ml' | 'g' | 'cup' | 'tbsp' | 'tsp' | 'piece' | 'slice' | 'serving';

/**
 * Nutrition source type
 */
export type NutritionSource = 'fatsecret' | 'usda_fdc' | 'fallback_estimate';

/**
 * Depth payload from device sensors (for future ARKit/ARCore support)
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
 * Portion information for a detected food item
 */
export interface PortionInfo {
    estimate_type: PortionEstimateType;
    value: number | null;
    unit: PortionUnit;
    confidence: number;
}

/**
 * Nutrition data for a food item
 */
export interface NutritionData {
    calories: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
}

/**
 * Analyzed food item from the API
 */
export interface AnalyzedFoodItem {
    id: string;
    name: string;
    synonyms: string[];
    category: FoodCategory;
    portion: PortionInfo;
    detection_confidence: number;

    // Nutrition from FatSecret/USDA
    nutrition: NutritionData | null;
    nutrition_source: NutritionSource;
    nutrition_confidence: number;

    // Additional metadata
    matched_food_name?: string;
    matched_food_brand?: string;
    serving_description?: string;
}

/**
 * Photo quality assessment
 */
export interface PhotoQuality {
    is_blurry: boolean;
    has_occlusion: boolean;
    lighting_issue: boolean;
}

/**
 * Followup question type
 */
export type FollowupType = 'choose_one' | 'enter_amount' | 'confirm_items';

/**
 * Followup question for low confidence items
 */
export interface FollowupQuestion {
    id: string;
    item_id: string;
    type: FollowupType;
    question: string;
    options?: string[];
}

/**
 * User's response to a followup question
 */
export interface FollowupResponse {
    question_id: string;
    answer: string | number;
}

/**
 * Analysis status
 */
export type AnalysisStatus = 'complete' | 'needs_followup' | 'failed';

/**
 * Request payload for meals-from-photo endpoint
 */
export interface MealsFromPhotoRequest {
    user_id: string;
    photo_url: string;
    meal_type?: string;
    device_depth_payload?: DeviceDepthPayload;
    followup_responses?: FollowupResponse[];
}

/**
 * Debug information from the API
 */
export interface AnalysisDebugInfo {
    processingTimeMs: number;
    detectionTimeMs: number;
    nutritionLookupTimeMs: number;
    aiPromptTokens?: number;
    aiOutputTokens?: number;
    aiTotalTokens?: number;
    aiPromptTextTokens?: number;
    aiPromptImageTokens?: number;
    aiEstimatedCostUsd?: number;
}

/**
 * Response from meals-from-photo endpoint
 */
export interface MealsFromPhotoResponse {
    status: AnalysisStatus;
    items: AnalyzedFoodItem[];
    photo_quality: PhotoQuality;
    followups?: FollowupQuestion[];
    cache_hit: boolean;
    debug?: AnalysisDebugInfo;
}

/**
 * Error response from the API
 */
export interface MealsFromPhotoError {
    error: string;
    message?: string;
    requestId?: string;
}

/**
 * Combined response type (success or error)
 */
export type MealsFromPhotoResult =
    | { success: true; data: MealsFromPhotoResponse }
    | { success: false; error: MealsFromPhotoError };

/**
 * Convert AnalyzedFoodItem to the existing SelectedItem format for compatibility
 */
export interface SelectedItemFromAnalysis {
    provider: string;
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
    quantity: number;
}

/**
 * Convert an AnalyzedFoodItem to SelectedItem format
 */
export function toSelectedItem(item: AnalyzedFoodItem): SelectedItemFromAnalysis {
    return {
        provider: item.nutrition_source,
        external_id: item.id,
        display_name: item.name,
        brand: item.matched_food_brand || null,
        serving_size: item.portion.value,
        serving_unit: item.portion.unit,
        calories_kcal: item.nutrition?.calories ?? null,
        carbs_g: item.nutrition?.carbs_g ?? null,
        protein_g: item.nutrition?.protein_g ?? null,
        fat_g: item.nutrition?.fat_g ?? null,
        fibre_g: item.nutrition?.fibre_g ?? null,
        sugar_g: item.nutrition?.sugar_g ?? null,
        sodium_mg: item.nutrition?.sodium_mg ?? null,
        quantity: item.portion.estimate_type === 'none' ? 1 : (item.portion.value ?? 1),
    };
}

/**
 * Convert multiple AnalyzedFoodItems to SelectedItem format
 */
export function toSelectedItems(items: AnalyzedFoodItem[]): SelectedItemFromAnalysis[] {
    return items.map(toSelectedItem);
}

/**
 * Check if analysis needs user followup
 */
export function needsFollowup(response: MealsFromPhotoResponse): boolean {
    return response.status === 'needs_followup' && (response.followups?.length ?? 0) > 0;
}

/**
 * Check if photo quality is poor
 */
export function hasPhotoQualityIssues(quality: PhotoQuality): boolean {
    return quality.is_blurry || quality.has_occlusion || quality.lighting_issue;
}

/**
 * Get photo quality issue description
 */
export function getPhotoQualityMessage(quality: PhotoQuality): string | null {
    const issues: string[] = [];

    if (quality.is_blurry) issues.push('blurry');
    if (quality.has_occlusion) issues.push('partially hidden');
    if (quality.lighting_issue) issues.push('poor lighting');

    if (issues.length === 0) return null;

    return `Photo appears ${issues.join(' and ')}. Consider retaking for better results.`;
}

/**
 * Get confidence level label
 */
export function getConfidenceLabel(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
}
