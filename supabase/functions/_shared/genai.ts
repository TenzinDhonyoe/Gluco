// supabase/functions/_shared/genai.ts
// Shared Google Gen AI SDK helper for all Gemini functions

import { GoogleGenAI } from 'npm:@google/genai@1.38.0';

const DEFAULT_MODEL = 'gemini-2.5-flash';

let aiClient: GoogleGenAI | null = null;

/**
 * Get or create the Google Gen AI client
 */
function getClient(): GoogleGenAI {
    if (!aiClient) {
        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is not set');
        }
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
}

/**
 * Options for calling the Gen AI API
 */
export interface GenAIOptions {
    temperature?: number;
    maxOutputTokens?: number;
    jsonOutput?: boolean;
    model?: string;
}

/**
 * Call Google Gen AI with a text-only prompt
 * Returns the text response or null on error
 */
export async function callGenAI(
    prompt: string,
    options?: GenAIOptions
): Promise<string | null> {
    try {
        const ai = getClient();
        const model = options?.model || Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

        const config: Record<string, unknown> = {};

        if (options?.temperature !== undefined) {
            config.temperature = options.temperature;
        }
        if (options?.maxOutputTokens !== undefined) {
            config.maxOutputTokens = options.maxOutputTokens;
        }
        if (options?.jsonOutput) {
            config.responseMimeType = 'application/json';
        }

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: Object.keys(config).length > 0 ? config : undefined,
        });

        const text = response.text;
        return text || null;
    } catch (error) {
        console.error('Gen AI call failed:', error);
        return null;
    }
}

/**
 * Call Google Gen AI with image input (for meal photo analysis)
 * Returns the text response or null on error
 */
export async function callGenAIWithImage(
    prompt: string,
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    options?: GenAIOptions
): Promise<string | null> {
    try {
        const ai = getClient();
        const model = options?.model || Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

        const config: Record<string, unknown> = {};

        if (options?.temperature !== undefined) {
            config.temperature = options.temperature;
        }
        if (options?.maxOutputTokens !== undefined) {
            config.maxOutputTokens = options.maxOutputTokens;
        }
        if (options?.jsonOutput) {
            config.responseMimeType = 'application/json';
        }

        const response = await ai.models.generateContent({
            model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType,
                                data: imageBase64,
                            },
                        },
                    ],
                },
            ],
            config: Object.keys(config).length > 0 ? config : undefined,
        });

        const text = response.text;
        return text || null;
    } catch (error) {
        console.error('Gen AI image call failed:', error);
        return null;
    }
}

/**
 * Call Google Gen AI with multi-turn conversation history.
 * Uses systemInstruction to keep the system prompt out of the contents array.
 * Returns the text response or null on error.
 */
export interface ChatTurn {
    role: 'user' | 'model';
    content: string;
}

export async function callGenAIChat(
    systemInstruction: string,
    conversationHistory: ChatTurn[],
    options?: GenAIOptions
): Promise<string | null> {
    try {
        const ai = getClient();
        const model = options?.model || Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

        const config: Record<string, unknown> = {
            systemInstruction,
        };

        if (options?.temperature !== undefined) {
            config.temperature = options.temperature;
        }
        if (options?.maxOutputTokens !== undefined) {
            config.maxOutputTokens = options.maxOutputTokens;
        }

        const contents = conversationHistory.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.content }],
        }));

        const response = await ai.models.generateContent({
            model,
            contents,
            config,
        });

        return response.text || null;
    } catch (error) {
        console.error('Gen AI chat call failed:', error);
        return null;
    }
}

// Re-export for backwards compatibility during migration
export { callGenAI as callVertexAI };
