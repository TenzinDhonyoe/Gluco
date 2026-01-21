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
    backgroundCard: '#1A1B1C',
    backgroundElevated: '#1E1E1E',
    backgroundGradientStart: '#1a1f24',
    backgroundGradientMid: '#181c20',
    backgroundGradientEnd: '#111111',

    // ============================================
    // TEXT COLORS
    // ============================================
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A0',
    textTertiary: '#878787',
    textMuted: '#6B6B6B',
    textPlaceholder: '#666666',

    // ============================================
    // PRIMARY ACCENT (Blue - main action color)
    // ============================================
    primary: '#3494D9',
    primaryLight: 'rgba(52, 148, 217, 0.15)',
    primaryMedium: 'rgba(52, 148, 217, 0.3)',
    primaryDark: 'rgba(52, 148, 217, 0.5)',

    // ============================================
    // SUCCESS / IN RANGE (Green - unified green)
    // ============================================
    success: '#4CAF50',
    successLight: 'rgba(76, 175, 80, 0.12)',
    successMedium: 'rgba(76, 175, 80, 0.2)',
    successDark: 'rgba(76, 175, 80, 0.9)',

    // ============================================
    // WARNING (Orange)
    // ============================================
    warning: '#FF9800',
    warningLight: 'rgba(255, 152, 0, 0.1)',
    warningMedium: 'rgba(255, 152, 0, 0.2)',

    // ============================================
    // ERROR / HIGH (Red)
    // ============================================
    error: '#F44336',
    errorLight: 'rgba(244, 67, 54, 0.12)',
    errorMedium: 'rgba(244, 67, 54, 0.2)',

    // ============================================
    // CATEGORY ACCENT COLORS (for visual distinction)
    // ============================================
    // Glucose/Blood - Red tint
    glucose: '#FF375F',
    glucoseLight: 'rgba(255, 55, 95, 0.1)',
    glucoseMedium: 'rgba(255, 55, 95, 0.2)',

    // Activity - Cyan
    activity: '#22EFEF',
    activityLight: 'rgba(34, 239, 239, 0.15)',

    // Sleep - Blue (uses primary)
    sleep: '#3494D9',
    sleepLight: 'rgba(52, 148, 217, 0.15)',

    // Meals/Food - Golden orange
    meal: '#EBA914',
    mealLight: 'rgba(235, 169, 20, 0.15)',

    // Fiber/Nutrition - Green (uses success)
    fiber: '#4CAF50',
    fiberLight: 'rgba(76, 175, 80, 0.12)',

    // Steps - Blue (uses primary)
    steps: '#3494D9',
    stepsLight: 'rgba(52, 148, 217, 0.15)',

    // Heart Rate - Red tint
    heartRate: '#FF375F',
    heartRateLight: 'rgba(255, 55, 95, 0.1)',

    // ============================================
    // GLUCOSE STATUS COLORS
    // ============================================
    glucoseGood: '#4CAF50',
    glucoseWarning: '#FF9800',
    glucoseHigh: '#F44336',
    glucoseLow: '#F44336',

    // ============================================
    // CHART COLORS
    // ============================================
    chartGreen: '#4CAF50',
    chartYellow: '#FDCB6E',
    chartRed: '#F06B6B',
    chartBlue: '#3494D9',
    chartAreaGreen: 'rgba(56, 118, 58, 0.40)',
    chartAreaRed: 'rgba(183, 68, 68, 0.35)',
    chartAreaBlue: 'rgba(52, 148, 217, 0.4)',

    // ============================================
    // BUTTON COLORS
    // ============================================
    buttonPrimary: '#3494D9',
    buttonPrimaryText: '#FFFFFF',
    buttonSecondary: '#285E2A',
    buttonSecondaryBorder: '#448D47',
    buttonDisabled: '#2A3036',
    buttonDestructive: '#FF3B30',

    // ============================================
    // INPUT COLORS
    // ============================================
    inputBackground: 'rgba(63, 66, 67, 0.3)',
    inputBorder: 'rgba(255, 255, 255, 0.05)',
    inputBorderFocused: 'rgba(52, 148, 217, 0.5)',
    inputPlaceholder: '#878787',

    // ============================================
    // BORDER COLORS
    // ============================================
    border: 'rgba(255, 255, 255, 0.05)',
    borderLight: 'rgba(255, 255, 255, 0.08)',
    borderMedium: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.15)',
    borderCard: '#3F4243',

    // ============================================
    // SOCIAL BUTTONS
    // ============================================
    googleBackground: '#FFFFFF',
    appleBackground: '#000000',
    appleBorder: '#333333',

    // ============================================
    // SPECIAL COLORS
    // ============================================
    gold: '#D4AF37',
    premium: '#D4AF37',

    // ============================================
    // OVERLAY COLORS
    // ============================================
    overlayLight: 'rgba(0, 0, 0, 0.3)',
    overlayMedium: 'rgba(0, 0, 0, 0.5)',
    overlayDark: 'rgba(0, 0, 0, 0.7)',

    // ============================================
    // TAB BAR
    // ============================================
    tabBarInactive: '#6B6B6B',
    tabBarActive: '#FFFFFF',
};

export const Gradients = {
    headerGradient: ['#11111100', '#656570'],
    backgroundGradient: ['#1a1f24', '#181c20', '#111111'],
    cardGradient: ['rgba(40, 44, 48, 0.95)', 'rgba(30, 33, 36, 0.98)', 'rgba(35, 38, 41, 0.95)'],
};
