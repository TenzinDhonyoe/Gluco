// Dexcom Helper Functions
// Client-side utilities for interacting with Dexcom Edge Functions

import { supabase } from './supabase';

// Types
export interface DexcomStatus {
    connected: boolean;
    env?: 'sandbox' | 'prod';
    prodBase?: string;
    accessExpiresAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface SyncResult {
    ok: boolean;
    inserted: number;
    skipped: number;
    total: number;
}

// Dexcom OAuth URLs
const DEXCOM_SANDBOX_BASE = 'https://sandbox-api.dexcom.com';
const DEXCOM_PROD_BASE = 'https://api.dexcom.eu'; // Change to api.dexcom.com for US

// Client ID (safe to embed in app, client_secret stays server-side only)
export const DEXCOM_CLIENT_ID = 'EmWih2NBXm1GE8goSy5LHhyYZLsqoL2y';

/**
 * Build the Dexcom OAuth authorization URL
 */
export function buildDexcomAuthUrl(
    redirectUri: string,
    env: 'sandbox' | 'prod' = 'prod',
    state?: string
): string {
    const baseUrl = env === 'sandbox' ? DEXCOM_SANDBOX_BASE : DEXCOM_PROD_BASE;

    const params = new URLSearchParams({
        client_id: DEXCOM_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'offline_access',
        state: state || Math.random().toString(36).substring(7),
    });

    return `${baseUrl}/v2/oauth2/login?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens (via Edge Function)
 */
export async function exchangeDexcomCode(
    code: string,
    redirectUri: string,
    env: 'sandbox' | 'prod' = 'prod'
): Promise<{ ok: boolean; error?: string }> {
    try {
        const { data, error } = await supabase.functions.invoke('dexcom-exchange-code', {
            body: { code, redirectUri, env },
        });

        if (error) {
            console.error('Exchange code error:', error);
            return { ok: false, error: error.message };
        }

        return data;
    } catch (err) {
        console.error('Exchange code exception:', err);
        return { ok: false, error: 'Failed to connect to Dexcom' };
    }
}

/**
 * Get Dexcom connection status
 */
export async function getDexcomStatus(): Promise<DexcomStatus> {
    try {
        const { data, error } = await supabase.functions.invoke('dexcom-status');

        if (error) {
            console.error('Get status error:', error);
            return { connected: false };
        }

        return data as DexcomStatus;
    } catch (err) {
        console.error('Get status exception:', err);
        return { connected: false };
    }
}

/**
 * Sync Dexcom EGVs (glucose readings)
 */
export async function syncDexcom(hours: number = 24): Promise<SyncResult> {
    try {
        const { data, error } = await supabase.functions.invoke('dexcom-sync-egvs', {
            body: { hours },
        });

        if (error) {
            console.error('Sync error:', error);
            return { ok: false, inserted: 0, skipped: 0, total: 0 };
        }

        return data as SyncResult;
    } catch (err) {
        console.error('Sync exception:', err);
        return { ok: false, inserted: 0, skipped: 0, total: 0 };
    }
}

/**
 * Disconnect Dexcom account
 */
export async function disconnectDexcom(deleteLogs: boolean = false): Promise<{ ok: boolean; error?: string }> {
    try {
        const { data, error } = await supabase.functions.invoke('dexcom-disconnect', {
            body: { deleteLogs },
        });

        if (error) {
            console.error('Disconnect error:', error);
            return { ok: false, error: error.message };
        }

        return data;
    } catch (err) {
        console.error('Disconnect exception:', err);
        return { ok: false, error: 'Failed to disconnect from Dexcom' };
    }
}

/**
 * Refresh tokens (called automatically by sync if needed)
 */
export async function refreshDexcomToken(): Promise<{ ok: boolean; error?: string }> {
    try {
        const { data, error } = await supabase.functions.invoke('dexcom-refresh-token');

        if (error) {
            console.error('Refresh token error:', error);
            return { ok: false, error: error.message };
        }

        return data;
    } catch (err) {
        console.error('Refresh token exception:', err);
        return { ok: false, error: 'Failed to refresh token' };
    }
}
