// supabase/functions/chat-wellness/index.ts
// Edge Function for personalized AI wellness chat conversations.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isAiEnabled } from '../_shared/ai.ts';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { containsBannedTerms } from '../_shared/safety.ts';
import { callGenAIChat, type ChatTurn } from '../_shared/genai.ts';
import { buildUserContext, serializeContextForPrompt, type ToneMode } from '../_shared/user-context.ts';
import { buildTodayContext, serializeTodayContextForPrompt } from '../_shared/today-context.ts';
import { attachBlocks } from '../_shared/chat-blocks.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// ============================================
// Tone Rules (adapted for conversational chat)
// ============================================

const CHAT_TONE_RULES: Record<ToneMode, string> = {
    warm_welcome: `You are warm and supportive. The user is new to Gluco.
- Use encouraging, educational language
- Explain concepts simply, assume no health literacy
- Say "you're building a great foundation" — never "you should be doing more"`,

    pattern_reveal: `You are curious and insightful. Patterns are starting to emerge.
- Lead with "Something interesting in your data..." or similar
- Reference specific numbers from their data
- Be honest about timelines — change takes weeks, not days`,

    confident_coach: `You are direct and data-rich. The user is established.
- Compare metrics to the user's own baseline, never to averages
- Use confident language: "Your data shows..." not "It seems like..."
- Reference week-over-week changes`,

    trusted_partner: `You are brief and peer-level. The user is experienced.
- Be concise — they know the basics
- Only suggest genuinely new things
- Use "you might try..." rather than instructional language`,

    gentle_return: `You are warm and zero-guilt. The user is returning after a break.
- Say "Welcome back" — never "We missed you" or "You've been away"
- Never mention the gap duration or what they "missed"`,
};

// ============================================
// Safety Rules
// ============================================

const SAFETY_RULES = `## Safety Rules (STRICT — never violate these)

You are a wellness companion, NOT a medical device.

BANNED TERMS — never use these words or close synonyms:
prediabetes, diabetes, insulin resistance, diagnose, detect, treat, prevent, medical device, clinical, therapeutic, prescription, reverse, hypoglycemia, hyperglycemia, blood sugar spike, glucose spike, spike, risk

SAFE VERBS to use instead: support, maintain, balance, stabilize, manage, improve, optimize, explore

NEVER DO:
- Diagnose or suggest diagnoses
- Recommend medication changes
- Use guilt, shame, or fear language
- Compare the user to "normal" or "average" populations
- Use the word "should" — use "could", "might", or "consider" instead
- Suggest calorie counting or restrictive eating
- Make claims about curing or reversing conditions

ALWAYS DO:
- Tie praise to specific observable actions the user took
- Frame suggestions as experiments, not prescriptions
- If asked about medical conditions, say: "That's a great question for your healthcare provider. I can help you with your wellness patterns and habits though!"
- If asked about medication, say: "Medication questions are best for your doctor. Want me to look at your recent patterns instead?"`;

// ============================================
// System Prompt Builder
// ============================================

function buildChatSystemPrompt(
    todayBlock: string,
    contextBlock: string,
    toneMode: ToneMode
): string {
    return `# Gluco Wellness Chat Companion

You are a friendly, knowledgeable wellness companion inside the Gluco app. You help users understand their health patterns and build better habits through conversation.

## CRITICAL — Data Access
You HAVE full access to the user's wellness data. It is provided below in the "Today's Specific Data" and "7-Day Patterns" sections. NEVER say you don't have access to their data, NEVER say you can't see their information, NEVER apologize for not having data. The data sections below contain everything the user has logged. If a section shows no data, it means the user hasn't logged anything in that category yet — acknowledge this warmly and encourage them to log, but NEVER claim you lack access.

## Your Identity
- You are "Gluco" — a warm, supportive wellness companion
- You are NOT a doctor, dietitian, or medical professional
- You help users explore their own data and discover patterns
- You live inside the Gluco app and can see everything the user has logged

## Conversation Style
${CHAT_TONE_RULES[toneMode]}

- Be conversational and warm, like a knowledgeable friend
- Match your response length to the question complexity:
  - Simple questions (how's my glucose?): 2-3 sentences
  - Summary requests (how am I doing this week?): 4-6 sentences
  - Detailed questions (analyze my meals today): as many sentences as needed, up to 8
- Every sentence must reference the user's actual data — no generic filler or platitudes
- If the user has no data yet, suggest specific things they could log (a meal, a walk, their glucose) and explain what insights you could provide once they do
- Use the user's first name occasionally (but not every message)
- Ask follow-up questions to keep the conversation going
- Reference specific data points when relevant (e.g., "Your Greek Yogurt Bowl at breakfast had 28g protein — solid choice")
- Frame everything as observations and suggestions, never prescriptions

${SAFETY_RULES}

## Response Format
- Respond in plain text only — no markdown, no bullet points, no headers, no asterisks
- Use natural, conversational language
- If suggesting an action, make it ONE specific, small action
- End with a question or forward-looking statement when appropriate

## Today's Specific Data (USE THIS FIRST)
When the user asks about today, their recent meals, current glucose, or what to eat next,
reference this data with specific names, food items, and numbers.

${todayBlock}

## 7-Day Patterns (for trend and summary questions)
${contextBlock}`;
}

// ============================================
// Fallback Messages
// ============================================

const AI_DISABLED_REPLY = "Hi there! AI chat is currently turned off in your settings. You can enable AI features in Settings > Customization to chat with me about your wellness patterns.";

const ERROR_REPLY = "I'm having trouble thinking right now. Could you try asking again in a moment?";

const SAFETY_FALLBACK_REPLY = "I want to make sure I give you helpful and safe information. Could you rephrase your question about your wellness patterns?";

// ============================================
// Handler
// ============================================

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { user_id: requestedUserId, message, conversation_history, local_hour } = body;

        if (!requestedUserId || !message) {
            return jsonResponse({ error: 'Missing user_id or message' }, 400);
        }

        // Auth
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user!.id, corsHeaders);
        if (mismatch) return mismatch;

        const userId = user!.id;

        // AI consent check
        const aiEnabled = await isAiEnabled(supabase, userId);
        if (!aiEnabled) {
            return jsonResponse({ reply: AI_DISABLED_REPLY, source: 'fallback' });
        }

        // Build user context and today context in parallel
        const hour = typeof local_hour === 'number' ? local_hour : new Date().getHours();
        const [ctx, todayCtx] = await Promise.all([
            buildUserContext(supabase, userId, hour),
            buildTodayContext(supabase, userId),
        ]);

        const contextBlock = serializeContextForPrompt(ctx);
        const todayBlock = serializeTodayContextForPrompt(todayCtx);

        // Build system prompt
        const systemPrompt = buildChatSystemPrompt(todayBlock, contextBlock, ctx.tone_mode);

        // Prepare conversation history (cap at 20 turns)
        const history: ChatTurn[] = (conversation_history || [])
            .slice(-20)
            .map((msg: { role: string; content: string }) => ({
                role: msg.role === 'user' ? 'user' as const : 'model' as const,
                content: msg.content,
            }));

        // Call Gemini
        const reply = await callGenAIChat(systemPrompt, history, {
            temperature: 0.5,
            maxOutputTokens: 1500,
        });

        if (!reply) {
            return jsonResponse({ reply: ERROR_REPLY, source: 'fallback' });
        }

        // Safety check
        if (containsBannedTerms(reply)) {
            return jsonResponse({ reply: SAFETY_FALLBACK_REPLY, source: 'fallback' });
        }

        // Attach rich data blocks (deterministic, post-reply pass)
        const blocks = attachBlocks(reply, todayCtx, ctx, ctx.daily_features);
        const response: Record<string, unknown> = { reply, source: 'ai' };
        if (blocks.length > 0) {
            response.blocks = blocks;
        }

        return jsonResponse(response);
    } catch (error) {
        console.error('chat-wellness error:', error);
        return jsonResponse({ reply: ERROR_REPLY, source: 'fallback' });
    }
});
