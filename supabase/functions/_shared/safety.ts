export const BANNED_TERMS = [
    'prediabetes',
    'diabetes',
    'insulin resistance',
    'diagnose',
    'detect',
    'treat',
    'prevent',
    'medical device',
    'clinical',
    'therapeutic',
    'prescription',
    'reverse',
    'hypoglycemia',
    'hyperglycemia',
    'blood sugar spike',
    'glucose spike',
    'spike',
    'risk',
];

export function containsBannedTerms(text: string): boolean {
    const lower = text.toLowerCase();
    return BANNED_TERMS.some(term => lower.includes(term));
}

export function sanitizeText(text: string): string | null {
    if (!text) return null;
    if (containsBannedTerms(text)) {
        return null;
    }
    return text;
}

export function sanitizeStringArray(items: string[]): string[] {
    return items.filter(item => sanitizeText(item) !== null);
}
