import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SheetItem } from '@/components/ui/sheet-item';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Dimensions,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// Common regions list - can be expanded
const REGIONS = [
    'United States',
    'Canada',
    'United Kingdom',
    'Australia',
    'Germany',
    'France',
    'Spain',
    'Italy',
    'Netherlands',
    'Sweden',
    'Norway',
    'Denmark',
    'Japan',
    'South Korea',
    'Singapore',
    'India',
    'Brazil',
    'Mexico',
    'Other',
];

export default function Onboarding2Screen() {
    const [region, setRegion] = useState('');
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const currentStep = 2;
    const totalSteps = 5;

    const handleContinue = async () => {
        if (!region.trim()) return;
        
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, {
                    region: region.trim(),
                });
            }
            // Navigate to next onboarding screen
            router.push('/onboarding-3' as never);
        } catch (error) {
            Alert.alert('Error', 'Failed to save your information. Please try again.');
            console.error('Error saving profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        router.back();
    };

    const handleSelectRegion = (selectedRegion: string) => {
        setRegion(selectedRegion);
        setShowRegionPicker(false);
    };

    const isContinueEnabled = region.trim().length > 0;

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
                                <Text style={styles.titleLabel}>WHERE DO YOU LIVE?</Text>
                                <Text style={styles.description}>
                                    Your region helps Gluco use the right units and time zone for your guidance.
                                </Text>
                            </View>

                            {/* Form Fields */}
                            <View style={styles.formContainer}>
                                {/* Region Dropdown */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Region</Text>
                                    <TouchableOpacity
                                        style={styles.dropdownContainer}
                                        onPress={() => setShowRegionPicker(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.dropdownText, !region && styles.dropdownPlaceholder]}>
                                            {region || 'Region'}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#878787" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Continue Button - Fixed at Bottom */}
                    <View style={styles.buttonContainer}>
                        <Button
                            onPress={handleContinue}
                            disabled={!isContinueEnabled}
                            loading={isLoading}
                            variant="primary"
                            style={styles.continueButton}
                        >
                            Continue
                        </Button>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
            </ImageBackground>

            <Sheet open={showRegionPicker} onOpenChange={setShowRegionPicker}>
                <SheetContent>
                    <Text style={styles.sheetTitle}>Select Region</Text>
                    <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
                        {REGIONS.map((item) => (
                            <SheetItem
                                key={item}
                                title={item}
                                onPress={() => handleSelectRegion(item)}
                                right={region === item ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : undefined}
                            />
                        ))}
                    </ScrollView>
                </SheetContent>
            </Sheet>
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
    progressBarActive: {
        backgroundColor: Colors.textPrimary, // White
        width: 68,
    },
    progressBarInactive: {
        backgroundColor: '#878787',
        width: 68,
    },
    progressBarSpacing: {
        marginRight: 5,
    },
    content: {
        marginTop: 32,
    },
    titleSection: {
        marginBottom: 32,
    },
    titleLabel: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: '#878787',
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    description: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 1.2, // 1.2 line-height
        color: Colors.textPrimary,
    },
    formContainer: {
        // Gap handled by marginBottom on inputGroup
    },
    inputGroup: {
        marginBottom: 24,
    },
    inputLabel: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 0.95, // 0.95 line-height
        color: Colors.textPrimary,
        marginBottom: 24,
    },
    dropdownContainer: {
        backgroundColor: '#1b1b1c',
        borderWidth: 1,
        borderColor: '#313135',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    dropdownText: {
        fontFamily: fonts.regular, // Outfit Regular (400)
        fontSize: 16,
        lineHeight: 16 * 0.95, // 0.95 line-height
        color: Colors.textPrimary,
        flex: 1,
    },
    dropdownPlaceholder: {
        color: '#878787',
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
        paddingHorizontal: 0,
    },
    continueButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.buttonPrimary, // #285e2a
        borderWidth: 1,
        borderColor: Colors.buttonBorder, // #448d47
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonDisabled: {
        backgroundColor: '#3f4243',
        borderColor: '#3f4243',
    },
    buttonText: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 15,
        lineHeight: 15 * 0.95, // 0.95 line-height
        letterSpacing: 0,
        color: Colors.textPrimary,
    },
    buttonTextDisabled: {
        color: '#878787',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Colors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#313135',
    },
    modalTitle: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: Colors.textPrimary,
    },
    modalCloseButton: {
        padding: 4,
    },
    modalList: {
        maxHeight: 400,
    },
    modalItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#313135',
    },
    modalItemSelected: {
        backgroundColor: '#1b1b1c',
    },
    modalItemText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    modalItemTextSelected: {
        color: Colors.buttonPrimary,
    },
});

