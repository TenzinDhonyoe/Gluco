// lib/photoAnalysis/api.ts
// API client for the new meals-from-photo endpoint

import { supabase, ensureSignedMealPhotoUrl } from '../supabase';
import {
    FollowupResponse,
    MealsFromPhotoError,
    MealsFromPhotoResponse,
    MealsFromPhotoResult,
    DeviceDepthPayload,
    toSelectedItems,
    SelectedItemFromAnalysis,
} from './types';

/**
 * Options for photo analysis
 */
export interface AnalyzePhotoOptions {
    mealType?: string;
    depthPayload?: DeviceDepthPayload;
    followupResponses?: FollowupResponse[];
}

/**
 * Analyze a meal photo using the new separated-concerns pipeline
 *
 * @param userId - The authenticated user's ID
 * @param photoPath - Path to the photo in Supabase storage (will be converted to signed URL)
 * @param options - Optional parameters for meal type, depth data, and followup responses
 * @returns Analysis result with detected items and nutrition data
 */
export async function analyzeMealPhoto(
    userId: string,
    photoPath: string,
    options: AnalyzePhotoOptions = {}
): Promise<MealsFromPhotoResult> {
    try {
        console.log('[meals-from-photo] Starting analysis for path:', photoPath);

        // Get signed URL for the photo
        const photoUrl = await ensureSignedMealPhotoUrl(photoPath);
        if (!photoUrl) {
            console.error('[meals-from-photo] Failed to get signed URL for:', photoPath);
            return {
                success: false,
                error: {
                    error: 'Failed to access photo',
                    message: 'Could not generate access URL for the uploaded photo',
                },
            };
        }

        console.log('[meals-from-photo] Got signed URL, invoking edge function...');

        // Call the new endpoint
        const { data, error } = await supabase.functions.invoke('meals-from-photo', {
            body: {
                user_id: userId,
                photo_url: photoUrl,
                meal_type: options.mealType,
                device_depth_payload: options.depthPayload,
                followup_responses: options.followupResponses,
            },
        });

        if (error) {
            console.error('[meals-from-photo] Edge function error:', error);
            return {
                success: false,
                error: {
                    error: 'API call failed',
                    message: error.message || 'Unknown error calling analysis endpoint',
                },
            };
        }

        // Check for error response from the function
        if (data?.error) {
            console.error('[meals-from-photo] Server returned error:', data.error);
            return {
                success: false,
                error: data as MealsFromPhotoError,
            };
        }

        console.log('[meals-from-photo] Response received:', {
            status: data?.status,
            itemCount: data?.items?.length,
            cacheHit: data?.cache_hit,
        });

        return {
            success: true,
            data: data as MealsFromPhotoResponse,
        };
    } catch (e) {
        console.error('[meals-from-photo] Exception:', e);
        return {
            success: false,
            error: {
                error: 'Unexpected error',
                message: e instanceof Error ? e.message : 'Unknown error',
            },
        };
    }
}

/**
 * Submit followup responses and get updated analysis
 *
 * @param userId - The authenticated user's ID
 * @param photoPath - Path to the photo (same as original request)
 * @param responses - User's responses to followup questions
 * @param options - Additional options
 * @returns Updated analysis result
 */
export async function submitFollowupResponses(
    userId: string,
    photoPath: string,
    responses: FollowupResponse[],
    options: Omit<AnalyzePhotoOptions, 'followupResponses'> = {}
): Promise<MealsFromPhotoResult> {
    return analyzeMealPhoto(userId, photoPath, {
        ...options,
        followupResponses: responses,
    });
}

/**
 * Analyze a meal photo and convert results to the legacy SelectedItem format
 * for backward compatibility with existing UI components
 *
 * @param userId - The authenticated user's ID
 * @param photoPath - Path to the photo in Supabase storage
 * @param options - Optional parameters
 * @returns Analyzed items in legacy format, or null on failure
 */
export async function analyzeMealPhotoLegacy(
    userId: string,
    photoPath: string,
    options: AnalyzePhotoOptions = {}
): Promise<{
    items: SelectedItemFromAnalysis[];
    needsFollowup: boolean;
    followups?: MealsFromPhotoResponse['followups'];
    photoQuality?: MealsFromPhotoResponse['photo_quality'];
} | null> {
    const result = await analyzeMealPhoto(userId, photoPath, options);

    if (!result.success) {
        return null;
    }

    const { data } = result;

    if (data.status === 'failed' || data.items.length === 0) {
        return null;
    }

    return {
        items: toSelectedItems(data.items),
        needsFollowup: data.status === 'needs_followup',
        followups: data.followups,
        photoQuality: data.photo_quality,
    };
}

/**
 * Analyze a meal photo with retry logic for transient failures
 *
 * @param userId - The authenticated user's ID
 * @param photoPath - Path to the photo in Supabase storage
 * @param options - Optional parameters
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @returns Analysis result
 */
export async function analyzeMealPhotoWithRetry(
    userId: string,
    photoPath: string,
    options: AnalyzePhotoOptions = {},
    maxRetries: number = 2
): Promise<MealsFromPhotoResult> {
    let lastResult: MealsFromPhotoResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        lastResult = await analyzeMealPhoto(userId, photoPath, options);

        // Success - return immediately
        if (lastResult.success) {
            return lastResult;
        }

        // Check if error is retryable
        const error = lastResult.error;
        const isRetryable = error.message?.includes('timeout') ||
            error.message?.includes('network') ||
            error.message?.includes('502') ||
            error.message?.includes('503') ||
            error.message?.includes('504');

        if (!isRetryable || attempt === maxRetries) {
            break;
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`[meals-from-photo] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    return lastResult!;
}

/**
 * Check if the new meals-from-photo endpoint is available
 * Falls back to the legacy endpoint if not
 *
 * @returns true if the new endpoint is available
 */
export async function isNewEndpointAvailable(): Promise<boolean> {
    try {
        // Simple health check - call with invalid data, expect 400 not 404
        const { error } = await supabase.functions.invoke('meals-from-photo', {
            body: { user_id: 'test', photo_url: 'test' },
        });

        // 401 (unauthorized) or 400 (bad request) means endpoint exists
        // 404 means it doesn't exist yet
        return !error?.message?.includes('404');
    } catch {
        return false;
    }
}
