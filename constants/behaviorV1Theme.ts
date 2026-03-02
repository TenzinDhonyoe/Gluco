export const behaviorV1Theme = {
    // Metabolic/Behavior Tones
    mintSoft: '#34D399',
    mintBright: '#6EE7B7',
    amberSoft: '#FFB380',
    amberBright: '#FFCB9E',
    blueSoft: '#60A5FA',
    blueBright: '#93C5FD',

    // Legacy mapping (pointing to new mint for compatibility)
    sageSoft: '#34D399',
    sageMid: '#10B981',
    sageBright: '#6EE7B7',

    // Surfaces — light mode
    surfaceStrong: 'rgba(255, 255, 255, 0.98)',
    surfaceInvite: 'rgba(255, 255, 255, 0.90)',
    surfaceRecessed: 'rgba(245, 245, 250, 0.6)',
    surfaceSubdued: 'rgba(255, 255, 255, 0.95)',
    surfaceAction: 'rgba(255, 255, 255, 0.96)',

    // Text — dark-on-light
    textPrimary: '#1C1C1E',
    textSecondary: '#8E8E93',

    // Borders — dark rgba for light backgrounds
    borderSoft: 'rgba(60, 60, 67, 0.10)',

    // CTA — keep teal
    ctaPrimary: '#2DD4BF',
    ctaPrimaryText: '#042F2E',

    // Veils — light overlays
    veilTop: 'rgba(255, 255, 255, 0.3)',
    veilMid: 'rgba(255, 255, 255, 0.5)',
    veilBottom: 'rgba(255, 255, 255, 0.7)',

    // Effects
    accentGlow: 'rgba(45, 212, 191, 0.20)',

    // Category: Activity (cyan) — tinted white surfaces
    activityAccent: '#22D3EE',
    activitySurface: 'rgba(34, 211, 238, 0.06)',
    activityBorder: 'rgba(34, 211, 238, 0.18)',

    // Category: Sleep (indigo)
    sleepAccent: '#818CF8',
    sleepSurface: 'rgba(129, 140, 248, 0.06)',
    sleepBorder: 'rgba(129, 140, 248, 0.18)',

    // Category: Weight (purple)
    weightAccent: '#A78BFA',
    weightSurface: 'rgba(167, 139, 250, 0.06)',
    weightBorder: 'rgba(167, 139, 250, 0.18)',

    // Category: Streak (teal)
    streakAccent: '#2DD4BF',
    streakSurface: 'rgba(45, 212, 191, 0.06)',
    streakBorder: 'rgba(45, 212, 191, 0.18)',

    // Category: Fibre (mint/green)
    fibreAccent: '#34D399',
    fibreSurface: 'rgba(52, 211, 153, 0.06)',
    fibreBorder: 'rgba(52, 211, 153, 0.18)',

    // Context Banner
    contextBannerBg: 'rgba(45, 212, 191, 0.06)',
    contextBannerBorder: 'rgba(45, 212, 191, 0.16)',
} as const;
