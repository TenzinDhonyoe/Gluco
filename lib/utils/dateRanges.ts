/**
 * Date Range Utilities
 * Centralized functions for date range calculations used across the app
 */

export type RangeKey = '24h' | '7d' | '14d' | '30d' | '90d';

/**
 * Get the number of days for a given range
 */
export function getRangeDays(range: RangeKey): number {
    switch (range) {
        case '24h': return 1;
        case '7d': return 7;
        case '14d': return 14;
        case '30d': return 30;
        case '90d': return 90;
    }
}

/**
 * Get date range for a given range key
 * Returns start and end dates for filtering data
 */
export function getDateRange(range: RangeKey): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date(now);
    let startDate: Date;

    switch (range) {
        case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            break;
        case '14d':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 14);
            break;
        case '30d':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            break;
        case '90d':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 90);
            break;
        default:
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
    }

    return { startDate, endDate };
}

/**
 * Get a human-readable label for a range
 */
export function getRangeLabel(range: RangeKey): string {
    switch (range) {
        case '24h':
            return '24 hour average';
        case '7d':
            return '7 day average';
        case '14d':
            return '14 day average';
        case '30d':
            return '30 day average';
        case '90d':
            return '90 day average';
    }
}

/**
 * Get a short label for a range
 */
export function getRangeShortLabel(range: RangeKey): string {
    switch (range) {
        case '24h': return 'Last 24h';
        case '7d': return 'Last 7d';
        case '14d': return 'Last 14d';
        case '30d': return 'Last 30d';
        case '90d': return 'Last 90d';
    }
}

/**
 * Get extended date range for fetching historical data
 * Used when you need more data than the current range (e.g., for comparisons)
 */
export function getExtendedDateRange(range: RangeKey, multiplier: number = 2): { startDate: Date; endDate: Date } {
    const days = getRangeDays(range);
    const now = new Date();
    const endDate = new Date(now);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - (days * multiplier));
    
    return { startDate, endDate };
}

