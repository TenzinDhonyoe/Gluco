#!/usr/bin/env node
/**
 * Fail the build if critical EXPO_PUBLIC_* env vars are missing.
 *
 * Background: Apple rejected Gluco v1 (April 2026) because the TestFlight
 * paywall silently failed — the EAS production environment had zero vars
 * configured, so `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` was undefined in the
 * bundle, and RevenueCat's SDK was never configured.
 *
 * This script runs via the `eas-build-post-install` hook. If any required
 * var is missing, the build fails loudly before Metro bundles, instead of
 * silently shipping a broken app.
 *
 * To allow an exemption during development or for a specific profile,
 * set `SKIP_ENV_CHECK=true` in the EAS environment.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const REQUIRED = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
    'EXPO_PUBLIC_APP_SCHEME',
    // Experience variant flags: without these, the app falls back to the
    // legacy UI variant which is visually and functionally different from
    // the behavior_v1 UI the team ships by default. If you're intentionally
    // building the legacy variant, set SKIP_ENV_CHECK=true.
    'EXPO_PUBLIC_FORCE_BEHAVIOR_V1',
    'EXPO_PUBLIC_SKIP_FRAMEWORK_RESET_GATE',
];

function main() {
    if (process.env.SKIP_ENV_CHECK === 'true') {
        console.log('[check-required-env] SKIP_ENV_CHECK=true — skipping.');
        return;
    }

    const missing = REQUIRED.filter(name => !process.env[name]);

    if (missing.length === 0) {
        console.log('[check-required-env] All required env vars present.');
        return;
    }

    console.error('');
    console.error('================================================================');
    console.error('  BUILD HALTED — missing required EXPO_PUBLIC_* env vars');
    console.error('================================================================');
    console.error('');
    console.error('  Missing variables:');
    for (const name of missing) {
        console.error(`    - ${name}`);
    }
    console.error('');
    console.error('  Fix: set these in EAS for the target environment.');
    console.error('  Example:');
    console.error('    eas env:create --environment production \\');
    console.error('      --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY \\');
    console.error('      --value <key> --visibility plaintext');
    console.error('');
    console.error('  To bypass this check intentionally, set SKIP_ENV_CHECK=true.');
    console.error('================================================================');
    console.error('');
    process.exit(1);
}

main();
