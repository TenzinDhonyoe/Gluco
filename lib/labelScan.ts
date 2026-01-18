/**
 * Label Scan Client Library
 * Functions for capturing and parsing nutrition label photos
 */

import { NormalizedFood, supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';

// Types
export interface ParsedLabel {
    display_name: string;
    brand?: string;
    serving: {
        amount?: number | null;
        unit?: string;
        description?: string;
    };
    per_serving: {
        calories?: number | null;
        carbs_g?: number | null;
        fibre_g?: number | null;
        sugars_g?: number | null;
        protein_g?: number | null;
        fat_g?: number | null;
        sat_fat_g?: number | null;
        sodium_mg?: number | null;
    };
    confidence: number;
    warnings: string[];
    raw_extracted: Record<string, string>;
}

export interface LabelScanResult {
    success: boolean;
    parsed?: ParsedLabel;
    food?: NormalizedFood;
    error?: string;
    errorDetail?: string;
}

/**
 * Parse a nutrition label from a Base64 image
 */
export async function parseLabelFromImage(
    imageBase64: string,
    options: { locale?: string; units?: 'metric' | 'us'; aiEnabled?: boolean } = {}
): Promise<LabelScanResult> {
    try {
        // Note: AI enabled check removed - label scanning is available to all users

        const { data, error } = await supabase.functions.invoke('label-parse', {
            body: {
                image_base64: imageBase64,
                locale: options.locale || 'en',
                units: options.units || 'metric',
            },
        });

        if (error) {
            console.error('Label parse error:', error);

            // Try to get more details from the error context
            let errorMessage = 'Failed to analyze label';
            let errorDetail = 'Please try again';

            // Check if error has a context with body (contains the actual error)
            if (error.context && typeof error.context === 'object') {
                try {
                    // The context might contain the response body
                    const ctx = error.context as any;
                    if (ctx.body) {
                        const bodyText = await ctx.body.text?.() || ctx.body;
                        const bodyJson = typeof bodyText === 'string' ? JSON.parse(bodyText) : bodyText;
                        if (bodyJson.error) errorMessage = bodyJson.error;
                        if (bodyJson.details) errorDetail = bodyJson.details;
                    }
                } catch {
                    // If parsing fails, use defaults
                }
            }

            // Check error message for common cases
            if (error.message?.includes('rate limit') || error.message?.includes('429')) {
                errorMessage = 'Too many requests';
                errorDetail = 'Please wait a moment and try again';
            } else if (error.message?.includes('timeout')) {
                errorMessage = 'Request timed out';
                errorDetail = 'The image may be too large. Try a smaller photo.';
            }

            return {
                success: false,
                error: errorMessage,
                errorDetail: errorDetail,
            };
        }

        if (data?.error) {
            return {
                success: false,
                error: data.error,
                errorDetail: data.details || 'Could not read the label',
            };
        }

        const parsed = data as ParsedLabel;
        const food = mapParsedLabelToFood(parsed);

        return {
            success: true,
            parsed,
            food,
        };
    } catch (err: any) {
        console.error('Label scan failed:', err);

        // Provide user-friendly error messages
        let errorMessage = 'Something went wrong';
        let errorDetail = 'Please try again';

        if (err?.message?.includes('network') || err?.message?.includes('fetch')) {
            errorMessage = 'Network error';
            errorDetail = 'Check your connection and try again';
        } else if (err?.message?.includes('non-2xx')) {
            errorMessage = 'Could not read the label';
            errorDetail = 'Try better lighting or flatten the package';
        }

        return {
            success: false,
            error: errorMessage,
            errorDetail: errorDetail,
        };
    }
}

/**
 * Generate a stable ID for a custom food item
 */
export async function generateCustomFoodId(
    displayName: string,
    calories?: number | null,
    carbs?: number | null,
    protein?: number | null
): Promise<string> {
    const input = `${displayName}|${calories || 0}|${carbs || 0}|${protein || 0}`;
    const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        input
    );
    return `custom_${digest.slice(0, 16)}`;
}

/**
 * Convert parsed label data to NormalizedFood format
 */
export function mapParsedLabelToFood(parsed: ParsedLabel): NormalizedFood {
    // Generate sync ID (we'll make it async in the caller if needed)
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    const externalId = `custom_${timestamp}_${random}`;

    return {
        provider: 'custom' as 'fdc' | 'off', // Cast to satisfy type, we'll handle this
        external_id: externalId,
        display_name: parsed.display_name,
        brand: parsed.brand || null,
        serving_size: parsed.serving?.amount ?? null,
        serving_unit: parsed.serving?.unit || 'g',
        calories_kcal: parsed.per_serving?.calories ?? null,
        carbs_g: parsed.per_serving?.carbs_g ?? null,
        protein_g: parsed.per_serving?.protein_g ?? null,
        fat_g: parsed.per_serving?.fat_g ?? null,
        fibre_g: parsed.per_serving?.fibre_g ?? null,
        sugar_g: parsed.per_serving?.sugars_g ?? null,
        sodium_mg: parsed.per_serving?.sodium_mg ?? null,
    };
}

/**
 * Format serving description for display
 */
export function formatServingDescription(parsed: ParsedLabel): string {
    const { serving } = parsed;

    if (serving.description) {
        return serving.description;
    }

    if (serving.amount && serving.unit) {
        return `${serving.amount}${serving.unit}`;
    }

    return 'Per serving';
}

/**
 * Check if parsed label has enough data to be useful
 */
export function isValidParsedLabel(parsed: ParsedLabel): boolean {
    const { per_serving } = parsed;

    // At minimum, should have calories OR carbs+protein
    const hasCalories = per_serving.calories !== null && per_serving.calories !== undefined;
    const hasMacros = (
        (per_serving.carbs_g !== null && per_serving.carbs_g !== undefined) ||
        (per_serving.protein_g !== null && per_serving.protein_g !== undefined)
    );

    return hasCalories || hasMacros;
}
