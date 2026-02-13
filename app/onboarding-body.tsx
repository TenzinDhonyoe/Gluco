import { ONBOARDING_STEP_KEY } from '@/app/index';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { useSharedValue, withSpring, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

// Height ranges
const HEIGHT_CM_OPTIONS = Array.from({ length: 121 }, (_, i) => 100 + i);
const HEIGHT_FEET_OPTIONS = [3, 4, 5, 6, 7];
const HEIGHT_INCHES_OPTIONS = Array.from({ length: 12 }, (_, i) => i);

// Weight ranges
const WEIGHT_KG_OPTIONS = Array.from({ length: 171 }, (_, i) => 30 + i);
const WEIGHT_LBS_OPTIONS = Array.from({ length: 375 }, (_, i) => 66 + i);

const DIETARY_PREFERENCES = [
    'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free',
    'Dairy-free', 'Halal', 'Kosher', 'Low-carb', 'No restrictions',
];

const CULTURAL_FOOD_CONTEXTS = [
    'South Asian', 'East Asian', 'Southeast Asian', 'Mediterranean',
    'Latin American', 'Middle Eastern', 'African', 'Caribbean',
    'European', 'North American', 'Other',
];

const SCREEN_HEIGHT = 800;

export default function OnboardingBodyScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [heightCm, setHeightCm] = useState<number | null>(null);
    const [heightFeet, setHeightFeet] = useState(5);
    const [heightInches, setHeightInches] = useState(7);
    const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
    const [showHeightPicker, setShowHeightPicker] = useState(false);
    const [weightKg, setWeightKg] = useState<number | null>(null);
    const [weightLbs, setWeightLbs] = useState(150);
    const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
    const [showWeightPicker, setShowWeightPicker] = useState(false);
    const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
    const [culturalFoodContext, setCulturalFoodContext] = useState<string | null>(null);
    const [otherCulturalInput, setOtherCulturalInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const draftRestored = React.useRef(false);

    // Reanimated shared values
    const heightSlide = useSharedValue(SCREEN_HEIGHT);
    const weightSlide = useSharedValue(SCREEN_HEIGHT);

    const heightAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: heightSlide.value }],
    }));
    const weightAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: weightSlide.value }],
    }));

    // Restore draft
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.heightUnit) setHeightUnit(draft.heightUnit);
        if (typeof draft.heightCm === 'number') setHeightCm(draft.heightCm);
        if (typeof draft.heightFeet === 'number') setHeightFeet(draft.heightFeet);
        if (typeof draft.heightInches === 'number') setHeightInches(draft.heightInches);
        if (draft.weightUnit) setWeightUnit(draft.weightUnit);
        if (typeof draft.weightKg === 'number') setWeightKg(draft.weightKg);
        if (typeof draft.weightLbs === 'number') setWeightLbs(draft.weightLbs);
        if (Array.isArray(draft.dietaryPreferences)) setDietaryPreferences(draft.dietaryPreferences);
        if (draft.culturalFoodContext) {
            if (CULTURAL_FOOD_CONTEXTS.includes(draft.culturalFoodContext) || draft.culturalFoodContext === 'Other') {
                setCulturalFoodContext(draft.culturalFoodContext);
            } else {
                // It's a custom "Other" value
                setCulturalFoodContext('Other');
                setOtherCulturalInput(draft.culturalFoodContext);
            }
        }
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'body').catch(() => null);
    }, [isLoaded, draft]);

    // Save to draft on changes
    React.useEffect(() => {
        if (!draftRestored.current) return;
        const timer = setTimeout(() => {
            const resolvedCultural = culturalFoodContext === 'Other' && otherCulturalInput.trim()
                ? otherCulturalInput.trim()
                : culturalFoodContext;
            updateDraft({
                heightCm, heightFeet, heightInches, heightUnit,
                weightKg, weightLbs, weightUnit,
                dietaryPreferences,
                culturalFoodContext: resolvedCultural,
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [heightCm, heightFeet, heightInches, heightUnit, weightKg, weightLbs, weightUnit, dietaryPreferences, culturalFoodContext, otherCulturalInput, updateDraft]);

    // Conversion helpers
    const feetInchesToCm = (feet: number, inches: number): number => Math.round((feet * 12 + inches) * 2.54);
    const lbsToKg = (lbs: number): number => Math.round(lbs / 2.205);
    const cmToFeetInches = (cm: number) => {
        const totalInches = cm / 2.54;
        return { feet: Math.floor(totalInches / 12), inches: Math.round(totalInches % 12) };
    };
    const kgToLbs = (kg: number): number => Math.round(kg * 2.205);

    const getHeightDisplay = (): string => {
        if (heightCm === null && heightUnit === 'cm') return 'Select height';
        if (heightUnit === 'cm') return `${heightCm} cm`;
        return `${heightFeet}' ${heightInches}"`;
    };

    const getWeightDisplay = (): string => {
        if (weightKg === null && weightUnit === 'kg') return 'Select weight';
        if (weightUnit === 'kg') return `${weightKg} kg`;
        return `${weightLbs} lbs`;
    };

    const handleHeightUnitChange = (unit: 'cm' | 'ft') => {
        if (unit === heightUnit) return;
        if (unit === 'cm' && heightFeet && heightInches !== undefined) {
            setHeightCm(feetInchesToCm(heightFeet, heightInches));
        } else if (unit === 'ft' && heightCm) {
            const { feet, inches } = cmToFeetInches(heightCm);
            setHeightFeet(feet);
            setHeightInches(inches);
        }
        setHeightUnit(unit);
    };

    const handleWeightUnitChange = (unit: 'kg' | 'lbs') => {
        if (unit === weightUnit) return;
        if (unit === 'kg' && weightLbs) setWeightKg(lbsToKg(weightLbs));
        else if (unit === 'lbs' && weightKg) setWeightLbs(kgToLbs(weightKg));
        setWeightUnit(unit);
    };

    // Picker open/close
    const openHeightPicker = () => {
        setShowHeightPicker(true);
        heightSlide.value = SCREEN_HEIGHT;
        heightSlide.value = withSpring(0, { damping: 20, stiffness: 90 });
    };
    const closeHeightPicker = () => {
        heightSlide.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        setTimeout(() => setShowHeightPicker(false), 260);
    };
    const openWeightPicker = () => {
        setShowWeightPicker(true);
        weightSlide.value = SCREEN_HEIGHT;
        weightSlide.value = withSpring(0, { damping: 20, stiffness: 90 });
    };
    const closeWeightPicker = () => {
        weightSlide.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        setTimeout(() => setShowWeightPicker(false), 260);
    };

    const handleHeightDone = () => {
        if (heightUnit === 'ft') setHeightCm(feetInchesToCm(heightFeet, heightInches));
        closeHeightPicker();
    };
    const handleWeightDone = () => {
        if (weightUnit === 'lbs') setWeightKg(lbsToKg(weightLbs));
        closeWeightPicker();
    };

    const toggleDietaryPreference = (pref: string) => {
        setDietaryPreferences(prev => {
            if (pref === 'No restrictions') return prev.includes(pref) ? [] : ['No restrictions'];
            const without = prev.filter(p => p !== 'No restrictions');
            return without.includes(pref) ? without.filter(p => p !== pref) : [...without, pref];
        });
    };

    const handleContinue = async () => {
        setIsLoading(true);
        try {
            if (user) {
                const updates: Record<string, any> = {};
                if (heightCm !== null && heightCm > 0) {
                    updates.height_cm = heightCm;
                } else if (heightUnit === 'ft') {
                    updates.height_cm = feetInchesToCm(heightFeet, heightInches);
                }
                if (weightKg !== null && weightKg > 0) {
                    updates.weight_kg = weightKg;
                } else if (weightUnit === 'lbs') {
                    updates.weight_kg = lbsToKg(weightLbs);
                }
                if (dietaryPreferences.length > 0) {
                    updates.dietary_preferences = dietaryPreferences;
                }
                const resolvedCultural = culturalFoodContext === 'Other' && otherCulturalInput.trim()
                    ? otherCulturalInput.trim()
                    : culturalFoodContext;
                if (resolvedCultural) {
                    updates.cultural_food_context = resolvedCultural;
                }
                if (Object.keys(updates).length > 0) {
                    await updateUserProfile(user.id, updates);
                }
            }
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'tracking');
            router.push('/onboarding-tracking' as never);
        } catch {
            Alert.alert('Error', 'Failed to save your information. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkip = () => {
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'tracking').catch(() => null);
        router.push('/onboarding-tracking' as never);
    };

    const handleBack = () => {
        router.back();
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <OnboardingHeader currentStep={3} totalSteps={6} onBack={handleBack} />

                    <View style={styles.content}>
                        <View style={styles.titleSection}>
                            <Text style={styles.titleLabel}>OPTIONAL DETAILS</Text>
                            <Text style={styles.description}>
                                These help personalize insights. You can skip if you prefer.
                            </Text>
                        </View>

                        <View style={styles.formContainer}>
                            {/* Height */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Height</Text>
                                <TouchableOpacity
                                    style={styles.dropdownContainer}
                                    onPress={openHeightPicker}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.dropdownText,
                                        heightCm === null && heightUnit === 'cm' && styles.dropdownPlaceholder,
                                    ]}>
                                        {getHeightDisplay()}
                                    </Text>
                                    <Ionicons name="chevron-down" size={16} color={Colors.textTertiary} />
                                </TouchableOpacity>
                            </View>

                            {/* Weight */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Weight</Text>
                                <TouchableOpacity
                                    style={styles.dropdownContainer}
                                    onPress={openWeightPicker}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.dropdownText,
                                        weightKg === null && weightUnit === 'kg' && styles.dropdownPlaceholder,
                                    ]}>
                                        {getWeightDisplay()}
                                    </Text>
                                    <Ionicons name="chevron-down" size={16} color={Colors.textTertiary} />
                                </TouchableOpacity>
                            </View>

                            {/* Dietary Preferences */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Dietary Preferences</Text>
                                <View style={styles.chipsContainer}>
                                    {DIETARY_PREFERENCES.map((pref) => {
                                        const isSelected = dietaryPreferences.includes(pref);
                                        return (
                                            <AnimatedPressable
                                                key={pref}
                                                style={[styles.chip, isSelected && styles.chipSelected]}
                                                onPress={() => toggleDietaryPreference(pref)}
                                            >
                                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                                    {pref}
                                                </Text>
                                            </AnimatedPressable>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Cultural Food Context */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Cultural Food Context</Text>
                                <View style={styles.chipsContainer}>
                                    {CULTURAL_FOOD_CONTEXTS.map((ctx) => {
                                        const isSelected = culturalFoodContext === ctx;
                                        return (
                                            <AnimatedPressable
                                                key={ctx}
                                                style={[styles.chip, isSelected && styles.chipSelected]}
                                                onPress={() => setCulturalFoodContext(prev => prev === ctx ? null : ctx)}
                                            >
                                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                                    {ctx}
                                                </Text>
                                            </AnimatedPressable>
                                        );
                                    })}
                                </View>
                                {culturalFoodContext === 'Other' && (
                                    <TextInput
                                        style={styles.otherInput}
                                        placeholder="Describe your food culture"
                                        placeholderTextColor={Colors.textTertiary}
                                        value={otherCulturalInput}
                                        onChangeText={setOtherCulturalInput}
                                        autoCapitalize="sentences"
                                    />
                                )}
                            </View>
                        </View>
                    </View>
                </ScrollView>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
                        <Text style={styles.skipButtonText}>Skip</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.continueButton}
                        onPress={handleContinue}
                        activeOpacity={0.8}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color={Colors.textPrimary} />
                        ) : (
                            <Text style={styles.continueButtonText}>Continue</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* Height Picker Modal */}
            <Modal visible={showHeightPicker} transparent animationType="fade" onRequestClose={closeHeightPicker}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeHeightPicker} />
                    <Animated.View style={[styles.modalBottomSheet, heightAnimStyle]}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={closeHeightPicker} style={styles.modalHeaderButton}>
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.modalHeaderTitle}>Height</Text>
                            <TouchableOpacity onPress={handleHeightDone} style={styles.modalHeaderButton}>
                                <Text style={styles.modalDoneText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.unitToggleContainer}>
                            <TouchableOpacity
                                style={[styles.unitToggleButton, heightUnit === 'cm' && styles.unitToggleButtonActive]}
                                onPress={() => handleHeightUnitChange('cm')}
                            >
                                <Text style={[styles.unitToggleText, heightUnit === 'cm' && styles.unitToggleTextActive]}>cm</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.unitToggleButton, heightUnit === 'ft' && styles.unitToggleButtonActive]}
                                onPress={() => handleHeightUnitChange('ft')}
                            >
                                <Text style={[styles.unitToggleText, heightUnit === 'ft' && styles.unitToggleTextActive]}>ft / in</Text>
                            </TouchableOpacity>
                        </View>
                        {heightUnit === 'cm' ? (
                            <Picker selectedValue={heightCm || 170} onValueChange={(v) => setHeightCm(v)} style={styles.picker} itemStyle={styles.pickerItem}>
                                {HEIGHT_CM_OPTIONS.map((cm) => <Picker.Item key={cm} label={`${cm} cm`} value={cm} />)}
                            </Picker>
                        ) : (
                            <View style={styles.dualPickerContainer}>
                                <Picker selectedValue={heightFeet} onValueChange={(v) => setHeightFeet(v)} style={styles.halfPicker} itemStyle={styles.pickerItem}>
                                    {HEIGHT_FEET_OPTIONS.map((ft) => <Picker.Item key={ft} label={`${ft} ft`} value={ft} />)}
                                </Picker>
                                <Picker selectedValue={heightInches} onValueChange={(v) => setHeightInches(v)} style={styles.halfPicker} itemStyle={styles.pickerItem}>
                                    {HEIGHT_INCHES_OPTIONS.map((inch) => <Picker.Item key={inch} label={`${inch} in`} value={inch} />)}
                                </Picker>
                            </View>
                        )}
                    </Animated.View>
                </View>
            </Modal>

            {/* Weight Picker Modal */}
            <Modal visible={showWeightPicker} transparent animationType="fade" onRequestClose={closeWeightPicker}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeWeightPicker} />
                    <Animated.View style={[styles.modalBottomSheet, weightAnimStyle]}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={closeWeightPicker} style={styles.modalHeaderButton}>
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.modalHeaderTitle}>Weight</Text>
                            <TouchableOpacity onPress={handleWeightDone} style={styles.modalHeaderButton}>
                                <Text style={styles.modalDoneText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.unitToggleContainer}>
                            <TouchableOpacity
                                style={[styles.unitToggleButton, weightUnit === 'kg' && styles.unitToggleButtonActive]}
                                onPress={() => handleWeightUnitChange('kg')}
                            >
                                <Text style={[styles.unitToggleText, weightUnit === 'kg' && styles.unitToggleTextActive]}>kg</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.unitToggleButton, weightUnit === 'lbs' && styles.unitToggleButtonActive]}
                                onPress={() => handleWeightUnitChange('lbs')}
                            >
                                <Text style={[styles.unitToggleText, weightUnit === 'lbs' && styles.unitToggleTextActive]}>lbs</Text>
                            </TouchableOpacity>
                        </View>
                        {weightUnit === 'kg' ? (
                            <Picker selectedValue={weightKg || 70} onValueChange={(v) => setWeightKg(v)} style={styles.picker} itemStyle={styles.pickerItem}>
                                {WEIGHT_KG_OPTIONS.map((kg) => <Picker.Item key={kg} label={`${kg} kg`} value={kg} />)}
                            </Picker>
                        ) : (
                            <Picker selectedValue={weightLbs} onValueChange={(v) => setWeightLbs(v)} style={styles.picker} itemStyle={styles.pickerItem}>
                                {WEIGHT_LBS_OPTIONS.map((lbs) => <Picker.Item key={lbs} label={`${lbs} lbs`} value={lbs} />)}
                            </Picker>
                        )}
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 140,
    },
    content: {
        flex: 1,
    },
    titleSection: {
        marginBottom: 32,
    },
    titleLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.2,
        color: Colors.textTertiary,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    description: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.4,
        color: Colors.textPrimary,
    },
    formContainer: {},
    inputGroup: {
        marginBottom: 24,
    },
    inputLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.2,
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    dropdownContainer: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 52,
    },
    dropdownText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
        flex: 1,
    },
    dropdownPlaceholder: {
        color: Colors.textTertiary,
    },
    chipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(63, 66, 67, 0.28)',
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    chipSelected: {
        borderColor: Colors.buttonPrimary,
        backgroundColor: 'rgba(40, 94, 42, 0.3)',
    },
    chipText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    chipTextSelected: {
        color: Colors.textPrimary,
    },
    otherInput: {
        marginTop: 12,
        backgroundColor: Colors.inputBackgroundSolid,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
        flexDirection: 'row',
        gap: 12,
    },
    skipButton: {
        flex: 1,
        height: 48,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: Colors.borderCard,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    skipButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textTertiary,
    },
    continueButton: {
        flex: 2,
        height: 48,
        backgroundColor: Colors.buttonSecondary,
        borderWidth: 1,
        borderColor: Colors.buttonSecondaryBorder,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalBottomSheet: {
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 34,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(63, 66, 67, 0.5)',
    },
    modalHeaderButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    modalCancelText: {
        fontFamily: fonts.regular,
        fontSize: 17,
        color: Colors.textTertiary,
    },
    modalHeaderTitle: {
        fontFamily: fonts.medium,
        fontSize: 17,
        color: Colors.textPrimary,
    },
    modalDoneText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.primary,
    },
    unitToggleContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 8,
        backgroundColor: 'rgba(63, 66, 67, 0.4)',
        borderRadius: 8,
        padding: 4,
    },
    unitToggleButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 6,
        alignItems: 'center',
    },
    unitToggleButtonActive: {
        backgroundColor: 'rgba(52, 148, 217, 0.3)',
    },
    unitToggleText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textTertiary,
    },
    unitToggleTextActive: {
        color: Colors.primary,
    },
    picker: {
        height: 216,
        backgroundColor: '#1c1c1e',
    },
    pickerItem: {
        color: Colors.textPrimary,
        fontSize: 22,
    },
    dualPickerContainer: {
        flexDirection: 'row',
        backgroundColor: '#1c1c1e',
    },
    halfPicker: {
        flex: 1,
        height: 216,
    },
});
