/**
 * Request Manager for Food Search
 * Implements monotonically increasing request IDs to prevent stale responses
 * from overwriting newer ones when users type quickly.
 */

// Current request ID - monotonically increasing
let currentRequestId = 0;

/**
 * Generate a new request ID for a search operation
 * Each call increments the global counter
 */
export function generateRequestId(): number {
    return ++currentRequestId;
}

/**
 * Check if a request is stale (an older request that should be ignored)
 * @param requestId - The request ID to check
 * @returns true if this request is older than the current one
 */
export function isStaleRequest(requestId: number): boolean {
    return requestId < currentRequestId;
}

/**
 * Get the current request ID without incrementing
 */
export function getCurrentRequestId(): number {
    return currentRequestId;
}

/**
 * Reset request counter (mainly for testing)
 */
export function resetRequestId(): void {
    currentRequestId = 0;
}
