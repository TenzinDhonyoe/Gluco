// supabase/functions/experiments-suggest/index.ts
// Edge Function for suggesting personalized experiments based on user's glucose patterns

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireMatchingUserId, requireUser } from '../_shared/auth.ts';
import { isAiEnabled } from '../_shared/ai.ts';
import { sanitizeText } from '../_shared/safety.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types
interface ExperimentTemplate {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    category: string;
    protocol: any;
    icon: string | null;
}

interface ExperimentVariant {
    id: string;
    template_id: string;
    key: string;
    name: string;
    description: string | null;
    parameters: any;
}

interface SuggestedExperiment {
    template: ExperimentTemplate;
    variants: ExperimentVariant[];
    score: number;
    reasons: string[];
    recommended_parameters: Record<string, any>;
    predicted_impact: 'high' | 'moderate' | 'low';
}

interface UserPatterns {
    // Glucose patterns
    avgGlucose: number | null;
    spikeCount: number;
    spikeContexts: Record<string, number>; // e.g., { breakfast: 5, lunch: 3 }
    timeOfDaySpikes: Record<string, number>; // e.g., { morning: 4, evening: 6 }
    
    // Meal patterns
    totalMeals: number;
    mealTypes: Record<string, number>; // e.g., { breakfast: 10, lunch: 8 }
    avgFibrePerDay: number | null;
    commonFoods: string[];
    riceOccurrences: number;
    oatmealOccurrences: number;
    eggOccurrences: number;
    
    // Activity patterns
    totalActivityMinutes: number;
    postMealWalks: number;
    activeDays: number;
    
    // Timing patterns
    avgDinnerHour: number | null;
    lateNightMeals: number;
    breakfastSkipDays: number;
}

// Analyze user's glucose, meals, and activities to find patterns
async function analyzeUserPatterns(supabase: any, userId: string): Promise<UserPatterns> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString();

    // Fetch glucose logs
    const { data: glucoseLogs } = await supabase
        .from('glucose_logs')
        .select('glucose_level, logged_at, context')
        .eq('user_id', userId)
        .gte('logged_at', startDate)
        .order('logged_at', { ascending: true });

    // Fetch meals with items
    const { data: meals } = await supabase
        .from('meals')
        .select('id, name, meal_type, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startDate);

    // Fetch meal items for food analysis
    let mealItems: any[] = [];
    if (meals && meals.length > 0) {
        const mealIds = meals.map((m: any) => m.id);
        const { data } = await supabase
            .from('meal_items')
            .select('meal_id, display_name, nutrients, quantity')
            .in('meal_id', mealIds);
        mealItems = data || [];
    }

    // Fetch activity logs
    const { data: activityLogs } = await supabase
        .from('activity_logs')
        .select('activity_name, duration_minutes, intensity, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startDate);

    // Fetch post-meal reviews for spike data
    const { data: reviews } = await supabase
        .from('post_meal_reviews')
        .select('peak_delta, meal_time, meal_name, status_tag')
        .eq('user_id', userId)
        .eq('status', 'opened')
        .gte('meal_time', startDate);

    // Calculate patterns
    const patterns: UserPatterns = {
        avgGlucose: null,
        spikeCount: 0,
        spikeContexts: {},
        timeOfDaySpikes: { morning: 0, afternoon: 0, evening: 0, night: 0 },
        totalMeals: meals?.length || 0,
        mealTypes: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
        avgFibrePerDay: null,
        commonFoods: [],
        riceOccurrences: 0,
        oatmealOccurrences: 0,
        eggOccurrences: 0,
        totalActivityMinutes: 0,
        postMealWalks: 0,
        activeDays: 0,
        avgDinnerHour: null,
        lateNightMeals: 0,
        breakfastSkipDays: 0,
    };

    // Glucose analysis
    if (glucoseLogs && glucoseLogs.length > 0) {
        const avgGlucose = glucoseLogs.reduce((sum: number, l: any) => sum + l.glucose_level, 0) / glucoseLogs.length;
        patterns.avgGlucose = Math.round(avgGlucose * 10) / 10;

        // Count spikes (above 8.5 mmol/L)
        const spikes = glucoseLogs.filter((l: any) => l.glucose_level > 8.5);
        patterns.spikeCount = spikes.length;

        // Analyze spike contexts
        spikes.forEach((spike: any) => {
            const context = spike.context || 'unknown';
            patterns.spikeContexts[context] = (patterns.spikeContexts[context] || 0) + 1;

            const hour = new Date(spike.logged_at).getHours();
            if (hour >= 5 && hour < 12) patterns.timeOfDaySpikes.morning++;
            else if (hour >= 12 && hour < 17) patterns.timeOfDaySpikes.afternoon++;
            else if (hour >= 17 && hour < 21) patterns.timeOfDaySpikes.evening++;
            else patterns.timeOfDaySpikes.night++;
        });
    }

    // Review-based spikes
    if (reviews && reviews.length > 0) {
        const spikeReviews = reviews.filter((r: any) => r.status_tag === 'spike' || (r.peak_delta && r.peak_delta > 3.5));
        patterns.spikeCount = Math.max(patterns.spikeCount, spikeReviews.length);
    }

    // Meal analysis
    if (meals && meals.length > 0) {
        meals.forEach((meal: any) => {
            const mealType = meal.meal_type || 'snack';
            patterns.mealTypes[mealType] = (patterns.mealTypes[mealType] || 0) + 1;

            // Check dinner timing
            if (mealType === 'dinner') {
                const hour = new Date(meal.logged_at).getHours();
                if (hour >= 21) patterns.lateNightMeals++;
            }
        });

        // Calculate avg dinner hour
        const dinners = meals.filter((m: any) => m.meal_type === 'dinner');
        if (dinners.length > 0) {
            const avgHour = dinners.reduce((sum: number, m: any) => sum + new Date(m.logged_at).getHours(), 0) / dinners.length;
            patterns.avgDinnerHour = Math.round(avgHour * 10) / 10;
        }
    }

    // Meal items analysis (food types)
    const foodCounts: Record<string, number> = {};
    let totalFibre = 0;

    mealItems.forEach((item: any) => {
        const name = (item.display_name || '').toLowerCase();
        foodCounts[name] = (foodCounts[name] || 0) + 1;

        // Check for specific foods
        if (name.includes('rice') || name.includes('biryani') || name.includes('pulao')) {
            patterns.riceOccurrences++;
        }
        if (name.includes('oat') || name.includes('porridge')) {
            patterns.oatmealOccurrences++;
        }
        if (name.includes('egg') || name.includes('omelet') || name.includes('omelette')) {
            patterns.eggOccurrences++;
        }

        // Fibre calculation
        const fibreG = item.nutrients?.fibre_g ?? 0;
        totalFibre += fibreG * (item.quantity ?? 1);
    });

    // Get most common foods
    patterns.commonFoods = Object.entries(foodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name]) => name);

    // Average fibre per day
    patterns.avgFibrePerDay = Math.round((totalFibre / 30) * 10) / 10;

    // Activity analysis
    if (activityLogs && activityLogs.length > 0) {
        patterns.totalActivityMinutes = activityLogs.reduce((sum: number, a: any) => sum + a.duration_minutes, 0);
        patterns.activeDays = new Set(activityLogs.map((a: any) => new Date(a.logged_at).toDateString())).size;

        // Count post-meal walks (walks within 2h after a meal)
        const walkActivities = activityLogs.filter((a: any) =>
            a.activity_name.toLowerCase().includes('walk')
        );
        
        if (meals && meals.length > 0 && walkActivities.length > 0) {
            walkActivities.forEach((walk: any) => {
                const walkTime = new Date(walk.logged_at).getTime();
                const isPostMeal = meals.some((meal: any) => {
                    const mealTime = new Date(meal.logged_at).getTime();
                    const diff = walkTime - mealTime;
                    return diff > 0 && diff < 2 * 60 * 60 * 1000; // Within 2 hours
                });
                if (isPostMeal) patterns.postMealWalks++;
            });
        }
    }

    // Count breakfast skip days
    if (meals && meals.length > 0) {
        const daysWithMeals = new Set<string>();
        const daysWithBreakfast = new Set<string>();
        
        meals.forEach((meal: any) => {
            const day = new Date(meal.logged_at).toDateString();
            daysWithMeals.add(day);
            if (meal.meal_type === 'breakfast') {
                daysWithBreakfast.add(day);
            }
        });
        
        patterns.breakfastSkipDays = daysWithMeals.size - daysWithBreakfast.size;
    }

    return patterns;
}

// Score and rank experiments based on user patterns
function scoreExperiments(
    templates: ExperimentTemplate[],
    variantsByTemplate: Record<string, ExperimentVariant[]>,
    patterns: UserPatterns
): SuggestedExperiment[] {
    const suggestions: SuggestedExperiment[] = [];

    for (const template of templates) {
        const variants = variantsByTemplate[template.id] || [];
        let score = 50; // Base score
        const reasons: string[] = [];
        let impact: 'high' | 'moderate' | 'low' = 'moderate';
        const recommended_parameters: Record<string, any> = {};

        switch (template.slug) {
            case 'oatmeal-vs-eggs':
                // Good for breakfast spikers who eat both foods
                if (patterns.mealTypes.breakfast > 5) {
                    score += 15;
                    reasons.push('You log breakfast regularly');
                }
                if (patterns.timeOfDaySpikes.morning > 2) {
                    score += 25;
                    reasons.push('Your morning readings tend to run higher');
                    impact = 'high';
                }
                if (patterns.oatmealOccurrences > 0 || patterns.eggOccurrences > 0) {
                    score += 10;
                    reasons.push('You already eat oatmeal or eggs');
                }
                if (patterns.spikeContexts['post_meal'] > 3) {
                    score += 10;
                }
                break;

            case 'rice-portion-swap':
                // Good for users who eat rice and have spikes
                if (patterns.riceOccurrences > 3) {
                    score += 30;
                    reasons.push(`You've eaten rice ${patterns.riceOccurrences} times this month`);
                    impact = 'high';
                }
                if (patterns.spikeCount > 5) {
                    score += 15;
                    reasons.push('Portion control can help smooth your response');
                }
                if (patterns.avgGlucose && patterns.avgGlucose > 7) {
                    score += 10;
                    reasons.push('Your average readings are on the higher side');
                }
                break;

            case 'post-meal-walk':
                // Good for users who don't walk much and have spikes
                if (patterns.postMealWalks < 3) {
                    score += 25;
                    reasons.push('You rarely walk after meals');
                    impact = 'high';
                }
                if (patterns.spikeCount > 3) {
                    score += 20;
                    reasons.push('Walking after meals can support steadier energy');
                }
                if (patterns.totalActivityMinutes < 60) {
                    score += 10;
                    reasons.push('A good way to add more activity');
                }
                recommended_parameters.walk_minutes = 15;
                break;

            case 'fiber-preload':
                // Good for users with low fiber intake and spikes
                if (patterns.avgFibrePerDay !== null && patterns.avgFibrePerDay < 15) {
                    score += 30;
                    reasons.push(`Your fiber intake (${patterns.avgFibrePerDay}g/day) is below recommended`);
                    impact = 'high';
                }
                if (patterns.spikeCount > 5) {
                    score += 15;
                    reasons.push('Fiber can slow digestion');
                }
                if (patterns.mealTypes.lunch > 5 || patterns.mealTypes.dinner > 5) {
                    score += 10;
                    reasons.push('Easy to try with your regular meals');
                }
                break;

            case 'meal-timing':
                // Good for late dinner eaters
                if (patterns.lateNightMeals > 5) {
                    score += 30;
                    reasons.push('You often eat dinner late');
                    impact = 'high';
                }
                if (patterns.avgDinnerHour && patterns.avgDinnerHour > 20) {
                    score += 20;
                    reasons.push(`Your average dinner time is ${Math.round(patterns.avgDinnerHour)}:00`);
                }
                if (patterns.timeOfDaySpikes.evening > 3 || patterns.timeOfDaySpikes.night > 2) {
                    score += 15;
                    reasons.push('Evening readings tend to be higher');
                }
                break;

            case 'breakfast-skip':
                // Suggest if they already sometimes skip breakfast
                if (patterns.breakfastSkipDays > 3) {
                    score += 20;
                    reasons.push('You sometimes skip breakfast already');
                }
                if (patterns.mealTypes.breakfast < patterns.mealTypes.lunch * 0.5) {
                    score += 15;
                    reasons.push('You eat breakfast less frequently');
                }
                if (patterns.timeOfDaySpikes.morning > 3) {
                    score += 10;
                    reasons.push('Morning patterns vary');
                }
                // Lower priority by default
                score -= 10;
                impact = 'moderate';
                break;
        }

        // Ensure we have at least one reason
        if (reasons.length === 0) {
            reasons.push('A good experiment to try');
        }

        suggestions.push({
            template,
            variants,
            score,
            reasons,
            recommended_parameters,
            predicted_impact: impact,
        });
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score);

    return suggestions;
}

// Generate AI-powered reasons using Gemini (optional enhancement)
async function enhanceWithGemini(
    suggestions: SuggestedExperiment[],
    patterns: UserPatterns
): Promise<SuggestedExperiment[]> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey || suggestions.length === 0) {
        return suggestions;
    }

    const topSuggestions = suggestions.slice(0, 3);

    const prompt = `You are a wellness coach helping someone choose their next experiment. Based on their patterns, enhance the reasons for these top experiment suggestions.

USER'S 30-DAY PATTERNS:
- Average glucose: ${patterns.avgGlucose ?? 'N/A'} mmol/L
- Higher-response count: ${patterns.spikeCount}
- Higher-response contexts: ${JSON.stringify(patterns.spikeContexts)}
- Morning higher-response: ${patterns.timeOfDaySpikes.morning}, Evening higher-response: ${patterns.timeOfDaySpikes.evening}
- Total meals: ${patterns.totalMeals}
- Avg fiber: ${patterns.avgFibrePerDay ?? 'N/A'} g/day
- Rice occurrences: ${patterns.riceOccurrences}
- Post-meal walks: ${patterns.postMealWalks}
- Activity minutes: ${patterns.totalActivityMinutes}
- Late dinners: ${patterns.lateNightMeals}

TOP SUGGESTIONS TO ENHANCE:
${topSuggestions.map((s, i) => `${i + 1}. ${s.template.title}: ${s.reasons.join(', ')}`).join('\n')}

For each suggestion, provide 2-3 personalized bullet points explaining WHY this experiment would help THIS user specifically. Be concise and reference their actual data.

Return ONLY valid JSON:
{
  "enhanced": [
    {"slug": "experiment-slug", "reasons": ["reason1", "reason2"]},
    ...
  ]
}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 600,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );

        if (!response.ok) {
            console.error('Gemini API error:', response.status);
            return suggestions;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) return suggestions;

        const parsed = JSON.parse(text);
        const enhancedMap = new Map<string, string[]>();
        
        (parsed.enhanced || []).forEach((e: any) => {
            const safeReasons = (e.reasons || []).filter((reason: string) => sanitizeText(reason) !== null);
            enhancedMap.set(e.slug, safeReasons);
        });

        // Merge enhanced reasons
        return suggestions.map(s => {
            const enhanced = enhancedMap.get(s.template.slug);
            if (enhanced && enhanced.length > 0) {
                return { ...s, reasons: enhanced };
            }
            return s;
        });
    } catch (error) {
        console.error('Gemini enhancement failed:', error);
        return suggestions;
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id: requestedUserId, limit = 6 } = await req.json();

        if (!requestedUserId) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const mismatch = requireMatchingUserId(requestedUserId, user.id, corsHeaders);
        if (mismatch) return mismatch;

        const userId = user.id;
        const aiEnabled = await isAiEnabled(supabase, userId);

        // Fetch active templates
        const { data: templates, error: templatesError } = await supabase
            .from('experiment_templates')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');

        if (templatesError) {
            throw new Error(`Failed to fetch templates: ${templatesError.message}`);
        }

        // Fetch variants for all templates
        const templateIds = (templates || []).map((t: any) => t.id);
        const { data: variants } = await supabase
            .from('experiment_variants')
            .select('*')
            .in('template_id', templateIds)
            .order('sort_order');

        // Group variants by template
        const variantsByTemplate: Record<string, ExperimentVariant[]> = {};
        (variants || []).forEach((v: any) => {
            if (!variantsByTemplate[v.template_id]) {
                variantsByTemplate[v.template_id] = [];
            }
            variantsByTemplate[v.template_id].push(v);
        });

        // Fetch user's existing active experiments to exclude them
        const { data: activeExperiments } = await supabase
            .from('user_experiments')
            .select('template_id')
            .eq('user_id', userId)
            .in('status', ['draft', 'active']);

        const activeTemplateIds = new Set((activeExperiments || []).map((e: any) => e.template_id));

        // Filter out templates user is already running
        const availableTemplates = (templates || []).filter(
            (t: any) => !activeTemplateIds.has(t.id)
        );

        // Analyze user patterns
        const patterns = await analyzeUserPatterns(supabase, userId);

        // Score and rank experiments
        let suggestions = scoreExperiments(availableTemplates, variantsByTemplate, patterns);

        // Enhance top suggestions with Gemini (optional)
        if (aiEnabled) {
            suggestions = await enhanceWithGemini(suggestions, patterns);
        }

        // Limit results
        const limitedSuggestions = suggestions.slice(0, limit);

        return new Response(
            JSON.stringify({
                suggestions: limitedSuggestions,
                patterns: {
                    avgGlucose: patterns.avgGlucose,
                    spikeCount: patterns.spikeCount,
                    avgFibrePerDay: patterns.avgFibrePerDay,
                    totalActivityMinutes: patterns.totalActivityMinutes,
                    postMealWalks: patterns.postMealWalks,
                },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
