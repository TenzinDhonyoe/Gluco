import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { getUserProfile, GlucoseUnit, updateUserProfile } from '@/lib/supabase';
import {
    convertToMmol,
    formatGlucose,
    getGlucoseInputPlaceholder
} from '@/lib/utils/glucoseUnits';

// Default glucose target range (mmol/L)
const DEFAULT_TARGET_MIN = 3.9;
const DEFAULT_TARGET_MAX = 10.0;

export default function CustomizationScreen() {
    const router = useRouter();
    const { user, refreshProfile } = useAuth();
    const currentUnit = useGlucoseUnit();

    const [targetMin, setTargetMin] = useState(DEFAULT_TARGET_MIN.toString());
    const [targetMax, setTargetMax] = useState(DEFAULT_TARGET_MAX.toString());
    const [selectedUnit, setSelectedUnit] = useState<GlucoseUnit>(currentUnit);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Load current settings
    const loadSettings = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        try {
            const profile = await getUserProfile(user.id);
            if (profile) {
                const unit = profile.glucose_unit ?? 'mmol/L';
                setSelectedUnit(unit);

                // Display target values in user's preferred unit
                const minMmol = profile.target_min ?? DEFAULT_TARGET_MIN;
                const maxMmol = profile.target_max ?? DEFAULT_TARGET_MAX;
                setTargetMin(formatGlucose(minMmol, unit));
                setTargetMax(formatGlucose(maxMmol, unit));
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    // When unit changes, convert the displayed values
    const handleUnitChange = (newUnit: GlucoseUnit) => {
        if (newUnit === selectedUnit) return;

        // Convert current values from old unit to mmol, then to new unit for display
        const minValue = parseFloat(targetMin);
        const maxValue = parseFloat(targetMax);

        if (!isNaN(minValue)) {
            const minMmol = convertToMmol(minValue, selectedUnit);
            setTargetMin(formatGlucose(minMmol, newUnit));
        }

        if (!isNaN(maxValue)) {
            const maxMmol = convertToMmol(maxValue, selectedUnit);
            setTargetMax(formatGlucose(maxMmol, newUnit));
        }

        setSelectedUnit(newUnit);
    };

    const handleBack = () => {
        router.back();
    };

    const handleSave = async () => {
        if (!user) {
            Alert.alert('Error', 'You must be logged in to save settings');
            return;
        }

        const minValue = parseFloat(targetMin);
        const maxValue = parseFloat(targetMax);

        // Validation
        if (isNaN(minValue) || isNaN(maxValue)) {
            Alert.alert('Invalid Input', 'Please enter valid numbers for target range');
            return;
        }

        // Convert to mmol/L for validation and storage
        const minMmol = convertToMmol(minValue, selectedUnit);
        const maxMmol = convertToMmol(maxValue, selectedUnit);

        if (minMmol < 2 || minMmol > 8) {
            const minDisplay = selectedUnit === 'mg/dL' ? '36-144 mg/dL' : '2.0-8.0 mmol/L';
            Alert.alert('Invalid Range', `Minimum target should be between ${minDisplay}`);
            return;
        }

        if (maxMmol < 5 || maxMmol > 15) {
            const maxDisplay = selectedUnit === 'mg/dL' ? '90-270 mg/dL' : '5.0-15.0 mmol/L';
            Alert.alert('Invalid Range', `Maximum target should be between ${maxDisplay}`);
            return;
        }

        if (minMmol >= maxMmol) {
            Alert.alert('Invalid Range', 'Minimum target must be less than maximum target');
            return;
        }

        setIsSaving(true);
        try {
            const result = await updateUserProfile(user.id, {
                target_min: minMmol,
                target_max: maxMmol,
                glucose_unit: selectedUnit,
            });

            if (result) {
                // Refresh profile so the unit change is reflected app-wide immediately
                await refreshProfile();
                Alert.alert('Success', 'Settings saved successfully', [
                    { text: 'OK', onPress: () => router.back() },
                ]);
            } else {
                Alert.alert('Error', 'Failed to save settings. Please try again.');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            Alert.alert('Error', 'An error occurred while saving. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <LiquidGlassIconButton size={44} onPress={handleBack}>
                        <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
                    </LiquidGlassIconButton>
                    <Text style={styles.headerTitle}>CUSTOMIZATION</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Content */}
                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {/* Glucose Unit Card */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Glucose Unit</Text>
                        <Text style={styles.cardDescription}>
                            Choose your preferred unit for displaying glucose values throughout the app.
                        </Text>

                        <View style={styles.unitSelector}>
                            <AnimatedPressable
                                style={[
                                    styles.unitOption,
                                    selectedUnit === 'mmol/L' && styles.unitOptionSelected,
                                ]}
                                onPress={() => handleUnitChange('mmol/L')}
                            >
                                <Text style={[
                                    styles.unitOptionText,
                                    selectedUnit === 'mmol/L' && styles.unitOptionTextSelected,
                                ]}>
                                    mmol/L
                                </Text>
                                <Text style={styles.unitOptionSubtext}>
                                    Used in Canada, UK, Australia
                                </Text>
                            </AnimatedPressable>

                            <AnimatedPressable
                                style={[
                                    styles.unitOption,
                                    selectedUnit === 'mg/dL' && styles.unitOptionSelected,
                                ]}
                                onPress={() => handleUnitChange('mg/dL')}
                            >
                                <Text style={[
                                    styles.unitOptionText,
                                    selectedUnit === 'mg/dL' && styles.unitOptionTextSelected,
                                ]}>
                                    mg/dL
                                </Text>
                                <Text style={styles.unitOptionSubtext}>
                                    Used in USA, Germany, Japan
                                </Text>
                            </AnimatedPressable>
                        </View>
                    </View>

                    {/* Target Range Card */}
                    <View style={[styles.card, { marginTop: 16 }]}>
                        <Text style={styles.cardTitle}>Glucose Target Range</Text>
                        <Text style={styles.cardDescription}>
                            Set your personal glucose target band. This will be shown on your charts as your target zone.
                        </Text>

                        {/* Min Target */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Minimum Target</Text>
                            <View style={styles.inputRow}>
                                <View style={styles.inputShell}>
                                    <TextInput
                                        value={targetMin}
                                        onChangeText={setTargetMin}
                                        placeholder={getGlucoseInputPlaceholder(selectedUnit)}
                                        placeholderTextColor={Colors.textTertiary}
                                        style={styles.textInput}
                                        keyboardType="decimal-pad"
                                        returnKeyType="done"
                                    />
                                </View>
                                <Text style={styles.unitLabel}>{selectedUnit}</Text>
                            </View>
                        </View>

                        {/* Max Target */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Maximum Target</Text>
                            <View style={styles.inputRow}>
                                <View style={styles.inputShell}>
                                    <TextInput
                                        value={targetMax}
                                        onChangeText={setTargetMax}
                                        placeholder={selectedUnit === 'mg/dL' ? 'e.g., 180' : 'e.g., 10.0'}
                                        placeholderTextColor={Colors.textTertiary}
                                        style={styles.textInput}
                                        keyboardType="decimal-pad"
                                        returnKeyType="done"
                                    />
                                </View>
                                <Text style={styles.unitLabel}>{selectedUnit}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Spacing at bottom for save button */}
                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Save Button */}
                <View style={styles.saveButtonContainer}>
                    <Pressable
                        onPress={handleSave}
                        disabled={isSaving}
                        style={({ pressed }) => [
                            styles.saveButton,
                            isSaving && styles.saveButtonDisabled,
                            pressed && !isSaving && styles.saveButtonPressed,
                        ]}
                    >
                        {isSaving ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.saveButtonText}>Save</Text>
                        )}
                    </Pressable>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        letterSpacing: 2,
    },
    headerSpacer: {
        width: 48,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    card: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        padding: 20,
    },
    cardTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    cardDescription: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
        lineHeight: 20,
        marginBottom: 24,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    inputShell: {
        flex: 1,
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    textInput: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
        padding: 0,
    },
    unitLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        width: 60,
    },
    unitSelector: {
        flexDirection: 'row',
        gap: 12,
    },
    unitOption: {
        flex: 1,
        backgroundColor: '#232527',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Colors.inputBorderSolid,
        padding: 16,
        alignItems: 'center',
    },
    unitOptionSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primaryLight,
    },
    unitOptionText: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: Colors.textTertiary,
        marginBottom: 4,
    },
    unitOptionTextSelected: {
        color: Colors.primary,
    },
    unitOptionSubtext: {
        fontFamily: fonts.regular,
        fontSize: 11,
        color: Colors.textPlaceholder,
        textAlign: 'center',
    },
    saveButtonContainer: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    saveButton: {
        backgroundColor: Colors.buttonSecondary,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.buttonSecondaryBorder,
    },
    saveButtonDisabled: {
        opacity: 0.5,
    },
    saveButtonPressed: {
        opacity: 0.8,
    },
    saveButtonText: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
});
