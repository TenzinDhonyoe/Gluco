import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Label Parse Edge Function
 * Uses Gemini Vision to extract nutrition information from food label images
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LabelParseRequest {
    image_base64: string;
    locale?: string;
    units?: 'metric' | 'us';
}

interface ParsedLabel {
    display_name: string;
    brand?: string;
    serving: {
        amount?: number;
        unit?: string;
        description?: string;
    };
    per_serving: {
        calories?: number;
        carbs_g?: number;
        fibre_g?: number;
        sugars_g?: number;
        protein_g?: number;
        fat_g?: number;
        sat_fat_g?: number;
        sodium_mg?: number;
    };
    confidence: number;
    warnings: string[];
    raw_extracted: Record<string, string>;
}

const GEMINI_PROMPT = `You are a nutrition label parser. Analyze this food label image and extract the nutrition information.

IMPORTANT RULES:
1. Extract values PER SERVING, not per 100g (unless the serving IS 100g)
2. If values are shown "per 100g" AND "per serving", prefer per serving
3. Look for serving size description (e.g., "1 cup (240ml)", "2 cookies (30g)")
4. Handle bilingual labels - extract the English values when both languages present
5. Return null for any value you cannot find or are uncertain about
6. Include warnings for any ambiguity

Return a JSON object with this EXACT structure:
{
  "display_name": "Product name from the label",
  "brand": "Brand name if visible, or null",
  "serving": {
    "amount": number or null (e.g., 30 for "30g"),
    "unit": "g" or "ml" or "oz" etc,
    "description": "human readable like '1 cup' or '2 cookies'"
  },
  "per_serving": {
    "calories": number or null,
    "carbs_g": number or null (total carbohydrates in grams),
    "fibre_g": number or null (dietary fiber in grams),
    "sugars_g": number or null,
    "protein_g": number or null,
    "fat_g": number or null (total fat),
    "sat_fat_g": number or null (saturated fat),
    "sodium_mg": number or null (in milligrams)
  },
  "confidence": 0-100 (your confidence in the accuracy),
  "warnings": ["array of any warnings or ambiguities"],
  "raw_extracted": {"key": "value" pairs of everything you could read}
}

ONLY return valid JSON. No markdown, no explanations.`;

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { image_base64, locale = 'en', units = 'metric' } = await req.json() as LabelParseRequest;

        if (!image_base64) {
            return new Response(
                JSON.stringify({ error: 'Missing image_base64' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY not configured');
            return new Response(
                JSON.stringify({ error: 'OCR service not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Clean base64 if it has data URI prefix
        const cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');

        // Call Gemini Vision API
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: GEMINI_PROMPT },
                            {
                                inline_data: {
                                    mime_type: 'image/jpeg',
                                    data: cleanBase64,
                                },
                            },
                        ],
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        topP: 0.8,
                        topK: 10,
                        maxOutputTokens: 1024,
                        responseMimeType: 'application/json',
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                    ],
                }),
            }
        );

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error('Gemini API error:', geminiResponse.status, errorText);

            return new Response(
                JSON.stringify({
                    error: 'Failed to analyze label',
                    details: geminiResponse.status === 429 ? 'Rate limited, please try again' : 'Vision service unavailable',
                }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const geminiData = await geminiResponse.json();
        const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textContent) {
            console.error('No text content in Gemini response');
            return new Response(
                JSON.stringify({
                    error: 'Could not read the label',
                    details: 'Try better lighting or flatten the package',
                }),
                { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse JSON from response
        let parsed: ParsedLabel;
        try {
            parsed = JSON.parse(textContent);
        } catch {
            // Try to extract JSON from text
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Could not parse JSON from response');
            }
        }

        // Validate and sanitize response
        const result: ParsedLabel = {
            display_name: parsed.display_name || 'Unknown Product',
            brand: parsed.brand || undefined,
            serving: {
                amount: parsed.serving?.amount ?? null,
                unit: parsed.serving?.unit || 'g',
                description: parsed.serving?.description || undefined,
            },
            per_serving: {
                calories: parsed.per_serving?.calories ?? null,
                carbs_g: parsed.per_serving?.carbs_g ?? null,
                fibre_g: parsed.per_serving?.fibre_g ?? null,
                sugars_g: parsed.per_serving?.sugars_g ?? null,
                protein_g: parsed.per_serving?.protein_g ?? null,
                fat_g: parsed.per_serving?.fat_g ?? null,
                sat_fat_g: parsed.per_serving?.sat_fat_g ?? null,
                sodium_mg: parsed.per_serving?.sodium_mg ?? null,
            },
            confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
            raw_extracted: parsed.raw_extracted || {},
        };

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Label parse error:', error);

        return new Response(
            JSON.stringify({
                error: 'Failed to parse label',
                details: 'Could not extract nutrition information',
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
