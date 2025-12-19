import { useFonts } from 'expo-font';

export const useOutfitFonts = () => {
    const [fontsLoaded, fontError] = useFonts({
        'Outfit-Thin': require('../font/Outfit/static/Outfit-Thin.ttf'),
        'Outfit-ExtraLight': require('../font/Outfit/static/Outfit-ExtraLight.ttf'),
        'Outfit-Light': require('../font/Outfit/static/Outfit-Light.ttf'),
        'Outfit-Regular': require('../font/Outfit/static/Outfit-Regular.ttf'),
        'Outfit-Medium': require('../font/Outfit/static/Outfit-Medium.ttf'),
        'Outfit-SemiBold': require('../font/Outfit/static/Outfit-SemiBold.ttf'),
        'Outfit-Bold': require('../font/Outfit/static/Outfit-Bold.ttf'),
        'Outfit-ExtraBold': require('../font/Outfit/static/Outfit-ExtraBold.ttf'),
        'Outfit-Black': require('../font/Outfit/static/Outfit-Black.ttf'),
    });

    return { fontsLoaded, fontError };
};

export const fonts = {
    thin: 'Outfit-Thin',
    extraLight: 'Outfit-ExtraLight',
    light: 'Outfit-Light',
    regular: 'Outfit-Regular',
    medium: 'Outfit-Medium',
    semiBold: 'Outfit-SemiBold',
    bold: 'Outfit-Bold',
    extraBold: 'Outfit-ExtraBold',
    black: 'Outfit-Black',
};
