import { ONBOARDING_STEP_KEY } from '@/app/index';
import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { useOnboardingDraft } from '@/hooks/useOnboardingDraft';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { useSharedValue, withSpring, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const REGIONS = [
    'United States', 'Canada', 'United Kingdom', 'Australia',
    'Germany', 'France', 'Spain', 'Italy', 'Netherlands',
    'Sweden', 'Norway', 'Denmark', 'Japan', 'South Korea',
    'Singapore', 'India', 'Brazil', 'Mexico', 'Other',
];

const BIOLOGICAL_SEX_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const SCREEN_HEIGHT = 800; // Approximate; used for offscreen position

export default function OnboardingProfileScreen() {
    const { draft, updateDraft, isLoaded } = useOnboardingDraft();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [region, setRegion] = useState('');
    const [birthDate, setBirthDate] = useState<Date | null>(null);
    const [birthDateDisplay, setBirthDateDisplay] = useState('');
    const [biologicalSex, setBiologicalSex] = useState('');
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showBiologicalSexPicker, setShowBiologicalSexPicker] = useState(false);
    const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user, signOut } = useAuth();
    const draftRestored = React.useRef(false);

    // Reanimated shared values for picker animations
    const regionSlide = useSharedValue(SCREEN_HEIGHT);
    const sexSlide = useSharedValue(SCREEN_HEIGHT);
    const birthDateSlide = useSharedValue(SCREEN_HEIGHT);

    const regionAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: regionSlide.value }],
    }));
    const sexAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sexSlide.value }],
    }));
    const birthDateAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: birthDateSlide.value }],
    }));

    // Restore draft once loaded
    React.useEffect(() => {
        if (!isLoaded || draftRestored.current) return;
        draftRestored.current = true;
        if (draft.firstName) setFirstName(draft.firstName);
        if (draft.lastName) setLastName(draft.lastName);
        if (draft.region) setRegion(draft.region);
        if (draft.biologicalSex) setBiologicalSex(draft.biologicalSex);
        if (draft.birthDate) {
            const parsed = new Date(draft.birthDate);
            if (!isNaN(parsed.getTime())) {
                setBirthDate(parsed);
                setBirthDateDisplay(`${MONTH_NAMES[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`);
            }
        }
        AsyncStorage.setItem(ONBOARDING_STEP_KEY, 'profile').catch(() => null);
    }, [isLoaded, draft]);

    // Save to draft on changes
    React.useEffect(() => {
        if (!draftRestored.current) return;
        const timer = setTimeout(() => {
            updateDraft({
                firstName, lastName, region, biologicalSex,
                birthDate: birthDate ? birthDate.toISOString() : null,
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [firstName, lastName, region, biologicalSex, birthDate, updateDraft]);

    // Picker open/close handlers
    const openRegionPicker = () => {
        triggerHaptic();
        setShowRegionPicker(true);
        regionSlide.value = SCREEN_HEIGHT;
        regionSlide.value = withSpring(0, { damping: 20, stiffness: 90 });
    };
    const closeRegionPicker = () => {
        regionSlide.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => {});
        setTimeout(() => setShowRegionPicker(false), 260);
    };

    const openSexPicker = () => {
        triggerHaptic();
        setShowBiologicalSexPicker(true);
        sexSlide.value = SCREEN_HEIGHT;
        sexSlide.value = withSpring(0, { damping: 20, stiffness: 90 });
    };
    const closeSexPicker = () => {
        sexSlide.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        setTimeout(() => setShowBiologicalSexPicker(false), 260);
    };

    const openDatePicker = () => {
        triggerHaptic();
        setShowBirthDatePicker(true);
        birthDateSlide.value = SCREEN_HEIGHT;
        birthDateSlide.value = withSpring(0, { damping: 20, stiffness: 90 });
    };
    const closeDatePicker = () => {
        birthDateSlide.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        setTimeout(() => setShowBirthDatePicker(false), 260);
    };

    const handleDateChange = (_event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowBirthDatePicker(false);
        }
        if (selectedDate) {
            setBirthDate(selectedDate);
            setBirthDateDisplay(`${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`);
        }
    };

    const handleContinue = async () => {
        if (!firstName.trim() || !lastName.trim()) return;
        triggerHaptic('medium');
        setIsLoading(true);
        try {
            if (user) {
                let dateForStorage: string | null = null;
                if (birthDate) {
                    const year = birthDate.getFullYear();
                    const month = String(birthDate.getMonth() + 1).padStart(2, '0');
                    const day = String(birthDate.getDate()).padStart(2, '0');
                    dateForStorage = `${year}-${month}-${day}`;
                }
                await updateUserProfile(user.id, {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    birth_date: dateForStorage,
                    biological_sex: biologicalSex.trim() || null,
                    region: region.trim() || null,
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
    const defaultDate = birthDate || new Date(new Date().getFullYear() - 30, 0, 1);
    const maxDate = new Date();
    const minDate = new Date(1900, 0, 1);

    return (
        <View style={styles.container}>
            <ForestGlassBackground blurIntensity={18} />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <OnboardingHeader currentStep={1} totalSteps={6} onBack={handleBack} />

                    <View style={styles.content}>
                        <View style={styles.titleSection}>
                            <Text style={styles.titleLabel}>A BIT ABOUT YOU</Text>
                            <Text style={styles.description}>
                                This helps us personalize your experience.
                            </Text>
                        </View>

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

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Birth Date <Text style={styles.optionalLabel}>(optional)</Text></Text>
                                <TouchableOpacity
                                    style={styles.dropdownContainer}
                                    onPress={openDatePicker}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.dropdownText, !birthDateDisplay && styles.dropdownPlaceholder]}>
                                        {birthDateDisplay || 'Select birth date'}
                                    </Text>
                                    <Ionicons name="chevron-down" size={16} color={Colors.textTertiary} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Biological Sex <Text style={styles.optionalLabel}>(optional)</Text></Text>
                                <TouchableOpacity
                                    style={styles.dropdownContainer}
                                    onPress={openSexPicker}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.dropdownText, !biologicalSex && styles.dropdownPlaceholder]}>
                                        {biologicalSex || 'Select or skip'}
                                    </Text>
                                    <Ionicons name="chevron-down" size={16} color={Colors.textTertiary} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Region <Text style={styles.optionalLabel}>(optional)</Text></Text>
                                <TouchableOpacity
                                    style={styles.dropdownContainer}
                                    onPress={openRegionPicker}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.dropdownText, !region && styles.dropdownPlaceholder]}>
                                        {region || 'Select or skip'}
                                    </Text>
                                    <Ionicons name="chevron-down" size={16} color={Colors.textTertiary} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </ScrollView>

                <View style={styles.buttonContainer}>
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
                </View>
            </SafeAreaView>

            {/* Region Picker */}
            <Modal visible={showRegionPicker} transparent animationType="fade" onRequestClose={closeRegionPicker}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeRegionPicker} />
                    <Animated.View style={[styles.modalBottomSheet, regionAnimStyle]}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={closeRegionPicker} style={styles.modalHeaderButton}>
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.modalHeaderTitle}>Region</Text>
                            <TouchableOpacity onPress={closeRegionPicker} style={styles.modalHeaderButton}>
                                <Text style={styles.modalDoneText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                        <Picker
                            selectedValue={region || REGIONS[0]}
                            onValueChange={(value) => setRegion(value)}
                            style={styles.picker}
                            itemStyle={styles.pickerItem}
                        >
                            {REGIONS.map((item) => (
                                <Picker.Item key={item} label={item} value={item} />
                            ))}
                        </Picker>
                    </Animated.View>
                </View>
            </Modal>

            {/* Biological Sex Picker */}
            <Modal visible={showBiologicalSexPicker} transparent animationType="fade" onRequestClose={closeSexPicker}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeSexPicker} />
                    <Animated.View style={[styles.modalBottomSheet, sexAnimStyle]}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={closeSexPicker} style={styles.modalHeaderButton}>
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.modalHeaderTitle}>Biological Sex</Text>
                            <TouchableOpacity onPress={closeSexPicker} style={styles.modalHeaderButton}>
                                <Text style={styles.modalDoneText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                        <Picker
                            selectedValue={biologicalSex || BIOLOGICAL_SEX_OPTIONS[0]}
                            onValueChange={(value) => setBiologicalSex(value)}
                            style={styles.picker}
                            itemStyle={styles.pickerItem}
                        >
                            {BIOLOGICAL_SEX_OPTIONS.map((item) => (
                                <Picker.Item key={item} label={item} value={item} />
                            ))}
                        </Picker>
                    </Animated.View>
                </View>
            </Modal>

            {/* Birth Date Picker */}
            {showBirthDatePicker && (
                <Modal visible={showBirthDatePicker} transparent animationType="fade" onRequestClose={closeDatePicker}>
                    <View style={styles.modalOverlay}>
                        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeDatePicker} />
                        <Animated.View style={[styles.modalBottomSheet, birthDateAnimStyle]}>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity onPress={closeDatePicker} style={styles.modalHeaderButton}>
                                    <Text style={styles.modalCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <Text style={styles.modalHeaderTitle}>Birth Date</Text>
                                <TouchableOpacity onPress={closeDatePicker} style={styles.modalHeaderButton}>
                                    <Text style={styles.modalDoneText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={defaultDate}
                                mode="date"
                                display="spinner"
                                onChange={handleDateChange}
                                maximumDate={maxDate}
                                minimumDate={minDate}
                                style={styles.datePicker}
                                textColor={Colors.textPrimary}
                                themeVariant="light"
                            />
                        </Animated.View>
                    </View>
                </Modal>
            )}
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
        paddingBottom: 120,
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
    optionalLabel: {
        color: Colors.textTertiary,
        fontFamily: fonts.regular,
    },
    textInput: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
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
    buttonContainer: {
        position: 'absolute',
        bottom: 42,
        left: 16,
        right: 16,
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
        backgroundColor: Colors.backgroundCard,
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
        borderBottomColor: Colors.border,
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
    picker: {
        height: 216,
        backgroundColor: Colors.backgroundCard,
    },
    pickerItem: {
        color: Colors.textPrimary,
        fontSize: 22,
    },
    datePicker: {
        height: 216,
        backgroundColor: Colors.backgroundCard,
    },
});
