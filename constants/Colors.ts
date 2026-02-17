/**
 * Gluco App Color Constants
 *
 * This file defines the single source of truth for all colors in the app.
 * Always import colors from here instead of hardcoding hex values.
 */
export const Colors = {
    // ============================================
    // BACKGROUND COLORS
    // ============================================
    background: '#111111',
    backgroundSecondary: '#161616',
    backgroundCard: '#1A1A1C', // Base charcoal
    backgroundCardGlass: 'rgba(26, 26, 28, 0.90)', // Glass effect base
    backgroundElevated: '#1E1E1E',
    backgroundGradientStart: '#1a1f24',
    backgroundGradientMid: '#181c20',
    backgroundGradientEnd: '#111111',

    // ============================================
    // TEXT COLORS
    // ============================================
    textPrimary: '#FFFFFF',
    textSecondary: '#9CA3AF', // Cool slate grey
    textTertiary: '#6B7280',
    textMuted: '#4B5563',
    textPlaceholder: '#666666',

    // ============================================
    // PRIMARY ACCENT
    // ============================================
    primary: '#2DD4BF', // Electric Teal
    primaryLight: 'rgba(45, 212, 191, 0.15)',
    primaryMedium: 'rgba(45, 212, 191, 0.3)',
    primaryDark: 'rgba(45, 212, 191, 0.5)',

    // ============================================
    // SUCCESS / ON TARGET (Mint)
    // ============================================
    success: '#34D399', // Vibrant Mint
    successLight: 'rgba(52, 211, 153, 0.12)',
    successMedium: 'rgba(52, 211, 153, 0.2)',
    successDark: 'rgba(52, 211, 153, 0.9)',

    // ============================================
    // WARNING / NEEDS ATTENTION (Peach/Amber)
    // ============================================
    warning: '#FFB380', // Warm Peach
    warningLight: 'rgba(255, 179, 128, 0.1)',
    warningMedium: 'rgba(255, 179, 128, 0.2)',

    // ============================================
    // ERROR / HIGH
    // ============================================
    error: '#F87171', // Softer red
    errorLight: 'rgba(248, 113, 113, 0.12)',
    errorMedium: 'rgba(248, 113, 113, 0.2)',

    // ============================================
    // MOMENTUM / MID-RANGE (Blue)
    // ============================================
    blue: '#60A5FA', // Calm Blue
    blueLight: 'rgba(96, 165, 250, 0.15)',

    // ============================================
    // CATEGORY ACCENT COLORS (for visual distinction)
    // ============================================
    // Glucose/Blood - Red tint
    glucose: '#F87171',
    glucoseLight: 'rgba(248, 113, 113, 0.1)',
    glucoseMedium: 'rgba(248, 113, 113, 0.2)',

    // Activity - Cyan (matches primary now)
    activity: '#22D3EE',
    activityLight: 'rgba(34, 211, 238, 0.15)',

    // Sleep - Indigo/Blue
    sleep: '#818CF8',
    sleepLight: 'rgba(129, 140, 248, 0.15)',

    // Meals/Food - Amber
    meal: '#FBBF24',
    mealLight: 'rgba(251, 191, 36, 0.15)',

    // Fiber/Nutrition - Mint (uses success)
    fiber: '#34D399',
    fiberLight: 'rgba(52, 211, 153, 0.12)',

    // Steps - Blue
    steps: '#60A5FA',
    stepsLight: 'rgba(96, 165, 250, 0.15)',

    // Heart Rate - Red tint
    heartRate: '#F87171',
    heartRateLight: 'rgba(248, 113, 113, 0.1)',

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
    chartAreaGreen: 'rgba(52, 211, 153, 0.40)',
    chartAreaRed: 'rgba(248, 113, 113, 0.35)',
    chartAreaBlue: 'rgba(96, 165, 250, 0.4)',

    // ============================================
    // BUTTON COLORS
    // ============================================
    buttonPrimary: '#2DD4BF', // Electric Teal
    buttonPrimaryText: '#042F2E', // Deep Teal/Black
    buttonSecondary: 'rgba(255, 255, 255, 0.12)',
    buttonSecondaryBorder: 'rgba(255, 255, 255, 0.08)',
    buttonBorder: 'rgba(255, 255, 255, 0.08)',
    buttonDisabled: '#2A3036',
    buttonDestructive: '#EF4444',
    buttonDestructiveText: '#FFFFFF',

    // ============================================
    // INPUT COLORS
    // ============================================
    inputBackground: 'rgba(26, 26, 28, 0.5)',
    inputBackgroundSolid: '#1A1A1C',
    inputBorder: 'rgba(255, 255, 255, 0.08)',
    inputBorderSolid: '#313135',
    inputBorderFocused: 'rgba(45, 212, 191, 0.5)',
    inputPlaceholder: '#9CA3AF',

    // ============================================
    // BORDER COLORS
    // ============================================
    border: 'rgba(255, 255, 255, 0.08)',
    borderLight: 'rgba(255, 255, 255, 0.08)',
    borderMedium: 'rgba(255, 255, 255, 0.12)',
    borderStrong: 'rgba(255, 255, 255, 0.15)',
    borderCard: 'rgba(255, 255, 255, 0.08)',

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
    glassButton: 'rgba(255, 255, 255, 0.12)',
    overlayLight: 'rgba(0, 0, 0, 0.3)',
    overlayMedium: 'rgba(0, 0, 0, 0.5)',
    overlayDark: 'rgba(0, 0, 0, 0.7)',

    // ============================================
    // TAB BAR
    // ============================================
    tabBarInactive: '#9CA3AF',
    tabBarActive: '#FFFFFF',
};

export const Gradients = {
    headerGradient: ['#11111100', '#656570'],
    backgroundGradient: ['#1a1f24', '#181c20', '#111111'],
    cardGradient: ['rgba(32, 44, 38, 0.95)', 'rgba(24, 35, 30, 0.98)', 'rgba(28, 40, 34, 0.95)'],
};
