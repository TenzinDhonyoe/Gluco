// supabase/functions/_shared/stats.ts
// Small stats helpers for edge functions (no external deps).

export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

export function clamp01(val: number): number {
    return clamp(val, 0, 1);
}

export function filterValid(values: (number | null | undefined)[]): number[] {
    return values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
}

export function mean(values: (number | null | undefined)[]): number | null {
    const valid = filterValid(values);
    if (valid.length === 0) return null;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export function median(values: (number | null | undefined)[]): number | null {
    const valid = filterValid(values);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function stddev(values: (number | null | undefined)[]): number | null {
    const valid = filterValid(values);
    if (valid.length === 0) return null;
    const avg = valid.reduce((sum, v) => sum + v, 0) / valid.length;
    const variance = valid.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / valid.length;
    return Math.sqrt(variance);
}

export function percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function iqrBounds(values: number[]): { q1: number; q3: number; iqr: number; lower: number; upper: number } | null {
    if (values.length === 0) return null;
    const q1 = percentile(values, 0.25);
    const q3 = percentile(values, 0.75);
    if (q1 === null || q3 === null) return null;
    const iqr = q3 - q1;
    return {
        q1,
        q3,
        iqr,
        lower: q1 - 1.5 * iqr,
        upper: q3 + 1.5 * iqr,
    };
}

export function winsorize(values: (number | null | undefined)[], minCount: number = 5): number[] {
    const valid = filterValid(values);
    if (valid.length < minCount) return valid;
    const bounds = iqrBounds(valid);
    if (!bounds) return valid;
    return valid.map((v) => clamp(v, bounds.lower, bounds.upper));
}
