import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAiEnabled } from '../_shared/ai.ts';
import { requireUser } from '../_shared/auth.ts';
import { callGenAI } from '../_shared/genai.ts';

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

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const aiBlocked = await requireAiEnabled(supabase, user.id, corsHeaders);
        if (aiBlocked) return aiBlocked;

        // Call Vertex AI (temperature 0.2 for better synonym variety while maintaining accuracy)
        const textContent = await callGenAI(`${GEMINI_PROMPT}\nQuery: "${query.trim()}"`, {
            temperature: 0.2,
            maxOutputTokens: 256,
            jsonOutput: true,
        });

        if (!textContent) {
            console.error('Vertex AI returned empty response');
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
