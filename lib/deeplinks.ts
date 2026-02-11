import Constants from 'expo-constants';

const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME || Constants.expoConfig?.scheme || 'gluco';

export const RESET_PASSWORD_REDIRECT_URI = `${APP_SCHEME}://reset-password`;
