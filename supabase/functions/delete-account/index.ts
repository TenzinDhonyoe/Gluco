// supabase/functions/delete-account/index.ts
// Edge Function to delete all user data and auth account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireUser } from '../_shared/auth.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function deleteMealPhotos(supabase: ReturnType<typeof createClient>, userId: string): Promise<void> {
    const bucket = supabase.storage.from('meal-photos');
    const paths: string[] = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
        const { data, error } = await bucket.list(userId, { limit, offset });
        if (error) {
            console.error('Meal photo list error:', error);
            break;
        }
        if (!data || data.length === 0) break;

        data.forEach(item => {
            if (item.name) {
                paths.push(`${userId}/${item.name}`);
            }
        });

        if (data.length < limit) break;
        offset += limit;
    }

    if (paths.length > 0) {
        const { error } = await bucket.remove(paths);
        if (error) {
            console.error('Meal photo delete error:', error);
        }
    }
}

async function deleteRowsByUserId(
    supabase: ReturnType<typeof createClient>,
    table: string,
    userId: string
): Promise<void> {
    const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.error(`Delete failed for ${table}:`, error);
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { confirm } = await req.json();
        if (!confirm) {
            return new Response(
                JSON.stringify({ error: 'Confirmation required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
        if (errorResponse) return errorResponse;

        const userId = user.id;

        await deleteMealPhotos(supabase, userId);

        // Delete child tables first
        const tables = [
            'meal_photo_analysis',
            'meal_checkins',
            'meal_items',
            'post_meal_reviews',
            'premeal_checks',
            'meals',
            'glucose_logs',
            'activity_logs',
            'daily_context',
            'user_calibration',
            'favorite_foods',
            'recent_foods',
            'user_experiment_events',
            'user_experiment_analysis',
            'user_experiments',
            'personalized_tip_seen',
            'dexcom_tokens',
            'dexcom_connections',
        ];

        for (const table of tables) {
            await deleteRowsByUserId(supabase, table, userId);
        }

        // Delete profile last
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);
        if (profileError) {
            console.error('Delete profile error:', profileError);
        }

        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) {
            return new Response(
                JSON.stringify({ error: 'Failed to delete auth user' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Delete account error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
