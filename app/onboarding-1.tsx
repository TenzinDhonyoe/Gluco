import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export default function Onboarding1Screen() {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const currentStep = 1;
    const totalSteps = 5;

    const handleContinue = async () => {
        if (!firstName.trim() || !lastName.trim()) return;
        
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                });
            }
            // Navigate to next onboarding screen
            router.push('/onboarding-2' as never);
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

    const isContinueEnabled = firstName.trim().length > 0 && lastName.trim().length > 0;

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
                                <Text style={styles.titleLabel}>TELL US ABOUT YOU</Text>
                                <Text style={styles.description}>
                                    This helps us personalize your Gluco experience and keep your profile accurate.
                                </Text>
                            </View>

                            {/* Form Fields */}
                            <View style={styles.formContainer}>
                                {/* First Name Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>First Name</Text>
                                    <Input
                                        placeholder="First Name"
                                        value={firstName}
                                        onChangeText={setFirstName}
                                        onFocus={() => {
                                            setTimeout(() => {
                                                scrollViewRef.current?.scrollTo({ y: 100, animated: true });
                                            }, 100);
                                        }}
                                        autoCapitalize="words"
                                        autoCorrect={false}
                                    />
                                </View>

                                {/* Last Name Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Last Name</Text>
                                    <Input
                                        placeholder="Last Name"
                                        value={lastName}
                                        onChangeText={setLastName}
                                        onFocus={() => {
                                            setTimeout(() => {
                                                scrollViewRef.current?.scrollTo({ y: 200, animated: true });
                                            }, 100);
                                        }}
                                        autoCapitalize="words"
                                        autoCorrect={false}
                                    />
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
        marginBottom: 32, // gap-[32px] between title section and form
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
    formContainer: {
        // gap-[24px] between input groups handled by marginBottom
    },
    inputGroup: {
        marginBottom: 24, // gap-[24px] between input groups
    },
    inputLabel: {
        fontFamily: fonts.medium, // Outfit Medium (500)
        fontSize: 16,
        lineHeight: 16 * 0.95, // 0.95 line-height
        color: Colors.textPrimary,
        marginBottom: 24, // gap-[24px] between label and input
    },
    // Input styling is now provided by <Input />
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
        paddingHorizontal: 0,
    },
    continueButton: {
        width: '100%',
    },
    // Button styling is now provided by <Button />
});

