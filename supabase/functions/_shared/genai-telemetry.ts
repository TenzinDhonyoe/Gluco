// supabase/functions/_shared/genai-telemetry.ts
// Shared token and cost telemetry helpers for Gemini API responses.

export interface TokenDetail {
    modality: string;
    token_count: number;
}

export interface GeminiUsage {
    prompt_token_count: number;
    output_token_count: number;
    total_token_count: number;
    cached_content_token_count: number;
    thoughts_token_count: number;
    prompt_tokens_details: TokenDetail[];
    output_tokens_details: TokenDetail[];
    cache_tokens_details: TokenDetail[];
}

export interface GeminiPricing {
    model: string;
    input_cost_per_1m_tokens_usd: number;
    output_cost_per_1m_tokens_usd: number;
    source: 'default' | 'env';
}

export interface GeminiCost {
    input_cost_usd: number;
    output_cost_usd: number;
    total_cost_usd: number;
}

export interface GeminiUsageTelemetry {
    model: string;
    usage: GeminiUsage;
    pricing: GeminiPricing;
    estimated_cost: GeminiCost;
}

const TOKENS_PER_MILLION = 1_000_000;

function toFiniteNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

function normalizeDetails(raw: unknown): TokenDetail[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw.map((entry) => {
        const obj = (entry && typeof entry === 'object')
            ? entry as Record<string, unknown>
            : {};

        const modalityRaw = obj.modality ?? obj.type ?? 'UNKNOWN';
        const modality = String(modalityRaw).toUpperCase();
        const tokenCount = toFiniteNumber(obj.tokenCount ?? obj.token_count ?? 0);

        return {
            modality,
            token_count: tokenCount,
        };
    });
}

function pickModalityTokens(details: TokenDetail[], modality: string): number {
    const target = modality.toUpperCase();
    return details
        .filter((detail) => detail.modality === target)
        .reduce((sum, detail) => sum + detail.token_count, 0);
}

function parseEnvRate(name: string): number | null {
    const raw = Deno.env.get(name);
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

export function resolveGeminiPricing(model: string): GeminiPricing {
    const inputOverride = parseEnvRate('GEMINI_INPUT_COST_PER_1M_TOKENS');
    const outputOverride = parseEnvRate('GEMINI_OUTPUT_COST_PER_1M_TOKENS');

    if (inputOverride !== null && outputOverride !== null) {
        return {
            model,
            input_cost_per_1m_tokens_usd: inputOverride,
            output_cost_per_1m_tokens_usd: outputOverride,
            source: 'env',
        };
    }

    const modelLower = model.toLowerCase();

    if (modelLower.includes('gemini-2.5-flash-lite')) {
        return {
            model,
            input_cost_per_1m_tokens_usd: 0.1,
            output_cost_per_1m_tokens_usd: 0.4,
            source: 'default',
        };
    }

    if (modelLower.includes('gemini-2.5-flash')) {
        return {
            model,
            input_cost_per_1m_tokens_usd: 0.3,
            output_cost_per_1m_tokens_usd: 2.5,
            source: 'default',
        };
    }

    if (modelLower.includes('gemini-2.0-flash')) {
        return {
            model,
            input_cost_per_1m_tokens_usd: 0.1,
            output_cost_per_1m_tokens_usd: 0.4,
            source: 'default',
        };
    }

    return {
        model,
        input_cost_per_1m_tokens_usd: 0,
        output_cost_per_1m_tokens_usd: 0,
        source: 'default',
    };
}

export function extractGeminiUsage(response: unknown): GeminiUsage | null {
    const responseObj = (response && typeof response === 'object')
        ? response as Record<string, unknown>
        : null;

    if (!responseObj) {
        return null;
    }

    const usageRaw = responseObj.usageMetadata ?? responseObj.usage_metadata;
    if (!usageRaw || typeof usageRaw !== 'object') {
        return null;
    }

    const usageObj = usageRaw as Record<string, unknown>;
    const promptTokenCount = toFiniteNumber(
        usageObj.promptTokenCount ?? usageObj.prompt_token_count ?? 0
    );
    const outputTokenCount = toFiniteNumber(
        usageObj.candidatesTokenCount ?? usageObj.candidates_token_count ?? 0
    );
    const totalTokenCountRaw = toFiniteNumber(
        usageObj.totalTokenCount ?? usageObj.total_token_count ?? 0
    );
    const totalTokenCount = totalTokenCountRaw > 0
        ? totalTokenCountRaw
        : promptTokenCount + outputTokenCount;

    const promptDetails = normalizeDetails(
        usageObj.promptTokensDetails ?? usageObj.prompt_tokens_details
    );
    const outputDetails = normalizeDetails(
        usageObj.candidatesTokensDetails ?? usageObj.candidates_tokens_details
    );
    const cacheDetails = normalizeDetails(
        usageObj.cacheTokensDetails ?? usageObj.cache_tokens_details
    );

    return {
        prompt_token_count: promptTokenCount,
        output_token_count: outputTokenCount,
        total_token_count: totalTokenCount,
        cached_content_token_count: toFiniteNumber(
            usageObj.cachedContentTokenCount ?? usageObj.cached_content_token_count ?? 0
        ),
        thoughts_token_count: toFiniteNumber(
            usageObj.thoughtsTokenCount ?? usageObj.thoughts_token_count ?? 0
        ),
        prompt_tokens_details: promptDetails,
        output_tokens_details: outputDetails,
        cache_tokens_details: cacheDetails,
    };
}

export function calculateGeminiCost(
    usage: GeminiUsage,
    pricing: GeminiPricing
): GeminiCost {
    const inputCostUsd = (usage.prompt_token_count / TOKENS_PER_MILLION) * pricing.input_cost_per_1m_tokens_usd;
    const outputCostUsd = (usage.output_token_count / TOKENS_PER_MILLION) * pricing.output_cost_per_1m_tokens_usd;

    return {
        input_cost_usd: round(inputCostUsd, 8),
        output_cost_usd: round(outputCostUsd, 8),
        total_cost_usd: round(inputCostUsd + outputCostUsd, 8),
    };
}

export function buildGeminiUsageTelemetry(
    response: unknown,
    model: string
): GeminiUsageTelemetry | null {
    const usage = extractGeminiUsage(response);
    if (!usage) {
        return null;
    }

    const pricing = resolveGeminiPricing(model);
    const estimatedCost = calculateGeminiCost(usage, pricing);

    return {
        model,
        usage,
        pricing,
        estimated_cost: estimatedCost,
    };
}

export function summarizeModalityTokens(usage: GeminiUsage): Record<string, number> {
    return {
        prompt_text_tokens: pickModalityTokens(usage.prompt_tokens_details, 'TEXT'),
        prompt_image_tokens: pickModalityTokens(usage.prompt_tokens_details, 'IMAGE'),
        prompt_video_tokens: pickModalityTokens(usage.prompt_tokens_details, 'VIDEO'),
        prompt_audio_tokens: pickModalityTokens(usage.prompt_tokens_details, 'AUDIO'),
        output_text_tokens: pickModalityTokens(usage.output_tokens_details, 'TEXT'),
    };
}
