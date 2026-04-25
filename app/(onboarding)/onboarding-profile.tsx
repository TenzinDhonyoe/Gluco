import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingScreenLayout } from '@/components/onboarding/OnboardingScreenLayout';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { updateUserProfile } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function OnboardingProfileScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { user, profile, signOut } = useAuth();
    const draftRestored = React.useRef(false);

    // If the profile already has a name (e.g. from Sign in with Apple),
    // skip this screen — Apple already provided it.
    React.useEffect(() => {
        if (profile?.first_name && profile?.last_name) {
            AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'goals').catch(() => null);
            router.replace('/onboarding-goals' as never);
        }
    }, [profile?.first_name, profile?.last_name]);

    // Restore draft once loaded
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.firstName) setFirstName(draft.firstName);
        if (draft.lastName) setLastName(draft.lastName);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'profile').catch(() => null);
    }, [isLoaded, draft]);

    // Save to draft on changes
    React.useEffect(() => {
        if (!draftRestored.current) return;
        const timer = setTimeout(() => {
            updateDraft({ firstName, lastName });
        }, 300);
        return () => clearTimeout(timer);
    }, [firstName, lastName, updateDraft]);

    const handleContinue = async () => {
        if (!firstName.trim() || !lastName.trim()) return;
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                await updateUserProfile(user.id, {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                });
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'goals');
            router.push('/onboarding-goals' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your information. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = async () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            await signOut();
            router.replace('/');
        }
    };

    const isContinueEnabled = firstName.trim().length > 0 && lastName.trim().length > 0;

    return (
        <OnboardingScreenLayout
            currentStep={1}
            title="Let's get to know you"
            subtitle="We'll use this to personalize everything you see."
            onBack={handleBack}
            hasKeyboardInput
            bottomContent={
                <TouchableOpacity
                    style={[styles.continueButton, !isContinueEnabled && styles.continueButtonDisabled]}
                    onPress={handleContinue}
                    activeOpacity={0.8}
                    disabled={!isContinueEnabled || isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color={Colors.buttonActionText} />
                    ) : (
                        <Text style={[styles.buttonText, !isContinueEnabled && styles.buttonTextDisabled]}>
                            Continue
                        </Text>
                    )}
                </TouchableOpacity>
            }
        >
            <View style={styles.formContainer}>
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>First Name</Text>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Enter your first name"
                        placeholderTextColor={Colors.textTertiary}
                        value={firstName}
                        onChangeText={setFirstName}
                        autoCapitalize="words"
                        autoCorrect={false}
                        textContentType="none"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Last Name</Text>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Enter your last name"
                        placeholderTextColor={Colors.textTertiary}
                        value={lastName}
                        onChangeText={setLastName}
                        autoCapitalize="words"
                        autoCorrect={false}
                        textContentType="none"
                    />
                </View>
            </View>
        </OnboardingScreenLayout>
    );
}

const styles = StyleSheet.create({
    formContainer: {},
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.2,
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    textInput: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    continueButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.buttonAction,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonDisabled: {
        backgroundColor: Colors.buttonDisabled,
    },
    buttonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.buttonActionText,
    },
    buttonTextDisabled: {
        color: Colors.buttonDisabledText,
    },
});
