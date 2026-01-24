// supabase/functions/_shared/vertex.ts
// Shared Vertex AI authentication and API helper for all Gemini functions

const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_VERTEX_MODEL = 'gemini-1.5-flash-001';

interface ServiceAccountKey {
    client_email: string;
    private_key: string;
    token_uri?: string;
}

interface VertexCredentials {
    token: string;
    model: string;
    projectId: string;
    region: string;
}

function base64UrlEncode(input: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < input.length; i += chunkSize) {
        binary += String.fromCharCode(...input.subarray(i, i + chunkSize));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
    const cleaned = pem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s+/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Get Vertex AI access token using service account credentials
 */
export async function getVertexCredentials(): Promise<VertexCredentials> {
    const raw = Deno.env.get('VERTEX_AI_SERVICE_ACCOUNT_JSON');
    const projectId = Deno.env.get('VERTEX_AI_PROJECT_ID');
    const region = Deno.env.get('VERTEX_AI_REGION');
    const model = Deno.env.get('VERTEX_AI_MODEL') || DEFAULT_VERTEX_MODEL;

    if (!raw) throw new Error('VERTEX_AI_SERVICE_ACCOUNT_JSON not set');
    if (!projectId) throw new Error('VERTEX_AI_PROJECT_ID not set');
    if (!region) throw new Error('VERTEX_AI_REGION not set');

    const key = JSON.parse(raw) as ServiceAccountKey;
    const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
        iss: key.client_email,
        sub: key.client_email,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
        scope: VERTEX_SCOPE,
    };

    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const claimsBytes = new TextEncoder().encode(JSON.stringify(claims));
    const headerEncoded = base64UrlEncode(headerBytes);
    const claimsEncoded = base64UrlEncode(claimsBytes);
    const toSign = `${headerEncoded}.${claimsEncoded}`;

    const keyData = pemToArrayBuffer(key.private_key);
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(toSign)
    );
    const signatureEncoded = base64UrlEncode(new Uint8Array(signature));
    const jwt = `${toSign}.${signatureEncoded}`;

    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
    });

    const res = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to get access token: ${text}`);
    }

    const data = await res.json();
    if (!data?.access_token) {
        throw new Error('Access token missing from response');
    }

    return { token: data.access_token as string, model, projectId, region };
}

/**
 * Get Vertex AI endpoint URL
 */
export function getVertexEndpoint(credentials: VertexCredentials): string {
    return `https://${credentials.region}-aiplatform.googleapis.com/v1/projects/${credentials.projectId}/locations/${credentials.region}/publishers/google/models/${credentials.model}:generateContent`;
}

/**
 * Call Vertex AI Gemini with a text-only prompt (no images)
 */
export async function callVertexAI(
    prompt: string,
    options?: {
        temperature?: number;
        maxOutputTokens?: number;
        jsonOutput?: boolean;
    }
): Promise<string | null> {
    try {
        const credentials = await getVertexCredentials();
        const endpoint = getVertexEndpoint(credentials);

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
            generationConfig: {
                temperature: options?.temperature ?? 0.5,
                maxOutputTokens: options?.maxOutputTokens ?? 1024,
                ...(options?.jsonOutput ? { responseMimeType: 'application/json' } : {}),
            },
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${credentials.token}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Vertex AI request failed:', response.status, errorText.substring(0, 300));
            return null;
        }

        const data = await response.json();
        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return content || null;
    } catch (error) {
        console.error('Vertex AI call failed:', error);
        return null;
    }
}
