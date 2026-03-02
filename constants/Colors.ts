/**
 * Gluco App Color Constants
 *
 * This file defines the single source of truth for all colors in the app.
 * Always import colors from here instead of hardcoding hex values.
 *
 * Light mode — Apple Health inspired.
 */
export const Colors = {
    // ============================================
    // BACKGROUND COLORS
    // ============================================
    background: 'transparent',           // Transparent — ForestGlassBackground gradient renders in root layout
    backgroundSolid: '#F2F2F7',          // Apple systemGray6 — use where an opaque bg is needed
    backgroundSecondary: '#EFEFF4',
    backgroundCard: '#FFFFFF',
    backgroundCardGlass: 'rgba(255, 255, 255, 0.92)',
    backgroundElevated: '#FFFFFF',
    backgroundGradientStart: '#F2F2F7',
    backgroundGradientMid: '#EFEFF4',
    backgroundGradientEnd: '#F2F2F7',

    // ============================================
    // TEXT COLORS
    // ============================================
    textPrimary: '#1C1C1E',
    textSecondary: '#8E8E93',           // Apple systemGray
    textTertiary: '#AEAEB2',            // Apple systemGray2
    textMuted: '#C7C7CC',               // Apple systemGray4
    textPlaceholder: '#C7C7CC',

    // ============================================
    // PRIMARY ACCENT
    // ============================================
    primary: '#2DD4BF',                 // Electric Teal — unchanged
    primaryLight: 'rgba(45, 212, 191, 0.10)',
    primaryMedium: 'rgba(45, 212, 191, 0.18)',
    primaryDark: 'rgba(45, 212, 191, 0.30)',

    // ============================================
    // SUCCESS / ON TARGET (Mint)
    // ============================================
    success: '#34D399',                 // Vibrant Mint
    successLight: 'rgba(52, 211, 153, 0.10)',
    successMedium: 'rgba(52, 211, 153, 0.15)',
    successDark: 'rgba(52, 211, 153, 0.9)',

    // ============================================
    // WARNING / NEEDS ATTENTION (Peach/Amber)
    // ============================================
    warning: '#FFB380',                 // Warm Peach
    warningLight: 'rgba(255, 179, 128, 0.10)',
    warningMedium: 'rgba(255, 179, 128, 0.15)',

    // ============================================
    // ERROR / HIGH
    // ============================================
    error: '#F87171',                   // Softer red
    errorLight: 'rgba(248, 113, 113, 0.10)',
    errorMedium: 'rgba(248, 113, 113, 0.15)',

    // ============================================
    // MOMENTUM / MID-RANGE (Blue)
    // ============================================
    blue: '#60A5FA',                    // Calm Blue
    blueLight: 'rgba(96, 165, 250, 0.10)',

    // ============================================
    // CATEGORY ACCENT COLORS (for visual distinction)
    // ============================================
    // Glucose/Blood - Red tint
    glucose: '#F87171',
    glucoseLight: 'rgba(248, 113, 113, 0.10)',
    glucoseMedium: 'rgba(248, 113, 113, 0.15)',

    // Activity - Cyan (matches primary now)
    activity: '#22D3EE',
    activityLight: 'rgba(34, 211, 238, 0.10)',

    // Sleep - Indigo/Blue
    sleep: '#818CF8',
    sleepLight: 'rgba(129, 140, 248, 0.10)',

    // Meals/Food - Amber
    meal: '#FBBF24',
    mealLight: 'rgba(251, 191, 36, 0.12)',

    // Fiber/Nutrition - Mint (uses success)
    fiber: '#34D399',
    fiberLight: 'rgba(52, 211, 153, 0.10)',

    // Steps - Blue
    steps: '#60A5FA',
    stepsLight: 'rgba(96, 165, 250, 0.10)',

    // Heart Rate - Red tint
    heartRate: '#F87171',
    heartRateLight: 'rgba(248, 113, 113, 0.10)',

    // ============================================
    // GLUCOSE STATUS COLORS
    // ============================================
    glucoseGood: '#34D399',
    glucoseWarning: '#FFB380',
    glucoseHigh: '#F87171',
    glucoseLow: '#F87171',

    // ============================================
    // CHART COLORS
    // ============================================
    chartGreen: '#34D399',
    chartYellow: '#FCD34D',
    chartRed: '#F87171',
    chartBlue: '#60A5FA',
    chartAreaGreen: 'rgba(52, 211, 153, 0.30)',
    chartAreaRed: 'rgba(248, 113, 113, 0.25)',
    chartAreaBlue: 'rgba(96, 165, 250, 0.30)',

    // ============================================
    // BUTTON COLORS
    // ============================================
    buttonPrimary: '#2DD4BF',           // Electric Teal — accent borders, spinners, icons
    buttonPrimaryText: '#042F2E',       // Deep Teal/Black — text on teal background
    buttonAction: '#1C1C1E',            // Dark CTA — all save/submit/confirm buttons
    buttonActionText: '#FFFFFF',        // White text on dark CTA
    buttonSecondary: 'rgba(0, 0, 0, 0.06)',
    buttonSecondaryBorder: 'rgba(0, 0, 0, 0.08)',
    buttonBorder: 'rgba(0, 0, 0, 0.08)',
    buttonDisabled: '#E5E5EA',
    buttonDisabledText: '#AEAEB2',
    buttonDestructive: '#EF4444',
    buttonDestructiveText: '#FFFFFF',

    // ============================================
    // INPUT COLORS
    // ============================================
    inputBackground: 'rgba(120, 120, 128, 0.12)', // Apple systemFill
    inputBackgroundSolid: '#EFEFF4',
    inputBorder: 'rgba(60, 60, 67, 0.12)',
    inputBorderSolid: '#D1D1D6',
    inputBorderFocused: 'rgba(45, 212, 191, 0.5)',
    inputPlaceholder: '#C7C7CC',

    // ============================================
    // BORDER COLORS
    // ============================================
    border: 'rgba(60, 60, 67, 0.12)',
    borderLight: 'rgba(60, 60, 67, 0.08)',
    borderMedium: 'rgba(60, 60, 67, 0.18)',
    borderStrong: 'rgba(60, 60, 67, 0.25)',
    borderCard: 'rgba(60, 60, 67, 0.10)',

    // ============================================
    // SOCIAL BUTTONS
    // ============================================
    googleBackground: '#FFFFFF',
    appleBackground: '#000000',
    appleBorder: '#333333',

    // ============================================
    // SPECIAL COLORS
    // ============================================
    gold: '#FCD34D',
    premium: '#FCD34D',

    // ============================================
    // OVERLAY COLORS
    // ============================================
    glassButton: 'rgba(0, 0, 0, 0.06)',
    overlayLight: 'rgba(0, 0, 0, 0.2)',
    overlayMedium: 'rgba(0, 0, 0, 0.4)',
    overlayDark: 'rgba(0, 0, 0, 0.6)',

    // ============================================
    // TAB BAR
    // ============================================
    tabBarInactive: '#8E8E93',
    tabBarActive: '#007AFF',            // Apple system blue
};

export const Gradients = {
    headerGradient: ['#F2F2F700', '#EFEFF4'],
    backgroundGradient: ['#F2F2F7', '#EFEFF4', '#F2F2F7'],
    cardGradient: ['rgba(255, 255, 255, 0.98)', 'rgba(245, 245, 250, 0.98)', 'rgba(255, 255, 255, 0.98)'],
};
