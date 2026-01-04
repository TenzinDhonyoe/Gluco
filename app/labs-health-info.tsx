import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { getUserProfile, UserProfile } from '@/lib/supabase';
import { parseGlucoseInput, formatGlucoseWithUnit } from '@/lib/utils/glucoseUnits';
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
    const [isLoading, setIsLoading] = useState(true);

    // Local state for lab values (stored internally in mmol/L)
    const [a1c, setA1c] = useState<string | null>(null);
    const [fastingGlucoseMmol, setFastingGlucoseMmol] = useState<number | null>(null);
    const [medications, setMedications] = useState<string[]>([]);

    // Load user profile
    const loadProfile = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const data = await getUserProfile(user.id);
            setProfile(data);
            // In a real app, these would come from the profile
            // For now, we'll use placeholder data if not set
        } catch (error) {
            console.error('Failed to load profile:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const handleBack = () => {
        router.back();
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
                            Alert.alert('Saved', 'A1C value updated successfully.');
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        setA1c(null);
                        Alert.alert('Removed', 'A1C value has been removed.');
                    },
                },
            ],
            'plain-text',
            a1c?.replace('%', '') || ''
        );
    };

    const handleEditFastingGlucose = () => {
        // Get current display value in user's preferred unit
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
                            // Parse input and convert to mmol/L for storage
                            const mmolValue = parseGlucoseInput(value, glucoseUnit);
                            if (mmolValue !== null) {
                                setFastingGlucoseMmol(mmolValue);
                                Alert.alert('Saved', 'Fasting glucose value updated successfully.');
                            } else {
                                Alert.alert('Invalid', 'Please enter a valid number.');
                            }
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        setFastingGlucoseMmol(null);
                        Alert.alert('Removed', 'Fasting glucose value has been removed.');
                    },
                },
            ],
            'plain-text',
            currentDisplayValue
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
                            Alert.alert('Saved', 'Medications updated successfully.');
                        }
                    },
                },
                {
                    text: 'Remove All',
                    style: 'destructive',
                    onPress: () => {
                        setMedications([]);
                        Alert.alert('Removed', 'All medications have been removed.');
                    },
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

    // Row component
    const HealthRow = ({
        label,
        value,
        onPress,
    }: {
        label: string;
        value: string | null;
        onPress: () => void;
    }) => (
        <TouchableOpacity
            style={styles.row}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={styles.rowLabelContainer}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.optionalTag}>(Optional)</Text>
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
                        Add lab results and medications to personalize your insights and recommendations. Everything here is optional, and you can update or remove it anytime.
                    </Text>

                    {/* Labs Card */}
                    <View style={styles.card}>
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
                            label="Medications"
                            value={formatMedications()}
                            onPress={handleEditMedications}
                        />
                    </View>
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
        marginBottom: 24,
    },
    card: {
        backgroundColor: '#1A1D1F',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2A2D30',
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
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
        fontSize: 14,
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
});
