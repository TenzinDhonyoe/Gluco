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
    Animated,
    Dimensions,
    ImageBackground,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// Regions list
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

// Biological sex options
const BIOLOGICAL_SEX_OPTIONS = [
    'Male',
    'Female',
    'Other',
    'Prefer not to say',
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

export default function Onboarding2Screen() {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [region, setRegion] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [biologicalSex, setBiologicalSex] = useState('');
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showBiologicalSexPicker, setShowBiologicalSexPicker] = useState(false);
    const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Date picker state
    const [selectedDay, setSelectedDay] = useState(15);
    const [selectedMonth, setSelectedMonth] = useState(11);
    const [selectedYear, setSelectedYear] = useState(1996);
    const [activePicker, setActivePicker] = useState<'day' | 'month' | 'year' | null>(null);

    // Animation values
    const regionSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;
    const sexSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;
    const dateSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;

    React.useEffect(() => {
        if (showRegionPicker) {
            regionSlideAnim.setValue(Dimensions.get('window').height);
            Animated.spring(regionSlideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                stiffness: 90,
            }).start();
        }
    }, [showRegionPicker]);

    React.useEffect(() => {
        if (showBiologicalSexPicker) {
            sexSlideAnim.setValue(Dimensions.get('window').height);
            Animated.spring(sexSlideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                stiffness: 90,
            }).start();
        }
    }, [showBiologicalSexPicker]);

    React.useEffect(() => {
        if (showBirthDatePicker) {
            dateSlideAnim.setValue(Dimensions.get('window').height);
            Animated.spring(dateSlideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                stiffness: 90,
            }).start();
        }
    }, [showBirthDatePicker]);

    const closeRegionPicker = () => {
        Animated.timing(regionSlideAnim, {
            toValue: Dimensions.get('window').height,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowRegionPicker(false));
    };

    const closeSexPicker = () => {
        Animated.timing(sexSlideAnim, {
            toValue: Dimensions.get('window').height,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowBiologicalSexPicker(false));
    };

    const closeDatePicker = () => {
        Animated.timing(dateSlideAnim, {
            toValue: Dimensions.get('window').height,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setShowBirthDatePicker(false);
            setActivePicker(null);
        });
    };

    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user } = useAuth();
    const currentStep = 1;
    const totalSteps = 5;

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 1899 }, (_, i) => currentYear - i);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month, 0).getDate();
    };

    const handleContinue = async () => {
        if (!firstName.trim() || !lastName.trim()) return;

        setIsLoading(true);
        try {
            if (user) {
                const dateForStorage = birthDate ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}` : null;
                await updateUserProfile(user.id, {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    birth_date: dateForStorage,
                    biological_sex: biologicalSex.trim() || null,
                    region: region.trim() || null,
                });
            }
            router.push('/onboarding-1' as never);
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
        closeRegionPicker();
    };

    const handleSelectBiologicalSex = (selected: string) => {
        setBiologicalSex(selected);
        closeSexPicker();
    };

    const handleOpenDatePicker = () => {
        setShowBirthDatePicker(true);
        setActivePicker(null);
    };

    const handleSaveBirthDate = () => {
        const formattedDate = `${MONTH_NAMES[selectedMonth - 1]} ${selectedDay}, ${selectedYear}`;
        setBirthDate(formattedDate);
        closeDatePicker();
    };

    const handleCloseDatePicker = () => {
        closeDatePicker();
    };

    const handleSelectDay = (day: number) => {
        setSelectedDay(day);
        setActivePicker(null);
    };

    const handleSelectMonth = (month: number) => {
        setSelectedMonth(month);
        const maxDays = getDaysInMonth(selectedYear, month);
        if (selectedDay > maxDays) {
            setSelectedDay(maxDays);
        }
        setActivePicker(null);
    };

    const handleSelectYear = (year: number) => {
        setSelectedYear(year);
        const maxDays = getDaysInMonth(year, selectedMonth);
        if (selectedDay > maxDays) {
            setSelectedDay(maxDays);
        }
        setActivePicker(null);
    };

    // Auto-select item based on scroll position (48px item height)
    const ITEM_HEIGHT = 48;

    const handleRegionScroll = (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / ITEM_HEIGHT);
        if (index >= 0 && index < REGIONS.length) {
            setRegion(REGIONS[index]);
        }
    };

    const handleBiologicalSexScroll = (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / ITEM_HEIGHT);
        if (index >= 0 && index < BIOLOGICAL_SEX_OPTIONS.length) {
            setBiologicalSex(BIOLOGICAL_SEX_OPTIONS[index]);
        }
    };

    const handleMonthScroll = (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / 44); // 44px for date picker items
        if (index >= 0 && index < 12) {
            setSelectedMonth(index + 1);
        }
    };

    const handleDayScroll = (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / 44);
        if (index >= 0 && index < daysInCurrentMonth) {
            setSelectedDay(index + 1);
        }
    };

    const handleYearScroll = (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / 44);
        if (index >= 0 && index < years.length) {
            setSelectedYear(years[index]);
        }
    };

    const handleAgeScroll = (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / ITEM_HEIGHT);
        const age = index + 18;
        if (age >= 18 && age <= 99) {
            setSelectedYear(new Date().getFullYear() - age);
        }
    };

    const isContinueEnabled = firstName.trim().length > 0 && lastName.trim().length > 0;
    const daysInCurrentMonth = getDaysInMonth(selectedYear, selectedMonth);

    return (
        <View style={styles.container}>
            <ImageBackground
                source={require('../assets/images/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    <ScrollView
                        ref={scrollViewRef}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Back Button */}
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={handleBack}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                        </TouchableOpacity>

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
                                <Text style={styles.titleLabel}>A BIT ABOUT YOU</Text>
                                <Text style={styles.description}>
                                    This helps us personalize your experience.
                                </Text>
                            </View>

                            {/* Form Fields */}
                            <View style={styles.formContainer}>
                                {/* First Name */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>First Name</Text>
                                    <TextInput
                                        style={styles.textInput}
                                        placeholder="Enter your first name"
                                        placeholderTextColor="#878787"
                                        value={firstName}
                                        onChangeText={setFirstName}
                                        autoCapitalize="words"
                                        autoCorrect={false}
                                    />
                                </View>

                                {/* Last Name */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Last Name</Text>
                                    <TextInput
                                        style={styles.textInput}
                                        placeholder="Enter your last name"
                                        placeholderTextColor="#878787"
                                        value={lastName}
                                        onChangeText={setLastName}
                                        autoCapitalize="words"
                                        autoCorrect={false}
                                    />
                                </View>

                                {/* Birth Date (Optional) */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Birth Date <Text style={styles.optionalLabel}>(optional)</Text></Text>
                                    <TouchableOpacity
                                        style={styles.dropdownContainer}
                                        onPress={handleOpenDatePicker}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.dropdownText, !birthDate && styles.dropdownPlaceholder]}>
                                            {birthDate || 'Select birth date'}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#878787" />
                                    </TouchableOpacity>
                                </View>

                                {/* Biological Sex (Optional) */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Biological Sex <Text style={styles.optionalLabel}>(optional)</Text></Text>
                                    <TouchableOpacity
                                        style={styles.dropdownContainer}
                                        onPress={() => setShowBiologicalSexPicker(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.dropdownText, !biologicalSex && styles.dropdownPlaceholder]}>
                                            {biologicalSex || 'Select or skip'}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#878787" />
                                    </TouchableOpacity>
                                </View>

                                {/* Region (Optional) */}
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Region <Text style={styles.optionalLabel}>(optional)</Text></Text>
                                    <TouchableOpacity
                                        style={styles.dropdownContainer}
                                        onPress={() => setShowRegionPicker(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.dropdownText, !region && styles.dropdownPlaceholder]}>
                                            {region || 'Select or skip'}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#878787" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Continue Button */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[
                                styles.continueButton,
                                !isContinueEnabled && styles.continueButtonDisabled,
                            ]}
                            onPress={handleContinue}
                            activeOpacity={0.8}
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
                </SafeAreaView>
            </ImageBackground>

            {/* Region Picker - Wheel Style Bottom Sheet */}
            <Modal
                visible={showRegionPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={closeRegionPicker}
            >
                <View style={styles.wheelModalOverlay}>
                    <TouchableOpacity
                        style={styles.wheelModalBackdrop}
                        activeOpacity={1}
                        onPress={closeRegionPicker}
                    />
                    <Animated.View style={[
                        styles.wheelModalSheet,
                        { transform: [{ translateY: regionSlideAnim }] }
                    ]}>
                        {/* Handle */}
                        <View style={styles.wheelModalHandle} />

                        {/* Header */}
                        <Text style={styles.wheelModalTitle}>Select Region</Text>
                        <Text style={styles.wheelModalSubtitle}>Choose your region</Text>

                        {/* Wheel Picker */}
                        <View style={styles.singleWheelContainer}>
                            <View style={styles.singleWheelIndicator} />
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                snapToInterval={48}
                                decelerationRate="fast"
                                contentContainerStyle={styles.singleWheelContent}
                                onMomentumScrollEnd={handleRegionScroll}
                            >
                                {REGIONS.map((item) => (
                                    <TouchableOpacity
                                        key={item}
                                        style={styles.singleWheelItem}
                                        onPress={() => setRegion(item)}
                                    >
                                        <Text style={[
                                            styles.singleWheelItemText,
                                            region === item && styles.singleWheelItemTextSelected,
                                        ]}>
                                            {item}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Confirm Button */}
                        <TouchableOpacity
                            style={styles.wheelConfirmButton}
                            onPress={closeRegionPicker}
                        >
                            <Text style={styles.wheelConfirmButtonText}>Confirm</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>

            {/* Biological Sex Picker - Wheel Style Bottom Sheet */}
            <Modal
                visible={showBiologicalSexPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={closeSexPicker}
            >
                <View style={styles.wheelModalOverlay}>
                    <TouchableOpacity
                        style={styles.wheelModalBackdrop}
                        activeOpacity={1}
                        onPress={closeSexPicker}
                    />
                    <Animated.View style={[
                        styles.wheelModalSheet,
                        { transform: [{ translateY: sexSlideAnim }] }
                    ]}>
                        {/* Handle */}
                        <View style={styles.wheelModalHandle} />

                        {/* Header */}
                        <Text style={styles.wheelModalTitle}>Select Biological Sex</Text>
                        <Text style={styles.wheelModalSubtitle}>This is optional</Text>

                        {/* Wheel Picker */}
                        <View style={styles.singleWheelContainer}>
                            <View style={styles.singleWheelIndicator} />
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                snapToInterval={48}
                                decelerationRate="fast"
                                contentContainerStyle={styles.singleWheelContent}
                                onMomentumScrollEnd={handleBiologicalSexScroll}
                            >
                                {BIOLOGICAL_SEX_OPTIONS.map((item) => (
                                    <TouchableOpacity
                                        key={item}
                                        style={styles.singleWheelItem}
                                        onPress={() => setBiologicalSex(item)}
                                    >
                                        <Text style={[
                                            styles.singleWheelItemText,
                                            biologicalSex === item && styles.singleWheelItemTextSelected,
                                        ]}>
                                            {item}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Confirm Button */}
                        <TouchableOpacity
                            style={styles.wheelConfirmButton}
                            onPress={closeSexPicker}
                        >
                            <Text style={styles.wheelConfirmButtonText}>Confirm</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>

            {/* Birth Date Picker - Bottom Sheet with Wheel Picker */}
            <Modal
                visible={showBirthDatePicker}
                transparent={true}
                animationType="fade"
                onRequestClose={closeDatePicker}
            >
                <View style={styles.datePickerModalOverlay}>
                    <TouchableOpacity
                        style={styles.datePickerBackdrop}
                        activeOpacity={1}
                        onPress={closeDatePicker}
                    />
                    <Animated.View style={[
                        styles.datePickerBottomSheet,
                        { transform: [{ translateY: dateSlideAnim }] }
                    ]}>
                        {/* Header */}
                        <View style={styles.datePickerHeader}>
                            <TouchableOpacity
                                onPress={handleCloseDatePicker}
                                style={styles.datePickerHeaderButton}
                            >
                                <Text style={styles.datePickerCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.datePickerHeaderTitle}>Birth Date</Text>
                            <TouchableOpacity
                                onPress={handleSaveBirthDate}
                                style={styles.datePickerHeaderButton}
                            >
                                <Text style={styles.datePickerSaveText}>Done</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Wheel Picker Container */}
                        <View style={styles.wheelPickerContainer}>
                            {/* Selection Indicator (highlighted row) */}
                            <View style={styles.wheelSelectionIndicator} pointerEvents="none" />

                            {/* Month Column */}
                            <View style={styles.wheelColumn}>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={44}
                                    decelerationRate="fast"
                                    contentContainerStyle={styles.wheelScrollContent}
                                    onMomentumScrollEnd={handleMonthScroll}
                                >
                                    {MONTH_NAMES.map((month, index) => (
                                        <TouchableOpacity
                                            key={month}
                                            style={styles.wheelItem}
                                            onPress={() => handleSelectMonth(index + 1)}
                                        >
                                            <Text style={[
                                                styles.wheelItemText,
                                                selectedMonth === index + 1 && styles.wheelItemTextSelected,
                                            ]}>
                                                {month}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* Day Column */}
                            <View style={styles.wheelColumnSmall}>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={44}
                                    decelerationRate="fast"
                                    contentContainerStyle={styles.wheelScrollContent}
                                    onMomentumScrollEnd={handleDayScroll}
                                >
                                    {Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1).map((day) => (
                                        <TouchableOpacity
                                            key={day}
                                            style={styles.wheelItem}
                                            onPress={() => handleSelectDay(day)}
                                        >
                                            <Text style={[
                                                styles.wheelItemText,
                                                selectedDay === day && styles.wheelItemTextSelected,
                                            ]}>
                                                {day}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* Year Column */}
                            <View style={styles.wheelColumnSmall}>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={44}
                                    decelerationRate="fast"
                                    contentContainerStyle={styles.wheelScrollContent}
                                    onMomentumScrollEnd={handleYearScroll}
                                >
                                    {years.map((year) => (
                                        <TouchableOpacity
                                            key={year}
                                            style={styles.wheelItem}
                                            onPress={() => handleSelectYear(year)}
                                        >
                                            <Text style={[
                                                styles.wheelItemText,
                                                selectedYear === year && styles.wheelItemTextSelected,
                                            ]}>
                                                {year}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>

                        {/* Age Column */}
                        <View style={styles.ageWheelSection}>
                            <Text style={styles.ageWheelLabel}>Or select your age:</Text>
                            <View style={styles.ageWheelContainer}>
                                <View style={styles.ageWheelIndicator} />
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={48}
                                    decelerationRate="fast"
                                    contentContainerStyle={styles.ageWheelContent}
                                    horizontal={false}
                                    onMomentumScrollEnd={handleAgeScroll}
                                >
                                    {Array.from({ length: 82 }, (_, i) => i + 18).map((age) => {
                                        const yearForAge = new Date().getFullYear() - age;
                                        return (
                                            <TouchableOpacity
                                                key={age}
                                                style={styles.ageWheelItem}
                                                onPress={() => handleSelectYear(yearForAge)}
                                            >
                                                <Text style={[
                                                    styles.ageWheelItemText,
                                                    selectedYear === yearForAge && styles.ageWheelItemTextSelected,
                                                ]}>
                                                    {age}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </View>
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
        paddingBottom: 120,
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
    optionalLabel: {
        color: '#878787',
        fontFamily: fonts.regular,
    },
    textInput: {
        backgroundColor: '#1b1b1c',
        borderWidth: 1,
        borderColor: '#313135',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
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
        color: Colors.textPrimary,
    },
    buttonTextDisabled: {
        color: '#878787',
    },
    sheetTitle: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    // Date picker styles
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(63, 66, 67, 0.5)',
    },
    datePickerSaveButton: {
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    datePickerSaveText: {
        fontFamily: fonts.medium,
        fontSize: 16,
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
        color: Colors.textPrimary,
        textAlign: 'center',
    },
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
    dayGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 8,
    },
    dayItem: {
        width: '14.28%',
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
    // New wheel picker styles
    datePickerBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    datePickerBottomSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 34,
    },
    datePickerHeaderButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    datePickerCancelText: {
        fontFamily: fonts.regular,
        fontSize: 17,
        color: '#878787',
    },
    datePickerHeaderTitle: {
        fontFamily: fonts.medium,
        fontSize: 17,
        color: Colors.textPrimary,
    },
    wheelPickerContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 20,
        height: 220,
        position: 'relative',
    },
    wheelSelectionIndicator: {
        position: 'absolute',
        left: 16,
        right: 16,
        top: '50%',
        height: 44,
        marginTop: -22,
        backgroundColor: 'rgba(63, 66, 67, 0.6)',
        borderRadius: 10,
    },
    wheelColumn: {
        flex: 2,
        height: '100%',
        overflow: 'hidden',
    },
    wheelColumnSmall: {
        flex: 1,
        height: '100%',
        overflow: 'hidden',
    },
    wheelScrollContent: {
        paddingVertical: 88,
    },
    wheelItem: {
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    wheelItemText: {
        fontFamily: fonts.regular,
        fontSize: 20,
        color: '#878787',
    },
    wheelItemTextSelected: {
        fontFamily: fonts.medium,
        color: Colors.textPrimary,
    },
    quickAgeContainer: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    quickAgeLabel: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginBottom: 12,
    },
    quickAgeButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    quickAgeButton: {
        flex: 1,
        paddingVertical: 10,
        backgroundColor: 'rgba(63, 66, 67, 0.5)',
        borderRadius: 8,
        alignItems: 'center',
    },
    quickAgeButtonSelected: {
        backgroundColor: Colors.buttonPrimary,
    },
    quickAgeButtonText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#878787',
    },
    quickAgeButtonTextSelected: {
        color: Colors.textPrimary,
    },
    // Wheel Modal Styles (for Region, Biological Sex pickers)
    wheelModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    wheelModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    wheelModalSheet: {
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
        paddingTop: 12,
    },
    wheelModalHandle: {
        width: 40,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 2.5,
        alignSelf: 'center',
        marginBottom: 16,
    },
    wheelModalTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 22,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 4,
    },
    wheelModalSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: '#878787',
        textAlign: 'center',
        marginBottom: 24,
    },
    singleWheelContainer: {
        height: 200,
        marginHorizontal: 16,
        position: 'relative',
    },
    singleWheelIndicator: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        height: 48,
        marginTop: -24,
        backgroundColor: 'rgba(63, 66, 67, 0.6)',
        borderRadius: 12,
    },
    singleWheelContent: {
        paddingVertical: 76,
    },
    singleWheelItem: {
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    singleWheelItemText: {
        fontFamily: fonts.regular,
        fontSize: 20,
        color: '#878787',
    },
    singleWheelItemTextSelected: {
        fontFamily: fonts.semiBold,
        color: Colors.textPrimary,
        fontSize: 22,
    },
    wheelConfirmButton: {
        marginHorizontal: 16,
        marginTop: 24,
        height: 52,
        backgroundColor: Colors.buttonPrimary,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    wheelConfirmButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: Colors.textPrimary,
    },
    // Age Wheel Section (in Birth Date picker)
    ageWheelSection: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    ageWheelLabel: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        marginBottom: 12,
        textAlign: 'center',
    },
    ageWheelContainer: {
        height: 150,
        position: 'relative',
    },
    ageWheelIndicator: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        height: 48,
        marginTop: -24,
        backgroundColor: 'rgba(63, 66, 67, 0.6)',
        borderRadius: 12,
    },
    ageWheelContent: {
        paddingVertical: 51,
    },
    ageWheelItem: {
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ageWheelItemText: {
        fontFamily: fonts.regular,
        fontSize: 20,
        color: '#878787',
    },
    ageWheelItemTextSelected: {
        fontFamily: fonts.semiBold,
        color: Colors.textPrimary,
        fontSize: 22,
    },
});

