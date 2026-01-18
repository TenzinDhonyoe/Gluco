import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';
import { SelectedItem } from './FoodSearchResultsView';

interface ManualAddViewProps {
    onClose: () => void;
    onSave: (item: SelectedItem) => void;
}

export default function ManualAddView({ onClose, onSave }: ManualAddViewProps) {
    const insets = useSafeAreaInsets();

    const [name, setName] = useState('');
    const [carbs, setCarbs] = useState('');
    const [protein, setProtein] = useState('');
    const [fat, setFat] = useState('');
    const [calories, setCalories] = useState('');

    const handleSave = () => {
        if (!name.trim()) {
            Alert.alert('Required', 'Please enter a food name');
            return;
        }

        const carbsVal = parseFloat(carbs);
        const proteinVal = parseFloat(protein);
        const fatVal = parseFloat(fat);
        const caloriesInput = parseFloat(calories);

        // Auto-calculate calories if not provided
        const calculatedCalories = !isNaN(caloriesInput)
            ? caloriesInput
            : Math.round(
                ((isNaN(carbsVal) ? 0 : carbsVal) * 4) +
                ((isNaN(proteinVal) ? 0 : proteinVal) * 4) +
                ((isNaN(fatVal) ? 0 : fatVal) * 9)
            );

        const manualFood: SelectedItem = {
            provider: 'fdc',
            external_id: `manual-${uuid.v4()}`,
            display_name: name.trim(),
            brand: 'Manual Entry',
            serving_size: 1,
            serving_unit: 'serving',
            calories_kcal: !isNaN(calculatedCalories) ? calculatedCalories : null,
            carbs_g: !isNaN(carbsVal) ? carbsVal : null,
            protein_g: !isNaN(proteinVal) ? proteinVal : null,
            fat_g: !isNaN(fatVal) ? fatVal : null,
            fibre_g: null,
            sugar_g: null,
            sodium_mg: null,
            quantity: 1,
            source: 'manual',
        } as any; // Cast as any because source on SelectedItem might not cover 'manual' perfectly yet or inherits from NormalizedFood

        onSave(manualFood);
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.innerContainer}>
                    <LinearGradient
                        colors={['#1a1f24', '#181c20', '#111111']}
                        locations={[0, 0.3, 1]}
                        style={styles.backgroundGradient}
                    />

                    <View style={[styles.contentContainer, { paddingTop: insets.top }]}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={onClose}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="chevron-back" size={20} color="#E7E8E9" />
                            </TouchableOpacity>
                            <Text style={styles.title}>MANUAL ENTRY</Text>
                            <View style={styles.headerSpacer} />
                        </View>

                        {/* Form */}
                        <View style={styles.formContainer}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Food Name *</Text>
                                <TextInput
                                    style={styles.input}
                                    value={name}
                                    onChangeText={setName}
                                    placeholder="e.g., Homemade Pasta"
                                    placeholderTextColor="#878787"
                                    autoCapitalize="words"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Carbs (g)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={carbs}
                                    onChangeText={setCarbs}
                                    placeholder="0"
                                    placeholderTextColor="#878787"
                                    keyboardType="numeric"
                                />
                            </View>

                            <View style={styles.row}>
                                <View style={[styles.inputGroup, styles.halfInput]}>
                                    <Text style={styles.label}>Protein (g)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={protein}
                                        onChangeText={setProtein}
                                        placeholder="0"
                                        placeholderTextColor="#878787"
                                        keyboardType="numeric"
                                    />
                                </View>
                                <View style={[styles.inputGroup, styles.halfInput]}>
                                    <Text style={styles.label}>Fat (g)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={fat}
                                        onChangeText={setFat}
                                        placeholder="0"
                                        placeholderTextColor="#878787"
                                        keyboardType="numeric"
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Calories (optional)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={calories}
                                    onChangeText={setCalories}
                                    placeholder="Auto-calculated"
                                    placeholderTextColor="#878787"
                                    keyboardType="numeric"
                                />
                            </View>

                            <TouchableOpacity
                                style={[styles.saveButton, !name.trim() && styles.saveButtonDisabled]}
                                onPress={handleSave}
                                disabled={!name.trim()}
                            >
                                <Text style={styles.saveButtonText}>Add to Meal</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    innerContainer: {
        flex: 1,
    },
    backgroundGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 300,
    },
    contentContainer: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
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
    },
    headerSpacer: {
        width: 48,
    },
    title: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        letterSpacing: 1,
        color: '#FFFFFF',
    },
    formContainer: {
        padding: 24,
        gap: 20,
    },
    inputGroup: {
        gap: 8,
    },
    row: {
        flexDirection: 'row',
        gap: 16,
    },
    halfInput: {
        flex: 1,
    },
    label: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#E7E8E9',
        marginLeft: 4,
    },
    input: {
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    saveButton: {
        backgroundColor: '#3494D9',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
        shadowColor: '#3494D9',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    saveButtonDisabled: {
        backgroundColor: '#2A3036',
        shadowOpacity: 0,
    },
    saveButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
