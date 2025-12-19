import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

// CGM Device options
const CGM_DEVICES = [
    'Dexcom G6',
    'Freestyle Libre',
    'Eversense',
];

export default function Onboarding4Screen() {
    const [selectedDevice, setSelectedDevice] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const currentStep = 4;
    const totalSteps = 5;

    const handleContinue = async () => {
        setIsLoading(true);
        try {
            if (user && selectedDevice) {
                await updateUserProfile(user.id, {
                    cgm_device: selectedDevice,
                });
            }
            // Navigate to next onboarding screen
            router.push('/onboarding-5' as never);
        } catch (error) {
            Alert.alert('Error', 'Failed to save your information. Please try again.');
            console.error('Error saving profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkip = () => {
        // Navigate to next onboarding screen without saving device
        router.push('/onboarding-5' as never);
    };

    const handleBack = () => {
        router.back();
    };

    const handleSelectDevice = (device: string) => {
        setSelectedDevice(device);
    };

    return (
        <View style={styles.container}>
            {/* Background Image */}
            <ImageBackground
                source={require('../assets/images/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                        style={styles.keyboardView}
                    >
                        <ScrollView
                            ref={scrollViewRef}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                        >
                            {/* Back Button */}
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={handleBack}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                            </TouchableOpacity>

                            {/* Progress Indicator - Below Back Button */}
                            <View style={styles.progressContainer}>
                                {Array.from({ length: totalSteps }).map((_, index) => (
                                    <View
                                        key={index}
                                        style={[
                                            styles.progressBar,
                                            index < currentStep ? styles.progressBarActive : styles.progressBarInactive,
                                            index < totalSteps - 1 && styles.progressBarSpacing,
                                        ]}
                                    />
                                ))}
                            </View>

                            {/* Content Section */}
                            <View style={styles.content}>
                                {/* Title Section */}
                                <View style={styles.titleSection}>
                                    <Text style={styles.titleLabel}>CONNECT YOUR CGM DEVICE</Text>
                                    <Text style={styles.description}>
                                        Sync your glucose readings automatically for the best real time guidance. You can also connect a device later in Settings.
                                    </Text>
                                </View>

                                {/* CGM Device List */}
                                <View style={styles.deviceListContainer}>
                                    {CGM_DEVICES.map((device, index) => (
                                        <TouchableOpacity
                                            key={device}
                                            style={[
                                                styles.deviceItem,
                                                selectedDevice === device && styles.deviceItemSelected,
                                                index === CGM_DEVICES.length - 1 && { marginBottom: 0 },
                                            ]}
                                            onPress={() => handleSelectDevice(device)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.deviceItemText}>
                                                {device}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </ScrollView>

                        {/* Skip/Continue Button - Fixed at Bottom */}
                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.skipButton,
                                    selectedDevice && styles.continueButton,
                                ]}
                                onPress={selectedDevice ? handleContinue : handleSkip}
                                activeOpacity={0.8}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <Text style={styles.skipButtonText}>
                                        {selectedDevice ? 'Continue' : 'Skip'}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </ImageBackground>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    safeArea: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 200, // Extra space for keyboard and fixed button
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24, // Spacing below progress bar
    },
    progressBar: {
        height: 2,
        borderRadius: 12,
    },
    progressBarSpacing: {
        marginRight: 5,
    },
    progressBarActive: {
        backgroundColor: Colors.textPrimary, // White
        width: 68,
    },
    progressBarInactive: {
        backgroundColor: '#878787',
        width: 68,
    },
    content: {
        width: 361, // Match Figma width
    },
    titleSection: {
        marginBottom: 32, // gap-[32px] between title section and device list
    },
    titleLabel: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: '#878787',
        textTransform: 'uppercase',
        marginBottom: 12, // gap-[12px] between title and description
    },
    description: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: Colors.textPrimary,
    },
    deviceListContainer: {
        backgroundColor: 'rgba(63, 66, 67, 0.25)',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    deviceItem: {
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginBottom: 8,
    },
    deviceItemSelected: {
        backgroundColor: '#1b1b1c',
    },
    deviceItemText: {
        fontFamily: fonts.regular, // Outfit Regular (400)
        fontSize: 16,
        lineHeight: 16 * 0.95, // 0.95 line-height
        color: Colors.textPrimary,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
        paddingHorizontal: 0,
    },
    skipButton: {
        width: '100%',
        height: 48,
        backgroundColor: '#3f4243',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButton: {
        backgroundColor: '#285E2A',
        borderWidth: 1,
        borderColor: '#448D47',
    },
    skipButtonText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 15,
        lineHeight: 15 * 0.95, // 0.95 line-height
        letterSpacing: 0,
        color: Colors.textPrimary, // White
    },
});

