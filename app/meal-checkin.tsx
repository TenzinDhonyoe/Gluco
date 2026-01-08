import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { CravingsLevel, EnergyLevel, FullnessLevel, MoodLevel, upsertMealCheckin } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface OptionButtonProps {
    label: string;
    selected: boolean;
    onPress: () => void;
}

const OptionButton: React.FC<OptionButtonProps> = ({ label, selected, onPress }) => (
    <TouchableOpacity
        style={[styles.optionButton, selected && styles.optionButtonSelected]}
        onPress={onPress}
        activeOpacity={0.7}
    >
        <Text style={[styles.optionButtonText, selected && styles.optionButtonTextSelected]}>
            {label}
        </Text>
    </TouchableOpacity>
);

export default function MealCheckinScreen() {
    const router = useRouter();
    const { mealId, mealName } = useLocalSearchParams<{ mealId: string; mealName?: string }>();
    const { user } = useAuth();

    const [energy, setEnergy] = useState<EnergyLevel | null>(null);
    const [fullness, setFullness] = useState<FullnessLevel | null>(null);
    const [cravings, setCravings] = useState<CravingsLevel | null>(null);
    const [mood, setMood] = useState<MoodLevel | null>(null);
    const [movementAfter, setMovementAfter] = useState<boolean | null>(null);
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!user?.id || !mealId) return;

        setIsSaving(true);
        try {
            await upsertMealCheckin(user.id, mealId, {
                energy,
                fullness,
                cravings,
                mood,
                movement_after: movementAfter,
                notes: notes.trim() || null,
            });
            router.back();
        } catch (error) {
            console.error('Error saving check-in:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const hasAnyInput = energy || fullness || cravings || mood || movementAfter !== null || notes.trim();

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <ImageBackground
                source={require('../assets/images/background.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <SafeAreaView style={styles.safeArea}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity
                                onPress={() => router.back()}
                                style={styles.closeButton}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="close" size={20} color="#E7E8E9" />
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>After Meal Check In</Text>
                            <View style={styles.headerSpacer} />
                        </View>

                        {mealName && (
                            <Text style={styles.mealName}>{mealName}</Text>
                        )}

                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Energy */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>How's your energy?</Text>
                                <View style={styles.optionsRow}>
                                    <OptionButton
                                        label="Low"
                                        selected={energy === 'low'}
                                        onPress={() => setEnergy(energy === 'low' ? null : 'low')}
                                    />
                                    <OptionButton
                                        label="Steady"
                                        selected={energy === 'steady'}
                                        onPress={() => setEnergy(energy === 'steady' ? null : 'steady')}
                                    />
                                    <OptionButton
                                        label="High"
                                        selected={energy === 'high'}
                                        onPress={() => setEnergy(energy === 'high' ? null : 'high')}
                                    />
                                </View>
                            </View>

                            {/* Fullness */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>How full do you feel?</Text>
                                <View style={styles.optionsRow}>
                                    <OptionButton
                                        label="Still hungry"
                                        selected={fullness === 'low'}
                                        onPress={() => setFullness(fullness === 'low' ? null : 'low')}
                                    />
                                    <OptionButton
                                        label="Just right"
                                        selected={fullness === 'okay'}
                                        onPress={() => setFullness(fullness === 'okay' ? null : 'okay')}
                                    />
                                    <OptionButton
                                        label="Very full"
                                        selected={fullness === 'high'}
                                        onPress={() => setFullness(fullness === 'high' ? null : 'high')}
                                    />
                                </View>
                            </View>

                            {/* Cravings */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Any cravings?</Text>
                                <View style={styles.optionsRow}>
                                    <OptionButton
                                        label="None"
                                        selected={cravings === 'low'}
                                        onPress={() => setCravings(cravings === 'low' ? null : 'low')}
                                    />
                                    <OptionButton
                                        label="Some"
                                        selected={cravings === 'medium'}
                                        onPress={() => setCravings(cravings === 'medium' ? null : 'medium')}
                                    />
                                    <OptionButton
                                        label="Strong"
                                        selected={cravings === 'high'}
                                        onPress={() => setCravings(cravings === 'high' ? null : 'high')}
                                    />
                                </View>
                            </View>

                            {/* Mood */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>How's your mood?</Text>
                                <View style={styles.optionsRow}>
                                    <OptionButton
                                        label="Low"
                                        selected={mood === 'low'}
                                        onPress={() => setMood(mood === 'low' ? null : 'low')}
                                    />
                                    <OptionButton
                                        label="Okay"
                                        selected={mood === 'okay'}
                                        onPress={() => setMood(mood === 'okay' ? null : 'okay')}
                                    />
                                    <OptionButton
                                        label="Good"
                                        selected={mood === 'good'}
                                        onPress={() => setMood(mood === 'good' ? null : 'good')}
                                    />
                                </View>
                            </View>

                            {/* Movement */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Did you move after eating?</Text>
                                <View style={styles.optionsRow}>
                                    <OptionButton
                                        label="No"
                                        selected={movementAfter === false}
                                        onPress={() => setMovementAfter(movementAfter === false ? null : false)}
                                    />
                                    <OptionButton
                                        label="Yes"
                                        selected={movementAfter === true}
                                        onPress={() => setMovementAfter(movementAfter === true ? null : true)}
                                    />
                                </View>
                            </View>

                            {/* Notes */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Any notes?</Text>
                                <TextInput
                                    style={styles.notesInput}
                                    placeholder="How do you feel after this meal?"
                                    placeholderTextColor={Colors.textSecondary}
                                    value={notes}
                                    onChangeText={setNotes}
                                    multiline
                                    numberOfLines={3}
                                    textAlignVertical="top"
                                />
                            </View>

                            {/* Spacer for button */}
                            <View style={{ height: 100 }} />
                        </ScrollView>

                        {/* Save Button */}
                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.saveButton,
                                    !hasAnyInput && styles.saveButtonDisabled,
                                ]}
                                onPress={handleSave}
                                disabled={!hasAnyInput || isSaving}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.saveButtonText}>
                                    {isSaving ? 'Saving...' : 'Save Check In'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </ImageBackground>
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
    },
    safeArea: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    closeButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
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
        fontSize: 16,
        fontFamily: fonts.bold,
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    headerSpacer: {
        width: 48,
    },
    mealName: {
        fontSize: 14,
        fontFamily: fonts.regular,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: 8,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: fonts.medium,
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    optionsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    optionButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        alignItems: 'center',
    },
    optionButtonSelected: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        borderColor: Colors.success,
    },
    optionButtonText: {
        fontSize: 14,
        fontFamily: fonts.medium,
        color: Colors.textSecondary,
    },
    optionButtonTextSelected: {
        color: Colors.success,
    },
    notesInput: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        padding: 16,
        fontSize: 15,
        fontFamily: fonts.regular,
        color: Colors.textPrimary,
        minHeight: 80,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingBottom: 34,
        paddingTop: 16,
        backgroundColor: 'rgba(18, 18, 18, 0.95)',
    },
    saveButton: {
        backgroundColor: Colors.success,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        backgroundColor: '#3F4243',
    },
    saveButtonText: {
        fontSize: 16,
        fontFamily: fonts.semiBold,
        color: Colors.background,
    },
});
