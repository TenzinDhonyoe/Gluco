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
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

// Biological sex options
const BIOLOGICAL_SEX_OPTIONS = [
    'Male',
    'Female',
    'Other',
    'Prefer not to say',
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];

export default function Onboarding3Screen() {
    const [birthDate, setBirthDate] = useState('');
    const [biologicalSex, setBiologicalSex] = useState('');
    const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
    const [showBiologicalSexPicker, setShowBiologicalSexPicker] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    // Date picker state
    const [selectedDay, setSelectedDay] = useState(15);
    const [selectedMonth, setSelectedMonth] = useState(11); // November (1-indexed)
    const [selectedYear, setSelectedYear] = useState(1996);
    const [activePicker, setActivePicker] = useState<'day' | 'month' | 'year' | null>(null);
    
    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const currentStep = 3;
    const totalSteps = 5;

    // Generate years (1900 to current year)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 1899 }, (_, i) => currentYear - i);
    
    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month, 0).getDate();
    };

    const handleContinue = async () => {
        if (!birthDate.trim() || !biologicalSex.trim()) return;
        
        setIsLoading(true);
        try {
            if (user) {
                // Format date for storage (YYYY-MM-DD)
                const dateForStorage = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
                await updateUserProfile(user.id, {
                    birth_date: dateForStorage,
                    biological_sex: biologicalSex.trim(),
                });
            }
            router.push('/onboarding-4' as never);
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

    const handleSelectBiologicalSex = (selectedSex: string) => {
        setBiologicalSex(selectedSex);
        setShowBiologicalSexPicker(false);
    };

    const handleOpenDatePicker = () => {
        setShowBirthDatePicker(true);
        setActivePicker(null);
    };

    const handleSaveBirthDate = () => {
        const formattedDate = `${MONTH_NAMES[selectedMonth - 1]} ${selectedDay}, ${selectedYear}`;
        setBirthDate(formattedDate);
        setShowBirthDatePicker(false);
        setActivePicker(null);
    };

    const handleCloseDatePicker = () => {
        setShowBirthDatePicker(false);
        setActivePicker(null);
    };

    const handleSelectDay = (day: number) => {
        setSelectedDay(day);
        setActivePicker(null);
    };

    const handleSelectMonth = (month: number) => {
        setSelectedMonth(month);
        // Adjust day if it exceeds the new month's max days
        const maxDays = getDaysInMonth(selectedYear, month);
        if (selectedDay > maxDays) {
            setSelectedDay(maxDays);
        }
        setActivePicker(null);
    };

    const handleSelectYear = (year: number) => {
        setSelectedYear(year);
        // Adjust day if it exceeds the new year's max days for the selected month
        const maxDays = getDaysInMonth(year, selectedMonth);
        if (selectedDay > maxDays) {
            setSelectedDay(maxDays);
        }
        setActivePicker(null);
    };

    const isContinueEnabled = birthDate.trim().length > 0 && biologicalSex.trim().length > 0;
    const daysInCurrentMonth = getDaysInMonth(selectedYear, selectedMonth);

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
                                    <Text style={styles.titleLabel}>A FEW MORE DETAILS</Text>
                                    <Text style={styles.description}>
                                        These details shape how your body responds to meals, movement, and sleep. They stay private and help Gluco fine tune your recommendations.
                                    </Text>
                                </View>

                                {/* Form Fields */}
                                <View style={styles.formContainer}>
                                    {/* Birth Date Dropdown */}
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.inputLabel}>Birth Date</Text>
                                        <TouchableOpacity
                                            style={styles.dropdownContainer}
                                            onPress={handleOpenDatePicker}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.dropdownText, !birthDate && styles.dropdownPlaceholder]}>
                                                {birthDate || 'Birth Date'}
                                            </Text>
                                            <Ionicons name="chevron-down" size={16} color="#878787" />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Biological Sex Dropdown */}
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.inputLabel}>Biological Sex</Text>
                                        <TouchableOpacity
                                            style={styles.dropdownContainer}
                                            onPress={() => setShowBiologicalSexPicker(true)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.dropdownText, !biologicalSex && styles.dropdownPlaceholder]}>
                                                {biologicalSex || 'Biological Sex'}
                                            </Text>
                                            <Ionicons name="chevron-down" size={16} color="#878787" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </ScrollView>

                        {/* Continue Button - Fixed at Bottom */}
                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.continueButton,
                                    !isContinueEnabled && styles.continueButtonDisabled,
                                ]}
                                onPress={handleContinue}
                                activeOpacity={isContinueEnabled ? 0.8 : 1}
                                disabled={!isContinueEnabled || isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color={Colors.textPrimary} />
                                ) : (
                                    <Text style={[
                                        styles.buttonText,
                                        !isContinueEnabled && styles.buttonTextDisabled,
                                    ]}>
                                        Continue
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </ImageBackground>

            {/* Biological Sex Picker Modal */}
            <Modal
                visible={showBiologicalSexPicker}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowBiologicalSexPicker(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowBiologicalSexPicker(false)}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Biological Sex</Text>
                            <TouchableOpacity
                                onPress={() => setShowBiologicalSexPicker(false)}
                                style={styles.modalCloseButton}
                            >
                                <Ionicons name="close" size={24} color={Colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalList}>
                            {BIOLOGICAL_SEX_OPTIONS.map((item) => (
                                <TouchableOpacity
                                    key={item}
                                    style={[
                                        styles.modalItem,
                                        biologicalSex === item && styles.modalItemSelected,
                                    ]}
                                    onPress={() => handleSelectBiologicalSex(item)}
                                >
                                    <Text style={[
                                        styles.modalItemText,
                                        biologicalSex === item && styles.modalItemTextSelected,
                                    ]}>
                                        {item}
                                    </Text>
                                    {biologicalSex === item && (
                                        <Ionicons name="checkmark" size={20} color={Colors.buttonPrimary} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Birth Date Picker Modal */}
            <Modal
                visible={showBirthDatePicker}
                transparent={true}
                animationType="fade"
                onRequestClose={handleCloseDatePicker}
            >
                <TouchableOpacity
                    style={styles.datePickerModalOverlay}
                    activeOpacity={1}
                    onPress={handleCloseDatePicker}
                >
                    <View 
                        style={styles.datePickerContainer}
                        onStartShouldSetResponder={() => true}
                    >
                        {/* Save Button */}
                        <View style={styles.datePickerHeader}>
                            <TouchableOpacity
                                onPress={handleSaveBirthDate}
                                style={styles.datePickerSaveButton}
                            >
                                <Text style={styles.datePickerSaveText}>Save</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Date Fields Row */}
                        <View style={styles.datePickerFields}>
                            {/* Day Field */}
                            <TouchableOpacity
                                style={[
                                    styles.datePickerField,
                                    activePicker === 'day' && styles.datePickerFieldActive,
                                ]}
                                onPress={() => setActivePicker(activePicker === 'day' ? null : 'day')}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.datePickerFieldText}>{selectedDay}</Text>
                            </TouchableOpacity>

                            {/* Month Field */}
                            <TouchableOpacity
                                style={[
                                    styles.datePickerField,
                                    styles.datePickerFieldFlex,
                                    activePicker === 'month' && styles.datePickerFieldActive,
                                ]}
                                onPress={() => setActivePicker(activePicker === 'month' ? null : 'month')}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.datePickerFieldText}>{MONTH_NAMES[selectedMonth - 1]}</Text>
                            </TouchableOpacity>

                            {/* Year Field */}
                            <TouchableOpacity
                                style={[
                                    styles.datePickerField,
                                    activePicker === 'year' && styles.datePickerFieldActive,
                                ]}
                                onPress={() => setActivePicker(activePicker === 'year' ? null : 'year')}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.datePickerFieldText}>{selectedYear}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Day Selection Grid */}
                        {activePicker === 'day' && (
                            <View style={styles.selectionContainer}>
                                <ScrollView 
                                    style={styles.selectionScroll}
                                    showsVerticalScrollIndicator={true}
                                >
                                    <View style={styles.dayGrid}>
                                        {Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1).map((day) => (
                                            <TouchableOpacity
                                                key={day}
                                                style={[
                                                    styles.dayItem,
                                                    selectedDay === day && styles.dayItemSelected,
                                                ]}
                                                onPress={() => handleSelectDay(day)}
                                            >
                                                <Text style={[
                                                    styles.dayItemText,
                                                    selectedDay === day && styles.dayItemTextSelected,
                                                ]}>
                                                    {day}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>
                        )}

                        {/* Month Selection List */}
                        {activePicker === 'month' && (
                            <View style={styles.selectionContainer}>
                                <ScrollView 
                                    style={styles.selectionScroll}
                                    showsVerticalScrollIndicator={true}
                                >
                                    {MONTH_NAMES.map((month, index) => (
                                        <TouchableOpacity
                                            key={month}
                                            style={[
                                                styles.selectionItem,
                                                selectedMonth === index + 1 && styles.selectionItemSelected,
                                            ]}
                                            onPress={() => handleSelectMonth(index + 1)}
                                        >
                                            <Text style={[
                                                styles.selectionItemText,
                                                selectedMonth === index + 1 && styles.selectionItemTextSelected,
                                            ]}>
                                                {month}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {/* Year Selection List */}
                        {activePicker === 'year' && (
                            <View style={styles.selectionContainer}>
                                <ScrollView 
                                    style={styles.selectionScroll}
                                    showsVerticalScrollIndicator={true}
                                >
                                    {years.map((year) => (
                                        <TouchableOpacity
                                            key={year}
                                            style={[
                                                styles.selectionItem,
                                                selectedYear === year && styles.selectionItemSelected,
                                            ]}
                                            onPress={() => handleSelectYear(year)}
                                        >
                                            <Text style={[
                                                styles.selectionItemText,
                                                selectedYear === year && styles.selectionItemTextSelected,
                                            ]}>
                                                {year}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
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
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 200,
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
        marginBottom: 24,
    },
    progressBar: {
        height: 2,
        borderRadius: 12,
    },
    progressBarSpacing: {
        marginRight: 5,
    },
    progressBarActive: {
        backgroundColor: Colors.textPrimary,
        width: 68,
    },
    progressBarInactive: {
        backgroundColor: '#878787',
        width: 68,
    },
    content: {
        width: 361,
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
        lineHeight: 16 * 1.2,
        color: Colors.textPrimary,
    },
    formContainer: {},
    inputGroup: {
        marginBottom: 24,
    },
    inputLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 0.95,
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
        paddingHorizontal: 0,
    },
    continueButton: {
        width: '100%',
        height: 48,
        backgroundColor: Colors.buttonPrimary,
        borderWidth: 1,
        borderColor: Colors.buttonBorder,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonDisabled: {
        backgroundColor: '#3f4243',
        borderColor: '#3f4243',
    },
    buttonText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        lineHeight: 15 * 0.95,
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
    // Date Picker styles - Matching Figma Design
    datePickerModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    datePickerContainer: {
        backgroundColor: 'rgba(63, 66, 67, 0.95)',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 20,
        width: 326,
    },
    datePickerHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 24,
    },
    datePickerSaveButton: {
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    datePickerSaveText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        lineHeight: 16 * 0.95,
        color: '#3494d9',
    },
    datePickerFields: {
        flexDirection: 'row',
        gap: 8,
    },
    datePickerField: {
        backgroundColor: '#1b1b1c',
        borderWidth: 1,
        borderColor: '#313135',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
        width: 67,
        alignItems: 'center',
        justifyContent: 'center',
    },
    datePickerFieldFlex: {
        flex: 1,
        width: 'auto',
    },
    datePickerFieldActive: {
        borderColor: '#3494d9',
    },
    datePickerFieldText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        lineHeight: 16 * 0.95,
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    // Selection container for day/month/year lists
    selectionContainer: {
        marginTop: 16,
        backgroundColor: '#1b1b1c',
        borderRadius: 8,
        maxHeight: 200,
        overflow: 'hidden',
    },
    selectionScroll: {
        maxHeight: 200,
    },
    selectionItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#313135',
    },
    selectionItemSelected: {
        backgroundColor: 'rgba(52, 148, 217, 0.2)',
    },
    selectionItemText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    selectionItemTextSelected: {
        color: '#3494d9',
        fontFamily: fonts.medium,
    },
    // Day grid for calendar-like display
    dayGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 8,
    },
    dayItem: {
        width: '14.28%', // 7 days per row
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
    },
    dayItemSelected: {
        backgroundColor: 'rgba(52, 148, 217, 0.3)',
    },
    dayItemText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    dayItemTextSelected: {
        color: '#3494d9',
        fontFamily: fonts.medium,
    },
});
