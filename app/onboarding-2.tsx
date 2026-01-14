import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { updateUserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    ImageBackground,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    const [birthDate, setBirthDate] = useState<Date | null>(null);
    const [birthDateDisplay, setBirthDateDisplay] = useState('');
    const [biologicalSex, setBiologicalSex] = useState('');
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showBiologicalSexPicker, setShowBiologicalSexPicker] = useState(false);
    const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Animation values
    const regionSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;
    const sexSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;
    const birthDateSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;

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
            birthDateSlideAnim.setValue(Dimensions.get('window').height);
            Animated.spring(birthDateSlideAnim, {
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

    const scrollViewRef = React.useRef<ScrollView>(null);
    const { user, signOut } = useAuth();
    const currentStep = 1;
    const totalSteps = 5;

    const handleContinue = async () => {
        if (!firstName.trim() || !lastName.trim()) return;

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
            router.push('/onboarding-1' as never);
        } catch (error) {
            Alert.alert('Error', 'Failed to save your information. Please try again.');
            console.error('Error saving profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = async () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            // If we can't go back, it means we're at the start of the flow (from replace)
            // So we should sign out and go to welcome screen
            await signOut();
            router.replace('/');
        }
    };

    const handleSelectRegion = (selectedRegion: string) => {
        setRegion(selectedRegion);
        closeRegionPicker();
    };

    const handleSelectBiologicalSex = (selected: string) => {
        setBiologicalSex(selected);
        closeSexPicker();
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowBirthDatePicker(false);
        }
        if (selectedDate) {
            setBirthDate(selectedDate);
            const formattedDate = `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;
            setBirthDateDisplay(formattedDate);
        }
    };

    const handleOpenDatePicker = () => {
        setShowBirthDatePicker(true);
    };

    const handleCloseDatePicker = () => {
        Animated.timing(birthDateSlideAnim, {
            toValue: Dimensions.get('window').height,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowBirthDatePicker(false));
    };

    const handleRegionScroll = (event: any) => {
        const ITEM_HEIGHT = 48;
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / ITEM_HEIGHT);
        if (index >= 0 && index < REGIONS.length) {
            setRegion(REGIONS[index]);
        }
    };

    const handleBiologicalSexScroll = (event: any) => {
        const ITEM_HEIGHT = 48;
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / ITEM_HEIGHT);
        if (index >= 0 && index < BIOLOGICAL_SEX_OPTIONS.length) {
            setBiologicalSex(BIOLOGICAL_SEX_OPTIONS[index]);
        }
    };

    const isContinueEnabled = firstName.trim().length > 0 && lastName.trim().length > 0;

    // Default date for picker (30 years ago)
    const defaultDate = birthDate || new Date(new Date().getFullYear() - 30, 0, 1);
    const maxDate = new Date(); // Today
    const minDate = new Date(1900, 0, 1);

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
                                        <Text style={[styles.dropdownText, !birthDateDisplay && styles.dropdownPlaceholder]}>
                                            {birthDateDisplay || 'Select birth date'}
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

            {/* Region Picker - Native Picker Bottom Sheet */}
            <Modal
                visible={showRegionPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={closeRegionPicker}
            >
                <View style={styles.datePickerModalOverlay}>
                    <TouchableOpacity
                        style={styles.datePickerBackdrop}
                        activeOpacity={1}
                        onPress={closeRegionPicker}
                    />
                    <Animated.View style={[
                        styles.datePickerBottomSheet,
                        { transform: [{ translateY: regionSlideAnim }] }
                    ]}>
                        {/* Header */}
                        <View style={styles.datePickerHeader}>
                            <TouchableOpacity
                                onPress={closeRegionPicker}
                                style={styles.datePickerHeaderButton}
                            >
                                <Text style={styles.datePickerCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.datePickerHeaderTitle}>Region</Text>
                            <TouchableOpacity
                                onPress={closeRegionPicker}
                                style={styles.datePickerHeaderButton}
                            >
                                <Text style={styles.datePickerSaveText}>Done</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Native Picker */}
                        <Picker
                            selectedValue={region || REGIONS[0]}
                            onValueChange={(value) => setRegion(value)}
                            style={styles.nativePicker}
                            itemStyle={styles.nativePickerItem}
                        >
                            {REGIONS.map((item) => (
                                <Picker.Item key={item} label={item} value={item} />
                            ))}
                        </Picker>
                    </Animated.View>
                </View>
            </Modal>

            {/* Biological Sex Picker - Native Picker Bottom Sheet */}
            <Modal
                visible={showBiologicalSexPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={closeSexPicker}
            >
                <View style={styles.datePickerModalOverlay}>
                    <TouchableOpacity
                        style={styles.datePickerBackdrop}
                        activeOpacity={1}
                        onPress={closeSexPicker}
                    />
                    <Animated.View style={[
                        styles.datePickerBottomSheet,
                        { transform: [{ translateY: sexSlideAnim }] }
                    ]}>
                        {/* Header */}
                        <View style={styles.datePickerHeader}>
                            <TouchableOpacity
                                onPress={closeSexPicker}
                                style={styles.datePickerHeaderButton}
                            >
                                <Text style={styles.datePickerCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.datePickerHeaderTitle}>Biological Sex</Text>
                            <TouchableOpacity
                                onPress={closeSexPicker}
                                style={styles.datePickerHeaderButton}
                            >
                                <Text style={styles.datePickerSaveText}>Done</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Native Picker */}
                        <Picker
                            selectedValue={biologicalSex || BIOLOGICAL_SEX_OPTIONS[0]}
                            onValueChange={(value) => setBiologicalSex(value)}
                            style={styles.nativePicker}
                            itemStyle={styles.nativePickerItem}
                        >
                            {BIOLOGICAL_SEX_OPTIONS.map((item) => (
                                <Picker.Item key={item} label={item} value={item} />
                            ))}
                        </Picker>
                    </Animated.View>
                </View>
            </Modal>

            {/* Birth Date Picker - Native iOS/Android DateTimePicker */}
            {showBirthDatePicker && (
                <Modal
                    visible={showBirthDatePicker}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={handleCloseDatePicker}
                >
                    <View style={styles.datePickerModalOverlay}>
                        <TouchableOpacity
                            style={styles.datePickerBackdrop}
                            activeOpacity={1}
                            onPress={handleCloseDatePicker}
                        />
                        <Animated.View style={[
                            styles.datePickerBottomSheet,
                            { transform: [{ translateY: birthDateSlideAnim }] }
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
                                    onPress={handleCloseDatePicker}
                                    style={styles.datePickerHeaderButton}
                                >
                                    <Text style={styles.datePickerSaveText}>Done</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Native Date Picker */}
                            <DateTimePicker
                                value={defaultDate}
                                mode="date"
                                display="spinner"
                                onChange={handleDateChange}
                                maximumDate={maxDate}
                                minimumDate={minDate}
                                style={styles.datePicker}
                                textColor={Colors.textPrimary}
                                themeVariant="dark"
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
    // Date picker styles
    datePickerModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    datePickerBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    datePickerBottomSheet: {
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 34,
    },
    datePickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(63, 66, 67, 0.5)',
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
    datePickerSaveText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#3494d9',
    },
    datePicker: {
        height: 216,
        backgroundColor: '#1c1c1e',
    },
    nativePicker: {
        height: 216,
        backgroundColor: '#1c1c1e',
    },
    nativePickerItem: {
        color: Colors.textPrimary,
        fontSize: 22,
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
});
