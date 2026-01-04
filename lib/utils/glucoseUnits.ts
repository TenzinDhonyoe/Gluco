/**
 * Glucose Unit Conversion and Formatting Utilities
 * 
 * All glucose values are stored in mmol/L in the database.
 * This module provides conversion and formatting for display in either unit.
 */

export type GlucoseUnit = 'mmol/L' | 'mg/dL';

// Conversion factor: 1 mmol/L = 18.0182 mg/dL
const CONVERSION_FACTOR = 18.0182;

/**
 * Convert mmol/L to mg/dL
 */
export function mmolToMgdl(mmol: number): number {
    return mmol * CONVERSION_FACTOR;
}

/**
 * Convert mg/dL to mmol/L
 */
export function mgdlToMmol(mgdl: number): number {
    return mgdl / CONVERSION_FACTOR;
}

/**
 * Convert a value from mmol/L to the target unit
 */
export function convertFromMmol(valueMmol: number, unit: GlucoseUnit): number {
    if (unit === 'mg/dL') {
        return mmolToMgdl(valueMmol);
    }
    return valueMmol;
}

/**
 * Convert a value from the given unit to mmol/L (for storage)
 */
export function convertToMmol(value: number, unit: GlucoseUnit): number {
    if (unit === 'mg/dL') {
        return mgdlToMmol(value);
    }
    return value;
}

/**
 * Format a glucose value (stored in mmol/L) for display in the selected unit
 * - mmol/L: 1 decimal place (e.g., "5.6")
 * - mg/dL: integer (e.g., "101")
 */
export function formatGlucose(valueMmol: number, unit: GlucoseUnit): string {
    if (unit === 'mg/dL') {
        return Math.round(mmolToMgdl(valueMmol)).toString();
    }
    return valueMmol.toFixed(1);
}

/**
 * Format a glucose value with its unit label
 * - mmol/L: "5.6 mmol/L"
 * - mg/dL: "101 mg/dL"
 */
export function formatGlucoseWithUnit(valueMmol: number, unit: GlucoseUnit): string {
    return `${formatGlucose(valueMmol, unit)} ${unit}`;
}

/**
 * Format a target range for display
 * - mmol/L: "3.9–10.0"
 * - mg/dL: "70–180"
 */
export function formatTargetRange(minMmol: number, maxMmol: number, unit: GlucoseUnit): string {
    const min = formatGlucose(minMmol, unit);
    const max = formatGlucose(maxMmol, unit);
    return `${min}–${max}`;
}

/**
 * Format a target range with unit label
 */
export function formatTargetRangeWithUnit(minMmol: number, maxMmol: number, unit: GlucoseUnit): string {
    return `${formatTargetRange(minMmol, maxMmol, unit)} ${unit}`;
}

/**
 * Parse user input glucose value and convert to mmol/L for storage
 * Returns null if the input is invalid
 */
export function parseGlucoseInput(text: string, unit: GlucoseUnit): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const value = parseFloat(trimmed);
    if (isNaN(value) || value <= 0) return null;

    // Convert to mmol/L for storage
    if (unit === 'mg/dL') {
        return mgdlToMmol(value);
    }
    return value;
}

/**
 * Get the placeholder text for glucose input based on unit
 */
export function getGlucoseInputPlaceholder(unit: GlucoseUnit): string {
    if (unit === 'mg/dL') {
        return 'e.g., 100';
    }
    return 'e.g., 5.5';
}

/**
 * Get reasonable min/max values for input validation based on unit
 */
export function getGlucoseInputRange(unit: GlucoseUnit): { min: number; max: number } {
    if (unit === 'mg/dL') {
        return { min: 20, max: 600 }; // ~1.1 - 33.3 mmol/L
    }
    return { min: 1.0, max: 33.3 };
}

/**
 * Validate if a glucose value (in user's unit) is within reasonable range
 */
export function isValidGlucoseValue(value: number, unit: GlucoseUnit): boolean {
    const { min, max } = getGlucoseInputRange(unit);
    return value >= min && value <= max;
}

/**
 * Get the unit label (short form)
 */
export function getUnitLabel(unit: GlucoseUnit): string {
    return unit;
}

/**
 * Get the default glucose unit
 */
export function getDefaultGlucoseUnit(): GlucoseUnit {
    return 'mmol/L';
}

