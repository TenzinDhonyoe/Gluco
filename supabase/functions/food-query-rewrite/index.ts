import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Food Query Rewrite Edge Function
 * Uses Gemini to correct typos and suggest alternative food search queries
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RewriteRequest {
    query: string;
}

interface RewriteResponse {
    corrected_query: string;
    alternative_queries: string[];
    synonyms: string[];
}

const GEMINI_PROMPT = `You are a food search query correction assistant. Given a user's food search query, analyze it for typos, misspellings, and common food aliases.

Return a JSON object with:
1. "corrected_query": The corrected version of the query (fix typos, spelling)
2. "alternative_queries": Up to 5 alternative search terms that mean the same thing
3. "synonyms": Up to 5 short synonyms or aliases for the food item

Rules:
- Focus on food-related corrections only
- Keep corrections simple and direct
- Include common regional variations (e.g., "chips" vs "fries", "aubergine" vs "eggplant")
- Include brand-generic equivalents if applicable
- If the query is already correct, return it unchanged
- Keep alternative queries concise (2-4 words max each)

Examples:
Query: "chikcen breast"
{
  "corrected_query": "chicken breast",
  "alternative_queries": ["boneless chicken", "chicken fillet", "poultry breast"],
  "synonyms": ["chicken", "poultry"]
}

Query: "greek yougurt"
{
  "corrected_query": "greek yogurt",
  "alternative_queries": ["strained yogurt", "greek style yogurt", "plain yogurt"],
  "synonyms": ["yoghurt", "curd"]
}

Query: "oat meal"
{
  "corrected_query": "oatmeal",
  "alternative_queries": ["porridge", "oats", "rolled oats", "instant oatmeal"],
  "synonyms": ["oats", "porridge"]
}

Now process this query:`;

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { query } = await req.json() as RewriteRequest;

        if (!query || query.trim().length < 2) {
            return new Response(
                JSON.stringify({ error: 'Query too short' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY not configured');
            // Return original query as fallback
            return new Response(
                JSON.stringify({
                    corrected_query: query.trim(),
                    alternative_queries: [],
                    synonyms: [],
                } as RewriteResponse),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Call Gemini API
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${GEMINI_PROMPT}\nQuery: "${query.trim()}"`
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        topP: 0.8,
                        topK: 10,
                        maxOutputTokens: 256,
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

            // Return original query as fallback
            return new Response(
                JSON.stringify({
                    corrected_query: query.trim(),
                    alternative_queries: [],
                    synonyms: [],
                } as RewriteResponse),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const geminiData = await geminiResponse.json();

        // Extract the text response
        const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textContent) {
            console.error('No text content in Gemini response');
            return new Response(
                JSON.stringify({
                    corrected_query: query.trim(),
                    alternative_queries: [],
                    synonyms: [],
                } as RewriteResponse),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse JSON from response
        let parsed: RewriteResponse;
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
        const result: RewriteResponse = {
            corrected_query: (parsed.corrected_query || query.trim()).slice(0, 100),
            alternative_queries: (parsed.alternative_queries || [])
                .slice(0, 5)
                .map((q: string) => String(q).slice(0, 50)),
            synonyms: (parsed.synonyms || [])
                .slice(0, 5)
                .map((s: string) => String(s).slice(0, 30)),
        };

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Food query rewrite error:', error);

        // Return empty result on error (graceful degradation)
        return new Response(
            JSON.stringify({
                corrected_query: '',
                alternative_queries: [],
                synonyms: [],
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
