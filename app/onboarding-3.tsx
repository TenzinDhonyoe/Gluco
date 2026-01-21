import { ONBOARDING_STEP_KEY } from '@/app/index';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    Animated,
    Dimensions,
    ImageBackground,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Height ranges
const HEIGHT_CM_OPTIONS = Array.from({ length: 121 }, (_, i) => 100 + i); // 100-220 cm
const HEIGHT_FEET_OPTIONS = [3, 4, 5, 6, 7]; // 3-7 feet
const HEIGHT_INCHES_OPTIONS = Array.from({ length: 12 }, (_, i) => i); // 0-11 inches

// Weight ranges
const WEIGHT_KG_OPTIONS = Array.from({ length: 171 }, (_, i) => 30 + i); // 30-200 kg
const WEIGHT_LBS_OPTIONS = Array.from({ length: 375 }, (_, i) => 66 + i); // 66-440 lbs

const BODY_DRAFT_KEY = 'onboarding_body_draft';

export default function Onboarding3Screen() {
    // Height state
    const [heightCm, setHeightCm] = useState<number | null>(null);
    const [heightFeet, setHeightFeet] = useState(5);
    const [heightInches, setHeightInches] = useState(7);
    const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
    const [showHeightPicker, setShowHeightPicker] = useState(false);

    // Weight state
    const [weightKg, setWeightKg] = useState<number | null>(null);
    const [weightLbs, setWeightLbs] = useState(150);
    const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
    const [showWeightPicker, setShowWeightPicker] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const currentStep = 3;
    const totalSteps = 5;

    const saveDraft = React.useCallback(async () => {
        try {
            const hasInput = heightCm !== null || weightKg !== null ||
                (heightUnit === 'ft' && (heightFeet > 0 || heightInches > 0)) ||
                (weightUnit === 'lbs' && weightLbs > 0);

            if (!hasInput) {
                await AsyncStorage.removeItem(BODY_DRAFT_KEY);
                return;
            }

            await AsyncStorage.setItem(BODY_DRAFT_KEY, JSON.stringify({
                heightCm,
                heightFeet,
                heightInches,
                heightUnit,
                weightKg,
                weightLbs,
                weightUnit,
                savedAt: new Date().toISOString(),
            }));
        } catch (error) {
            console.warn('Failed to save body draft:', error);
        }
    }, [heightCm, heightFeet, heightInches, heightUnit, weightKg, weightLbs, weightUnit]);

    React.useEffect(() => {
        const restoreDraft = async () => {
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, '3');
            try {
                const stored = await AsyncStorage.getItem(BODY_DRAFT_KEY);
                if (stored) {
                    const draft = JSON.parse(stored);
                    if (draft.heightUnit) setHeightUnit(draft.heightUnit);
                    if (typeof draft.heightCm === 'number') setHeightCm(draft.heightCm);
                    if (typeof draft.heightFeet === 'number') setHeightFeet(draft.heightFeet);
                    if (typeof draft.heightInches === 'number') setHeightInches(draft.heightInches);
                    if (draft.weightUnit) setWeightUnit(draft.weightUnit);
                    if (typeof draft.weightKg === 'number') setWeightKg(draft.weightKg);
                    if (typeof draft.weightLbs === 'number') setWeightLbs(draft.weightLbs);
                }
            } catch (error) {
                console.warn('Failed to restore body draft:', error);
            }
        };
        restoreDraft();
    }, []);

    React.useEffect(() => {
        const timer = setTimeout(() => {
            saveDraft();
        }, 300);
        return () => clearTimeout(timer);
    }, [heightCm, heightFeet, heightInches, heightUnit, weightKg, weightLbs, weightUnit, saveDraft]);

    React.useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                saveDraft();
            }
        });
        return () => subscription?.remove();
    }, [saveDraft]);

    // Animation values
    const heightSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;
    const weightSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;

    // Animation effects
    React.useEffect(() => {
        if (showHeightPicker) {
            heightSlideAnim.setValue(Dimensions.get('window').height);
            Animated.spring(heightSlideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                stiffness: 90,
            }).start();
        }
    }, [showHeightPicker]);

    React.useEffect(() => {
        if (showWeightPicker) {
            weightSlideAnim.setValue(Dimensions.get('window').height);
            Animated.spring(weightSlideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                stiffness: 90,
            }).start();
        }
    }, [showWeightPicker]);

    const closeHeightPicker = () => {
        Animated.timing(heightSlideAnim, {
            toValue: Dimensions.get('window').height,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowHeightPicker(false));
    };

    const closeWeightPicker = () => {
        Animated.timing(weightSlideAnim, {
            toValue: Dimensions.get('window').height,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowWeightPicker(false));
    };

    // Conversion helpers
    const feetInchesToCm = (feet: number, inches: number): number => {
        return Math.round((feet * 12 + inches) * 2.54);
    };

    const cmToFeetInches = (cm: number): { feet: number; inches: number } => {
        const totalInches = cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        return { feet, inches };
    };

    const lbsToKg = (lbs: number): number => {
        return Math.round(lbs / 2.205);
    };

    const kgToLbs = (kg: number): number => {
        return Math.round(kg * 2.205);
    };

    // Get display values
    const getHeightDisplay = (): string => {
        if (heightCm === null && heightUnit === 'cm') return 'Select height';
        if (heightUnit === 'cm') {
            return `${heightCm} cm`;
        } else {
            return `${heightFeet}' ${heightInches}"`;
        }
    };

    const getWeightDisplay = (): string => {
        if (weightKg === null && weightUnit === 'kg') return 'Select weight';
        if (weightUnit === 'kg') {
            return `${weightKg} kg`;
        } else {
            return `${weightLbs} lbs`;
        }
    };

    // Handle height unit change
    const handleHeightUnitChange = (unit: 'cm' | 'ft') => {
        if (unit === heightUnit) return;

        if (unit === 'cm' && heightFeet && heightInches !== undefined) {
            // Converting from ft/in to cm
            const cm = feetInchesToCm(heightFeet, heightInches);
            setHeightCm(cm);
        } else if (unit === 'ft' && heightCm) {
            // Converting from cm to ft/in
            const { feet, inches } = cmToFeetInches(heightCm);
            setHeightFeet(feet);
            setHeightInches(inches);
        }
        setHeightUnit(unit);
    };

    // Handle weight unit change
    const handleWeightUnitChange = (unit: 'kg' | 'lbs') => {
        if (unit === weightUnit) return;

        if (unit === 'kg' && weightLbs) {
            // Converting from lbs to kg
            const kg = lbsToKg(weightLbs);
            setWeightKg(kg);
        } else if (unit === 'lbs' && weightKg) {
            // Converting from kg to lbs
            const lbs = kgToLbs(weightKg);
            setWeightLbs(lbs);
        }
        setWeightUnit(unit);
    };

    // Handle height picker done
    const handleHeightDone = () => {
        if (heightUnit === 'ft') {
            // Convert and store in cm
            const cm = feetInchesToCm(heightFeet, heightInches);
            setHeightCm(cm);
        }
        closeHeightPicker();
    };

    // Handle weight picker done
    const handleWeightDone = () => {
        if (weightUnit === 'lbs') {
            // Convert and store in kg
            const kg = lbsToKg(weightLbs);
            setWeightKg(kg);
        }
        closeWeightPicker();
    };

    const handleContinue = async () => {
        setIsLoading(true);
        try {
            if (user) {
                const updates: { height_cm?: number; weight_kg?: number } = {};

                // Always save in metric
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

                if (Object.keys(updates).length > 0) {
                    await updateUserProfile(user.id, updates);
                }
            }
            await AsyncStorage.removeItem(BODY_DRAFT_KEY);
            await AsyncStorage.setItem(ONBOARDING_STEP_KEY, '4');
            router.push('/onboarding-4' as never);
        } catch (error) {
            Alert.alert('Error', 'Failed to save your information. Please try again.');
            console.error('Error saving profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkip = () => {
        AsyncStorage.removeItem(BODY_DRAFT_KEY).catch(() => null);
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, '4').catch(() => null);
        router.push('/onboarding-4' as never);
    };

    const handleBack = () => {
        router.back();
    };

    const hasValidInput = heightCm !== null || weightKg !== null ||
        (heightUnit === 'ft' && (heightFeet > 0 || heightInches > 0)) ||
        (weightUnit === 'lbs' && weightLbs > 0);

    return (
        <View style={styles.container}>
            <ImageBackground
                source={require('../assets/images/backgrounds/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    <ScrollView
                        ref={scrollViewRef}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Back Button */}
                        <LiquidGlassIconButton size={44} onPress={handleBack}>
                            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                        </LiquidGlassIconButton>

                        {/* Progress Indicator */}
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
                                <Text style={styles.titleLabel}>OPTIONAL DETAILS</Text>
                                <Text style={styles.description}>
                                    These help personalize insights. You can skip if you prefer.
                                </Text>
                            </View>

                            {/* Form Fields */}
                            <View style={styles.formContainer}>
                                {/* Height Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Height</Text>
                                    <TouchableOpacity
                                        style={styles.dropdownContainer}
                                        onPress={() => setShowHeightPicker(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[
                                            styles.dropdownText,
                                            heightCm === null && heightUnit === 'cm' && styles.dropdownPlaceholder
                                        ]}>
                                            {getHeightDisplay()}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#878787" />
                                    </TouchableOpacity>
                                </View>

                                {/* Weight Input */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Weight</Text>
                                    <TouchableOpacity
                                        style={styles.dropdownContainer}
                                        onPress={() => setShowWeightPicker(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[
                                            styles.dropdownText,
                                            weightKg === null && weightUnit === 'kg' && styles.dropdownPlaceholder
                                        ]}>
                                            {getWeightDisplay()}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#878787" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Button Container */}
                    <View style={styles.buttonContainer}>
                        {/* Skip Button */}
                        <TouchableOpacity
                            style={styles.skipButton}
                            onPress={handleSkip}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.skipButtonText}>Skip</Text>
                        </TouchableOpacity>

                        {/* Continue Button */}
                        <TouchableOpacity
                            style={[
                                styles.continueButton,
                                !hasValidInput && styles.continueButtonMuted,
                            ]}
                            onPress={handleContinue}
                            activeOpacity={0.8}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator color={Colors.textPrimary} />
                            ) : (
                                <Text style={styles.continueButtonText}>
                                    Continue
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </ImageBackground>

            {/* Height Picker Modal */}
            <Modal
                visible={showHeightPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={closeHeightPicker}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        activeOpacity={1}
                        onPress={closeHeightPicker}
                    />
                    <Animated.View style={[
                        styles.modalBottomSheet,
                        { transform: [{ translateY: heightSlideAnim }] }
                    ]}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <TouchableOpacity
                                onPress={closeHeightPicker}
                                style={styles.modalHeaderButton}
                            >
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.modalHeaderTitle}>Height</Text>
                            <TouchableOpacity
                                onPress={handleHeightDone}
                                style={styles.modalHeaderButton}
                            >
                                <Text style={styles.modalDoneText}>Done</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Unit Toggle */}
                        <View style={styles.unitToggleContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.unitToggleButton,
                                    heightUnit === 'cm' && styles.unitToggleButtonActive
                                ]}
                                onPress={() => handleHeightUnitChange('cm')}
                            >
                                <Text style={[
                                    styles.unitToggleText,
                                    heightUnit === 'cm' && styles.unitToggleTextActive
                                ]}>cm</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.unitToggleButton,
                                    heightUnit === 'ft' && styles.unitToggleButtonActive
                                ]}
                                onPress={() => handleHeightUnitChange('ft')}
                            >
                                <Text style={[
                                    styles.unitToggleText,
                                    heightUnit === 'ft' && styles.unitToggleTextActive
                                ]}>ft / in</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Picker(s) */}
                        {heightUnit === 'cm' ? (
                            <Picker
                                selectedValue={heightCm || 170}
                                onValueChange={(value) => setHeightCm(value)}
                                style={styles.picker}
                                itemStyle={styles.pickerItem}
                            >
                                {HEIGHT_CM_OPTIONS.map((cm) => (
                                    <Picker.Item key={cm} label={`${cm} cm`} value={cm} />
                                ))}
                            </Picker>
                        ) : (
                            <View style={styles.dualPickerContainer}>
                                <Picker
                                    selectedValue={heightFeet}
                                    onValueChange={(value) => setHeightFeet(value)}
                                    style={styles.halfPicker}
                                    itemStyle={styles.pickerItem}
                                >
                                    {HEIGHT_FEET_OPTIONS.map((ft) => (
                                        <Picker.Item key={ft} label={`${ft} ft`} value={ft} />
                                    ))}
                                </Picker>
                                <Picker
                                    selectedValue={heightInches}
                                    onValueChange={(value) => setHeightInches(value)}
                                    style={styles.halfPicker}
                                    itemStyle={styles.pickerItem}
                                >
                                    {HEIGHT_INCHES_OPTIONS.map((inch) => (
                                        <Picker.Item key={inch} label={`${inch} in`} value={inch} />
                                    ))}
                                </Picker>
                            </View>
                        )}
                    </Animated.View>
                </View>
            </Modal>

            {/* Weight Picker Modal */}
            <Modal
                visible={showWeightPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={closeWeightPicker}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        activeOpacity={1}
                        onPress={closeWeightPicker}
                    />
                    <Animated.View style={[
                        styles.modalBottomSheet,
                        { transform: [{ translateY: weightSlideAnim }] }
                    ]}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <TouchableOpacity
                                onPress={closeWeightPicker}
                                style={styles.modalHeaderButton}
                            >
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.modalHeaderTitle}>Weight</Text>
                            <TouchableOpacity
                                onPress={handleWeightDone}
                                style={styles.modalHeaderButton}
                            >
                                <Text style={styles.modalDoneText}>Done</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Unit Toggle */}
                        <View style={styles.unitToggleContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.unitToggleButton,
                                    weightUnit === 'kg' && styles.unitToggleButtonActive
                                ]}
                                onPress={() => handleWeightUnitChange('kg')}
                            >
                                <Text style={[
                                    styles.unitToggleText,
                                    weightUnit === 'kg' && styles.unitToggleTextActive
                                ]}>kg</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.unitToggleButton,
                                    weightUnit === 'lbs' && styles.unitToggleButtonActive
                                ]}
                                onPress={() => handleWeightUnitChange('lbs')}
                            >
                                <Text style={[
                                    styles.unitToggleText,
                                    weightUnit === 'lbs' && styles.unitToggleTextActive
                                ]}>lbs</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Picker */}
                        {weightUnit === 'kg' ? (
                            <Picker
                                selectedValue={weightKg || 70}
                                onValueChange={(value) => setWeightKg(value)}
                                style={styles.picker}
                                itemStyle={styles.pickerItem}
                            >
                                {WEIGHT_KG_OPTIONS.map((kg) => (
                                    <Picker.Item key={kg} label={`${kg} kg`} value={kg} />
                                ))}
                            </Picker>
                        ) : (
                            <Picker
                                selectedValue={weightLbs}
                                onValueChange={(value) => setWeightLbs(value)}
                                style={styles.picker}
                                itemStyle={styles.pickerItem}
                            >
                                {WEIGHT_LBS_OPTIONS.map((lbs) => (
                                    <Picker.Item key={lbs} label={`${lbs} lbs`} value={lbs} />
                                ))}
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
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 140,
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
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    progressBar: {
        height: 2,
        borderRadius: 12,
    },
    progressBarActive: {
        backgroundColor: Colors.textPrimary,
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
        flex: 1,
    },
    titleSection: {
        marginBottom: 32,
    },
    titleLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 1.2,
        color: '#878787',
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
        backgroundColor: '#1b1b1c',
        borderWidth: 1,
        borderColor: '#313135',
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
        color: '#878787',
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
        borderColor: '#3f4243',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    skipButtonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#878787',
    },
    continueButton: {
        flex: 2,
        height: 48,
        backgroundColor: Colors.buttonPrimary,
        borderWidth: 1,
        borderColor: Colors.buttonBorder,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonMuted: {
        backgroundColor: Colors.buttonPrimary,
        opacity: 0.8,
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
        color: '#878787',
    },
    modalHeaderTitle: {
        fontFamily: fonts.medium,
        fontSize: 17,
        color: Colors.textPrimary,
    },
    modalDoneText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#3494d9',
    },
    // Unit Toggle
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
        color: '#878787',
    },
    unitToggleTextActive: {
        color: '#3494d9',
    },
    // Picker styles
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
