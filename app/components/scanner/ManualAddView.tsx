import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
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
    const [fibre, setFibre] = useState('');
    const [protein, setProtein] = useState('');
    const [fat, setFat] = useState('');
    const [calories, setCalories] = useState('');
    const [photoUri, setPhotoUri] = useState<string | null>(null);

    const pickPhoto = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Permission needed', 'Please allow access to your photos');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
            setPhotoUri(result.assets[0].uri);
        }
    };

    const takePhoto = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Permission needed', 'Please allow access to your camera');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
            setPhotoUri(result.assets[0].uri);
        }
    };

    const handleSave = () => {
        if (!name.trim()) {
            Alert.alert('Required', 'Please enter a food name');
            return;
        }

        const carbsVal = parseFloat(carbs);
        const fibreVal = parseFloat(fibre);
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
            fibre_g: !isNaN(fibreVal) ? fibreVal : null,
            sugar_g: null,
            sodium_mg: null,
            quantity: 1,
            source: 'manual',
        };

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
                            <LiquidGlassIconButton size={44} onPress={onClose}>
                                <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
                            </LiquidGlassIconButton>
                            <Text style={styles.title}>MANUAL ENTRY</Text>
                            <View style={styles.headerSpacer} />
                        </View>

                        {/* Form */}
                        <ScrollView
                            style={styles.formScrollView}
                            contentContainerStyle={styles.formContainer}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Photo Field (Optional) */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Photo (optional)</Text>
                                {photoUri ? (
                                    <View style={styles.photoPreviewContainer}>
                                        <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                                        <TouchableOpacity
                                            style={styles.removePhotoButton}
                                            onPress={() => setPhotoUri(null)}
                                        >
                                            <Ionicons name="close-circle" size={24} color="#FF3B30" />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.photoButtonsRow}>
                                        <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                                            <Ionicons name="camera-outline" size={24} color={Colors.textTertiary} />
                                            <Text style={styles.photoButtonText}>Camera</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.photoButton} onPress={pickPhoto}>
                                            <Ionicons name="images-outline" size={24} color={Colors.textTertiary} />
                                            <Text style={styles.photoButtonText}>Gallery</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Food Name *</Text>
                                <TextInput
                                    style={styles.input}
                                    value={name}
                                    onChangeText={setName}
                                    placeholder="e.g., Homemade Pasta"
                                    placeholderTextColor={Colors.textTertiary}
                                    autoCapitalize="words"
                                />
                            </View>

                            <View style={styles.row}>
                                <View style={[styles.inputGroup, styles.halfInput]}>
                                    <Text style={styles.label}>Carbs (g)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={carbs}
                                        onChangeText={setCarbs}
                                        placeholder="0"
                                        placeholderTextColor={Colors.textTertiary}
                                        keyboardType="numeric"
                                    />
                                </View>
                                <View style={[styles.inputGroup, styles.halfInput]}>
                                    <Text style={styles.label}>Fibre (g)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={fibre}
                                        onChangeText={setFibre}
                                        placeholder="0"
                                        placeholderTextColor={Colors.textTertiary}
                                        keyboardType="numeric"
                                    />
                                </View>
                            </View>

                            <View style={styles.row}>
                                <View style={[styles.inputGroup, styles.halfInput]}>
                                    <Text style={styles.label}>Protein (g)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={protein}
                                        onChangeText={setProtein}
                                        placeholder="0"
                                        placeholderTextColor={Colors.textTertiary}
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
                                        placeholderTextColor={Colors.textTertiary}
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
                                    placeholderTextColor={Colors.textTertiary}
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
                        </ScrollView>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
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
        color: Colors.textPrimary,
    },
    formContainer: {
        padding: 24,
        paddingBottom: 180,
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
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
    },
    saveButton: {
        backgroundColor: Colors.primary,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
        shadowColor: Colors.primary,
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
        color: Colors.textPrimary,
    },
    formScrollView: {
        flex: 1,
    },
    photoPreviewContainer: {
        position: 'relative',
        width: 120,
        height: 120,
    },
    photoPreview: {
        width: 120,
        height: 120,
        borderRadius: 16,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
    },
    removePhotoButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#1a1f24',
        borderRadius: 12,
    },
    photoButtonsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    photoButton: {
        flex: 1,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        borderRadius: 16,
        paddingVertical: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        borderStyle: 'dashed',
    },
    photoButtonText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
    },
});
