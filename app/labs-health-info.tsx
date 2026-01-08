/**
 * Labs & Health Info Screen
 * Allows users to enter routine lab values and health info for wellness scoring
 * BANNED TERMS: insulin resistance, HOMA-IR, prediabetes, diabetes, diagnose, detect, treat, prevent
 */

import { Disclaimer } from '@/components/ui/Disclaimer';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    createLabSnapshot,
    getLatestLabSnapshot,
    getUserProfile,
    LabSnapshot,
    UserProfile,
} from '@/lib/supabase';
import { formatGlucoseWithUnit, parseGlucoseInput } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LabsHealthInfoScreen() {
    const { user } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [latestLab, setLatestLab] = useState<LabSnapshot | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Local state for lab values (stored internally in mmol/L for glucose)
    const [a1c, setA1c] = useState<string | null>(null);
    const [fastingGlucoseMmol, setFastingGlucoseMmol] = useState<number | null>(null);
    const [fastingInsulin, setFastingInsulin] = useState<number | null>(null);
    const [triglycerides, setTriglycerides] = useState<number | null>(null);
    const [hdl, setHdl] = useState<number | null>(null);
    const [alt, setAlt] = useState<number | null>(null);
    const [weightKg, setWeightKg] = useState<number | null>(null);
    const [heightCm, setHeightCm] = useState<number | null>(null);
    const [medications, setMedications] = useState<string[]>([]);

    // Load user profile and latest lab snapshot
    const loadData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const [profileData, labData] = await Promise.all([
                getUserProfile(user.id),
                getLatestLabSnapshot(user.id),
            ]);
            setProfile(profileData);

            // Populate form with latest lab data if exists
            if (labData) {
                setLatestLab(labData);
                setFastingGlucoseMmol(labData.fasting_glucose_value);
                setFastingInsulin(labData.fasting_insulin_value);
                setTriglycerides(labData.triglycerides_value);
                setHdl(labData.hdl_value);
                setAlt(labData.alt_value);
                setWeightKg(labData.weight_kg);
                setHeightCm(labData.height_cm);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleBack = () => {
        router.back();
    };

    // Save changes to database
    const saveLabSnapshot = async () => {
        if (!user) return;

        // Only save if we have at least fasting glucose
        if (fastingGlucoseMmol === null) {
            Alert.alert('No Data', 'Add at least your fasting glucose to save.');
            return;
        }

        setIsSaving(true);
        try {
            const result = await createLabSnapshot(user.id, {
                fasting_glucose_value: fastingGlucoseMmol,
                fasting_glucose_unit: 'mmol/L',
                fasting_insulin_value: fastingInsulin,
                triglycerides_value: triglycerides,
                hdl_value: hdl,
                alt_value: alt,
                weight_kg: weightKg,
                height_cm: heightCm,
                notes: medications.length > 0 ? `Medications: ${medications.join(', ')}` : null,
            });

            if (result) {
                setLatestLab(result);
                Alert.alert('Saved', 'Your lab values have been saved. Your wellness score will update.');
            } else {
                Alert.alert('Error', 'Failed to save. Please try again.');
            }
        } catch (error) {
            console.error('Error saving lab snapshot:', error);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditA1C = () => {
        Alert.prompt(
            'A1C',
            'Enter your A1C percentage (e.g., 6.4)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            setA1c(value + '%');
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => setA1c(null),
                },
            ],
            'plain-text',
            a1c?.replace('%', '') || ''
        );
    };

    const handleEditFastingGlucose = () => {
        const currentDisplayValue = fastingGlucoseMmol !== null
            ? formatGlucoseWithUnit(fastingGlucoseMmol, glucoseUnit).replace(` ${glucoseUnit}`, '')
            : '';

        Alert.prompt(
            'Fasting Glucose',
            `Enter your fasting glucose level (${glucoseUnit})`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            const mmolValue = parseGlucoseInput(value, glucoseUnit);
                            if (mmolValue !== null) {
                                setFastingGlucoseMmol(mmolValue);
                            } else {
                                Alert.alert('Invalid', 'Please enter a valid number.');
                            }
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => setFastingGlucoseMmol(null),
                },
            ],
            'plain-text',
            currentDisplayValue
        );
    };

    const handleEditFastingInsulin = () => {
        Alert.prompt(
            'Fasting Insulin',
            'Enter your fasting insulin level (μIU/mL)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                setFastingInsulin(num);
                            } else {
                                Alert.alert('Invalid', 'Please enter a valid number.');
                            }
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => setFastingInsulin(null),
                },
            ],
            'plain-text',
            fastingInsulin?.toString() || ''
        );
    };

    const handleEditTriglycerides = () => {
        Alert.prompt(
            'Triglycerides',
            'Enter your triglycerides level (mmol/L)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                setTriglycerides(num);
                            } else {
                                Alert.alert('Invalid', 'Please enter a valid number.');
                            }
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => setTriglycerides(null),
                },
            ],
            'plain-text',
            triglycerides?.toString() || ''
        );
    };

    const handleEditHDL = () => {
        Alert.prompt(
            'HDL Cholesterol',
            'Enter your HDL cholesterol level (mmol/L)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                setHdl(num);
                            } else {
                                Alert.alert('Invalid', 'Please enter a valid number.');
                            }
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => setHdl(null),
                },
            ],
            'plain-text',
            hdl?.toString() || ''
        );
    };

    const handleEditALT = () => {
        Alert.prompt(
            'ALT (Liver Enzyme)',
            'Enter your ALT level (U/L)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                setAlt(num);
                            } else {
                                Alert.alert('Invalid', 'Please enter a valid number.');
                            }
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => setAlt(null),
                },
            ],
            'plain-text',
            alt?.toString() || ''
        );
    };

    const handleEditWeight = () => {
        Alert.prompt(
            'Weight',
            'Enter your weight (kg)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                setWeightKg(num);
                            } else {
                                Alert.alert('Invalid', 'Please enter a valid number.');
                            }
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => setWeightKg(null),
                },
            ],
            'plain-text',
            weightKg?.toString() || ''
        );
    };

    const handleEditHeight = () => {
        Alert.prompt(
            'Height',
            'Enter your height (cm)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                setHeightCm(num);
                            } else {
                                Alert.alert('Invalid', 'Please enter a valid number.');
                            }
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => setHeightCm(null),
                },
            ],
            'plain-text',
            heightCm?.toString() || ''
        );
    };

    const handleEditMedications = () => {
        Alert.prompt(
            'Medications',
            'Enter your medications (comma-separated)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: (value: string | undefined) => {
                        if (value) {
                            const meds = value.split(',').map(m => m.trim()).filter(m => m);
                            setMedications(meds);
                        }
                    },
                },
                {
                    text: 'Remove All',
                    style: 'destructive',
                    onPress: () => setMedications([]),
                },
            ],
            'plain-text',
            medications.join(', ')
        );
    };

    const formatMedications = () => {
        if (medications.length === 0) return null;
        if (medications.length === 1) return medications[0];
        return `${medications[0]}, ...`;
    };

    // Check if there are unsaved changes
    const hasChanges = () => {
        if (!latestLab) return fastingGlucoseMmol !== null;
        return (
            fastingGlucoseMmol !== latestLab.fasting_glucose_value ||
            fastingInsulin !== latestLab.fasting_insulin_value ||
            triglycerides !== latestLab.triglycerides_value ||
            hdl !== latestLab.hdl_value ||
            alt !== latestLab.alt_value ||
            weightKg !== latestLab.weight_kg ||
            heightCm !== latestLab.height_cm
        );
    };

    // Row component
    const HealthRow = ({
        label,
        value,
        onPress,
        showOptional = true,
    }: {
        label: string;
        value: string | null;
        onPress: () => void;
        showOptional?: boolean;
    }) => (
        <TouchableOpacity
            style={styles.row}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={styles.rowLabelContainer}>
                <Text style={styles.rowLabel}>{label}</Text>
                {showOptional && <Text style={styles.optionalTag}>(Optional)</Text>}
            </View>
            <View style={styles.rowRight}>
                {value && <Text style={styles.rowValue}>{value}</Text>}
                <Ionicons name="chevron-forward" size={16} color="#878787" />
            </View>
        </TouchableOpacity>
    );

    if (isLoading) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator color="#3494D9" size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Background gradient */}
            <LinearGradient
                colors={['#1a1f24', '#181c20', '#111111']}
                locations={[0, 0.3, 1]}
                style={styles.backgroundGradient}
            />

            <SafeAreaView edges={['top']} style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBack}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="chevron-back" size={20} color="#E7E8E9" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>LABS & HEALTH INFO</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Description */}
                    <Text style={styles.description}>
                        Add lab results to improve your wellness score accuracy. Everything here is optional, and you can update or remove it anytime.
                    </Text>

                    {/* Last updated */}
                    {latestLab && (
                        <Text style={styles.lastUpdated}>
                            Last updated: {new Date(latestLab.collected_at).toLocaleDateString()}
                        </Text>
                    )}

                    {/* Labs Card */}
                    <View style={styles.card}>
                        <Text style={styles.cardHeader}>Lab Values</Text>
                        <HealthRow
                            label="A1C"
                            value={a1c}
                            onPress={handleEditA1C}
                        />
                        <View style={styles.divider} />
                        <HealthRow
                            label="Fasting Glucose"
                            value={fastingGlucoseMmol !== null ? formatGlucoseWithUnit(fastingGlucoseMmol, glucoseUnit) : null}
                            onPress={handleEditFastingGlucose}
                        />
                        <View style={styles.divider} />
                        <HealthRow
                            label="Fasting Insulin"
                            value={fastingInsulin !== null ? `${fastingInsulin} μIU/mL` : null}
                            onPress={handleEditFastingInsulin}
                        />
                        <View style={styles.divider} />
                        <HealthRow
                            label="Triglycerides"
                            value={triglycerides !== null ? `${triglycerides} mmol/L` : null}
                            onPress={handleEditTriglycerides}
                        />
                        <View style={styles.divider} />
                        <HealthRow
                            label="HDL Cholesterol"
                            value={hdl !== null ? `${hdl} mmol/L` : null}
                            onPress={handleEditHDL}
                        />
                        <View style={styles.divider} />
                        <HealthRow
                            label="ALT (Liver)"
                            value={alt !== null ? `${alt} U/L` : null}
                            onPress={handleEditALT}
                        />
                    </View>

                    {/* Body Measurements Card */}
                    <View style={styles.card}>
                        <Text style={styles.cardHeader}>Body Measurements</Text>
                        <HealthRow
                            label="Weight"
                            value={weightKg !== null ? `${weightKg} kg` : null}
                            onPress={handleEditWeight}
                        />
                        <View style={styles.divider} />
                        <HealthRow
                            label="Height"
                            value={heightCm !== null ? `${heightCm} cm` : null}
                            onPress={handleEditHeight}
                        />
                    </View>

                    {/* Medications Card */}
                    <View style={styles.card}>
                        <Text style={styles.cardHeader}>Medications</Text>
                        <HealthRow
                            label="Current Medications"
                            value={formatMedications()}
                            onPress={handleEditMedications}
                        />
                    </View>

                    {/* Disclaimer */}
                    <Disclaimer variant="full" style={styles.disclaimer} />

                    {/* Save Button */}
                    {hasChanges() && (
                        <TouchableOpacity
                            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                            onPress={saveLabSnapshot}
                            disabled={isSaving}
                            activeOpacity={0.8}
                        >
                            {isSaving ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text style={styles.saveButtonText}>Save Changes</Text>
                            )}
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 280,
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
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: '#FFFFFF',
        letterSpacing: 2,
    },
    headerSpacer: {
        width: 48,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    description: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#AAAAAA',
        lineHeight: 20,
        marginTop: 8,
        marginBottom: 16,
    },
    lastUpdated: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginBottom: 16,
    },
    card: {
        backgroundColor: '#1A1D1F',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2A2D30',
        overflow: 'hidden',
        marginBottom: 16,
    },
    cardHeader: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: '#878787',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    rowLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rowLabel: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#FFFFFF',
    },
    optionalTag: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        fontStyle: 'italic',
    },
    rowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rowValue: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#878787',
    },
    divider: {
        height: 1,
        backgroundColor: '#2A2D30',
        marginHorizontal: 16,
    },
    disclaimer: {
        marginTop: 8,
        marginBottom: 16,
    },
    saveButton: {
        backgroundColor: '#3494D9',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
