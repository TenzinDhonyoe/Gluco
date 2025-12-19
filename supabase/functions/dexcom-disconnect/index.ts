// Dexcom Disconnect Edge Function
// Removes Dexcom connection for a user

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify user
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Parse request body for optional flags
        const body = await req.json().catch(() => ({}));
        const deleteLogs = body.deleteLogs || false;

        // Delete connection
        const { error: deleteError } = await supabase
            .from('dexcom_connections')
            .delete()
            .eq('user_id', user.id);

        if (deleteError) {
            console.error('Delete error:', deleteError);
            return new Response(JSON.stringify({ error: 'Failed to disconnect' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Optionally delete Dexcom-imported logs
        if (deleteLogs) {
            const { error: logsError } = await supabase
                .from('glucose_logs')
                .delete()
                .eq('user_id', user.id)
                .eq('source', 'dexcom');

            if (logsError) {
                console.error('Failed to delete logs:', logsError);
                // Don't fail the disconnect, just log the error
            }
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
