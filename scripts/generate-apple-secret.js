#!/usr/bin/env node
/**
 * Apple Sign-In Client Secret Generator for Supabase
 * 
 * This script generates a JWT client secret required for Apple Sign-In with Supabase.
 * The secret is valid for up to 6 months (180 days).
 * 
 * Usage:
 *   node scripts/generate-apple-secret.js
 * 
 * Required: Set these values before running
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================

// Your Team ID from Apple Developer Portal (10 characters)
const TEAM_ID = 'BKC8ZS85TM';

// Your Services ID (Client ID) - the identifier you created in Apple Developer Portal
// Example: com.glucosolutions.gluco.signin
const CLIENT_ID = 'ca.gluco.solutions.gluco.auth';

// Your Key ID from the .p8 file you downloaded (10 characters)
const KEY_ID = 'C936QVQAZZ';

// Path to your .p8 private key file
const PRIVATE_KEY_PATH = path.join(__dirname, '../AuthKey_C936QVQAZZ.p8');

// Secret validity in seconds (max 6 months = 15778800 seconds)
// Using 180 days = 15552000 seconds
const EXPIRATION_SECONDS = 15552000;

// ============================================
// JWT GENERATION
// ============================================

function base64UrlEncode(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateAppleClientSecret() {
    // Validate configuration
    if (TEAM_ID === 'YOUR_TEAM_ID' || CLIENT_ID === 'YOUR_CLIENT_ID' || KEY_ID === 'YOUR_KEY_ID') {
        console.error('\n❌ ERROR: Please update the configuration values in this script!\n');
        console.log('Required values:');
        console.log('  - TEAM_ID: Your 10-character Apple Team ID');
        console.log('  - CLIENT_ID: Your Services ID (e.g., com.glucosolutions.gluco.signin)');
        console.log('  - KEY_ID: The 10-character Key ID from your .p8 file\n');
        process.exit(1);
    }

    // Read the private key
    let privateKey;
    try {
        privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    } catch (err) {
        console.error(`\n❌ ERROR: Could not read private key file at: ${PRIVATE_KEY_PATH}`);
        console.log('\nMake sure to place your AuthKey_XXXXXXXX.p8 file in the project root as "AuthKey.p8"\n');
        process.exit(1);
    }

    const now = Math.floor(Date.now() / 1000);
    const expiration = now + EXPIRATION_SECONDS;

    // JWT Header
    const header = {
        alg: 'ES256',
        kid: KEY_ID,
        typ: 'JWT'
    };

    // JWT Payload
    const payload = {
        iss: TEAM_ID,
        iat: now,
        exp: expiration,
        aud: 'https://appleid.apple.com',
        sub: CLIENT_ID
    };

    // Encode header and payload
    const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
    const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
    const signingInput = `${headerB64}.${payloadB64}`;

    // Sign with ES256 (ECDSA with P-256 and SHA-256)
    const sign = crypto.createSign('SHA256');
    sign.update(signingInput);
    sign.end();

    const signature = sign.sign({
        key: privateKey,
        dsaEncoding: 'ieee-p1363'  // Required for ES256 format
    });

    const signatureB64 = base64UrlEncode(signature);
    const jwt = `${signingInput}.${signatureB64}`;

    // Output
    console.log('\n✅ Apple Client Secret Generated Successfully!\n');
    console.log('='.repeat(60));
    console.log('\n📋 CLIENT SECRET (copy this entire value):\n');
    console.log(jwt);
    console.log('\n' + '='.repeat(60));

    const expirationDate = new Date(expiration * 1000);
    console.log(`\n⏰ Expires: ${expirationDate.toISOString()}`);
    console.log(`   (${Math.floor(EXPIRATION_SECONDS / 86400)} days from now)\n`);

    console.log('📝 Next Steps:');
    console.log('   1. Go to Supabase Dashboard → Authentication → Providers');
    console.log('   2. Enable "Apple" provider');
    console.log('   3. Enter your Client ID (Services ID): ' + CLIENT_ID);
    console.log('   4. Paste the client secret above');
    console.log('   5. Save and test!\n');

    return jwt;
}

// Run the generator
generateAppleClientSecret();
