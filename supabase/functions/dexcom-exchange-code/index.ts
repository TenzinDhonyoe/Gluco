// Dexcom OAuth Code Exchange Edge Function
// Exchanges authorization code for access/refresh tokens

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-256-GCM encryption for refresh tokens
async function encryptToken(token: string, keyBase64: string): Promise<{ ciphertext: string; iv: string }> {
    const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(token);

    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        iv: btoa(String.fromCharCode(...iv)),
    };
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Verify authorization
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Create Supabase client with user's JWT
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify the user's JWT
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Parse request body
        const { code, redirectUri, env } = await req.json();
        if (!code || !redirectUri || !env) {
            return new Response(JSON.stringify({ error: 'Missing required fields: code, redirectUri, env' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Determine base URL
        let baseUrl: string;
        let prodBase = Deno.env.get('DEXCOM_PROD_BASE_URL') || 'https://api.dexcom.com';

        if (env === 'sandbox') {
            baseUrl = 'https://sandbox-api.dexcom.com';
        } else {
            baseUrl = prodBase;
        }

        // Exchange code for tokens
        const clientId = Deno.env.get('DEXCOM_CLIENT_ID')!;
        const clientSecret = Deno.env.get('DEXCOM_CLIENT_SECRET')!;

        const tokenResponse = await fetch(`${baseUrl}/v2/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Dexcom token exchange failed:', errorText);
            return new Response(JSON.stringify({ error: 'Token exchange failed', details: errorText }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const tokens = await tokenResponse.json();
        const { access_token, refresh_token, expires_in } = tokens;

        // Encrypt refresh token
        const encKey = Deno.env.get('DEXCOM_TOKEN_ENC_KEY')!;
        const { ciphertext, iv } = await encryptToken(refresh_token, encKey);

        // Calculate expiry
        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        // Upsert connection
        const { error: dbError } = await supabase
            .from('dexcom_connections')
            .upsert({
                user_id: user.id,
                dexcom_env: env,
                dexcom_prod_base: env === 'prod' ? prodBase : 'https://sandbox-api.dexcom.com',
                access_token,
                access_expires_at: expiresAt,
                refresh_token_ciphertext: ciphertext,
                refresh_token_iv: iv,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        if (dbError) {
            console.error('Database error:', dbError);
            return new Response(JSON.stringify({ error: 'Failed to store connection' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
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
