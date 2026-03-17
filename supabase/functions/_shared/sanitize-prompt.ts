// supabase/functions/_shared/sanitize-prompt.ts
// Sanitizes user-controlled strings before interpolation into AI prompts.
// Prevents prompt injection via newlines, control characters, and excessive length.

const MAX_FIELD_LENGTH = 200;
const MAX_ARRAY_ITEMS = 10;

/**
 * Sanitize a single string for safe prompt interpolation.
 * Strips newlines, control characters, and truncates to a safe length.
 */
export function sanitizeForPrompt(value: string | null | undefined, maxLength = MAX_FIELD_LENGTH): string {
    if (!value) return '';
    return value
        // Remove control characters (except spaces)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Collapse newlines and carriage returns to spaces
        .replace(/[\r\n]+/g, ' ')
        // Collapse multiple spaces
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, maxLength);
}

/**
 * Sanitize an array of strings for prompt interpolation.
 * Limits the number of items and sanitizes each one.
 */
export function sanitizeArrayForPrompt(
    values: string[] | null | undefined,
    maxItems = MAX_ARRAY_ITEMS,
    maxItemLength = MAX_FIELD_LENGTH
): string[] {
    if (!values || !Array.isArray(values)) return [];
    return values
        .slice(0, maxItems)
        .map(v => sanitizeForPrompt(v, maxItemLength))
        .filter(v => v.length > 0);
}
