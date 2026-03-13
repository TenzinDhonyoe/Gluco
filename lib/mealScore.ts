/**
 * Meal Score Engine — Pure deterministic scoring of glucose response to meals.
 *
 * All scoring is done in mg/dL. Values stored in mmol/L are converted before scoring.
 * Labels use safe language: "gentle", "moderate", "notable", "sharp" (never "bad"/"dangerous").
 */

import { Colors } from '@/constants/Colors';
import { mmolToMgdl } from '@/lib/utils/glucoseUnits';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScoreLabel = 'gentle' | 'moderate' | 'notable' | 'sharp';
export type InsightType = 'comparison' | 'pattern' | 'pairing' | 'experiment' | 'celebration';

export interface MealScoreComponents {
    peakSpikeScore: number;
    returnToBaselineScore: number;
    variabilityScore: number;
    timeInRangeScore: number;
}

export interface MealScoreResult {
    score: number;
    label: ScoreLabel;
    components: MealScoreComponents;
    raw: {
        baselineMgDl: number | null;
        peakMgDl: number | null;
        peakDeltaMgDl: number | null;
        returnToBaselineMin: number | null;
        variabilitySd: number | null;
        timeInRangePct: number | null;
    };
    readingCount: number;
    sufficient: boolean;
}

export interface GlucoseReading {
    value: number; // mg/dL
    timestamp: Date;
}

// ─── Component Scoring Functions ─────────────────────────────────────────────

/** Score based on peak rise above baseline (mg/dL). Lower delta = higher score. */
export function scorePeakSpike(deltaFromBaseline: number): number {
    if (deltaFromBaseline < 20) return 100;
    if (deltaFromBaseline < 40) return 80;
    if (deltaFromBaseline < 60) return 60;
    if (deltaFromBaseline < 80) return 40;
    if (deltaFromBaseline < 100) return 20;
    return 0;
}

/** Score based on minutes to return within 10 mg/dL of baseline. Faster = higher. */
export function scoreReturnToBaseline(minutes: number | null): number {
    if (minutes === null) return 0;
    if (minutes < 60) return 100;
    if (minutes < 90) return 80;
    if (minutes < 120) return 60;
    if (minutes < 150) return 40;
    if (minutes < 180) return 20;
    return 0;
}

/** Score based on standard deviation of readings. Lower variability = higher score. */
export function scoreVariability(sd: number): number {
    if (sd < 10) return 100;
    if (sd < 15) return 80;
    if (sd < 20) return 60;
    if (sd < 30) return 40;
    return 0;
}

/** Score based on % of time in 70-140 mg/dL range. Direct mapping. */
export function scoreTimeInRange(pct: number): number {
    return Math.round(Math.max(0, Math.min(100, pct)));
}

// ─── Label & Color Helpers ───────────────────────────────────────────────────

export function getScoreLabel(score: number): ScoreLabel {
    if (score >= 75) return 'gentle';
    if (score >= 50) return 'moderate';
    if (score >= 25) return 'notable';
    return 'sharp';
}

export function getScoreColor(label: ScoreLabel): string {
    switch (label) {
        case 'gentle': return Colors.success;
        case 'moderate': return Colors.warning;
        case 'notable': return '#FF8C42';
        case 'sharp': return Colors.error;
    }
}

export function getScoreEmoji(label: ScoreLabel): string {
    switch (label) {
        case 'gentle': return '🟢';
        case 'moderate': return '🟡';
        case 'notable': return '🟠';
        case 'sharp': return '🔴';
    }
}

// ─── Helper: Statistics ──────────────────────────────────────────────────────

function mean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = mean(values);
    const squaredDiffs = values.map(v => (v - avg) ** 2);
    return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

// ─── Main Scoring Function ───────────────────────────────────────────────────

// In-range band for scoring (mg/dL) — internal, never shown as clinical threshold
const RANGE_LOW = 70;
const RANGE_HIGH = 140;

// Component weights
const WEIGHTS = {
    peakSpike: 0.35,
    returnToBaseline: 0.25,
    variability: 0.15,
    timeInRange: 0.25,
};

/**
 * Calculate a meal's glucose response score from glucose readings in the post-meal window.
 *
 * @param readings - Glucose readings in mg/dL, sorted by timestamp ascending
 * @param mealTimestamp - When the meal was logged
 * @returns MealScoreResult with score, label, component breakdown, and raw values
 */
export function calculateMealScore(
    readings: GlucoseReading[],
    mealTimestamp: Date,
): MealScoreResult {
    const insufficient: MealScoreResult = {
        score: 0,
        label: 'sharp',
        components: { peakSpikeScore: 0, returnToBaselineScore: 0, variabilityScore: 0, timeInRangeScore: 0 },
        raw: { baselineMgDl: null, peakMgDl: null, peakDeltaMgDl: null, returnToBaselineMin: null, variabilitySd: null, timeInRangePct: null },
        readingCount: readings.length,
        sufficient: false,
    };

    if (readings.length < 3) return insufficient;

    const mealTime = mealTimestamp.getTime();
    const values = readings.map(r => r.value);

    // Baseline: average of readings in the 15 min before meal, or first reading
    const preReadings = readings.filter(r => r.timestamp.getTime() < mealTime);
    const baselineMgDl = preReadings.length > 0
        ? mean(preReadings.map(r => r.value))
        : readings[0].value;

    // Peak
    const peakMgDl = Math.max(...values);
    const peakDeltaMgDl = peakMgDl - baselineMgDl;

    // Return to baseline: first reading after peak that is within 10 mg/dL of baseline
    const peakIndex = values.indexOf(peakMgDl);
    let returnToBaselineMin: number | null = null;
    for (let i = peakIndex + 1; i < readings.length; i++) {
        if (Math.abs(readings[i].value - baselineMgDl) <= 10) {
            returnToBaselineMin = (readings[i].timestamp.getTime() - mealTime) / 60000;
            break;
        }
    }

    // Variability (standard deviation)
    const variabilitySd = standardDeviation(values);

    // Time in range: % of readings in 70-140 mg/dL
    const inRangeCount = values.filter(v => v >= RANGE_LOW && v <= RANGE_HIGH).length;
    const timeInRangePct = (inRangeCount / values.length) * 100;

    // Component scores
    const peakSpikeScore = scorePeakSpike(Math.max(0, peakDeltaMgDl));
    const returnToBaselineScoreVal = scoreReturnToBaseline(returnToBaselineMin);
    const variabilityScoreVal = scoreVariability(variabilitySd);
    const timeInRangeScoreVal = scoreTimeInRange(timeInRangePct);

    // Weighted overall
    const score = Math.round(
        peakSpikeScore * WEIGHTS.peakSpike +
        returnToBaselineScoreVal * WEIGHTS.returnToBaseline +
        variabilityScoreVal * WEIGHTS.variability +
        timeInRangeScoreVal * WEIGHTS.timeInRange
    );

    return {
        score,
        label: getScoreLabel(score),
        components: {
            peakSpikeScore,
            returnToBaselineScore: returnToBaselineScoreVal,
            variabilityScore: variabilityScoreVal,
            timeInRangeScore: timeInRangeScoreVal,
        },
        raw: {
            baselineMgDl: Math.round(baselineMgDl * 10) / 10,
            peakMgDl: Math.round(peakMgDl * 10) / 10,
            peakDeltaMgDl: Math.round(peakDeltaMgDl * 10) / 10,
            returnToBaselineMin,
            variabilitySd: Math.round(variabilitySd * 10) / 10,
            timeInRangePct: Math.round(timeInRangePct * 10) / 10,
        },
        readingCount: readings.length,
        sufficient: true,
    };
}

// ─── Convert DB glucose logs (mmol/L) to mg/dL readings ─────────────────────

export function glucoseLogsToReadings(
    logs: Array<{ glucose_level: number; logged_at: string }>,
): GlucoseReading[] {
    return logs.map(log => ({
        value: mmolToMgdl(log.glucose_level),
        timestamp: new Date(log.logged_at),
    }));
}

// ─── Token Helpers (ported from premeal-analyze edge function) ───────────────

const STOPWORDS = new Set([
    'and', 'the', 'with', 'from', 'for', 'its', 'this', 'that', 'was',
    'are', 'were', 'has', 'had', 'have', 'not', 'but', 'what', 'all',
    'can', 'her', 'she', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
    'see', 'way', 'who', 'did', 'get', 'let', 'say', 'too', 'use',
]);

export function normalizeToken(token: string): string {
    return token.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

export function buildMealTokens(mealName: string, itemNames: string[] = []): string[] {
    const tokens: string[] = [];

    for (const word of mealName.split(/\s+/)) {
        const normalized = normalizeToken(word);
        if (normalized.length >= 3 && !STOPWORDS.has(normalized)) {
            tokens.push(normalized);
        }
    }

    for (const name of itemNames) {
        for (const word of name.split(/\s+/)) {
            const normalized = normalizeToken(word);
            if (normalized.length >= 3 && !STOPWORDS.has(normalized)) {
                tokens.push(normalized);
            }
        }
    }

    return [...new Set(tokens)];
}

export function jaccardSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...a, ...b]).size;
    return intersection / union;
}
