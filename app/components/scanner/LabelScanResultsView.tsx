import { fonts } from '@/hooks/useFonts';
import {
    formatServingDescription,
    isValidParsedLabel,
    LabelScanResult,
} from '@/lib/labelScan';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface LabelScanResultsViewProps {
    scanResult: LabelScanResult;
    onConfirm: () => void;
    onRetake: () => void;
}

export default function LabelScanResultsView({
    scanResult,
    onConfirm,
    onRetake,
}: LabelScanResultsViewProps) {
    if (!scanResult?.parsed) return null;
    const { parsed } = scanResult;
    const valid = isValidParsedLabel(parsed);

    return (
        <ScrollView style={styles.resultsContainer} contentContainerStyle={styles.resultsContent}>
            {/* Header */}
            <View style={styles.resultsHeader}>
                <Text style={styles.productName}>{parsed.display_name}</Text>
                {parsed.brand && <Text style={styles.brandName}>{parsed.brand}</Text>}
                <Text style={styles.servingInfo}>{formatServingDescription(parsed)}</Text>
            </View>

            {/* Confidence indicator */}
            <View style={styles.confidenceRow}>
                <Text style={styles.confidenceLabel}>Confidence:</Text>
                <View
                    style={[
                        styles.confidenceBadge,
                        parsed.confidence >= 80
                            ? styles.confidenceHigh
                            : parsed.confidence >= 50
                                ? styles.confidenceMedium
                                : styles.confidenceLow,
                    ]}
                >
                    <Text style={styles.confidenceText}>{parsed.confidence}%</Text>
                </View>
            </View>

            {/* Nutrition values */}
            <View style={styles.nutritionCard}>
                <Text style={styles.nutritionTitle}>Nutrition Facts</Text>

                <NutritionRow label="Calories" value={parsed.per_serving.calories} unit="kcal" />
                <NutritionRow label="Carbohydrates" value={parsed.per_serving.carbs_g} unit="g" />
                <NutritionRow label="Fiber" value={parsed.per_serving.fibre_g} unit="g" indent />
                <NutritionRow label="Sugars" value={parsed.per_serving.sugars_g} unit="g" indent />
                <NutritionRow label="Protein" value={parsed.per_serving.protein_g} unit="g" />
                <NutritionRow label="Total Fat" value={parsed.per_serving.fat_g} unit="g" />
                <NutritionRow label="Saturated Fat" value={parsed.per_serving.sat_fat_g} unit="g" indent />
                <NutritionRow label="Sodium" value={parsed.per_serving.sodium_mg} unit="mg" />
            </View>

            {/* Warnings */}
            {parsed.warnings.length > 0 && (
                <View style={styles.warningsCard}>
                    <Ionicons name="information-circle" size={20} color="#FF9800" />
                    <View style={styles.warningsList}>
                        {parsed.warnings.map((warning, i) => (
                            <Text key={i} style={styles.warningText}>
                                • {warning}
                            </Text>
                        ))}
                    </View>
                </View>
            )}

            {/* Not enough data warning */}
            {!valid && (
                <View style={styles.warningsCard}>
                    <Ionicons name="alert-circle" size={20} color="#F44336" />
                    <Text style={styles.warningText}>
                        Could not extract enough nutrition data. You may need to enter values manually.
                    </Text>
                </View>
            )}

            {/* Action buttons */}
            <View style={styles.actionButtons}>
                <TouchableOpacity
                    style={[styles.confirmButton, !valid && styles.confirmButtonDisabled]}
                    onPress={onConfirm}
                    disabled={!valid}
                >
                    <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>Add to Meal</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.retakeButton} onPress={onRetake}>
                    <Ionicons name="camera" size={20} color="#3494D9" />
                    <Text style={styles.retakeButtonText}>Retake Photo</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

function NutritionRow({
    label,
    value,
    unit,
    indent = false,
}: {
    label: string;
    value?: number | null;
    unit: string;
    indent?: boolean;
}) {
    return (
        <View style={[styles.nutritionRow, indent && styles.nutritionRowIndent]}>
            <Text style={[styles.nutritionLabel, indent && styles.nutritionLabelIndent]}>
                {label}
            </Text>
            <Text style={styles.nutritionValue}>
                {value !== null && value !== undefined ? `${value}${unit}` : '—'}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    resultsContainer: {
        flex: 1,
        backgroundColor: '#111111',
    },
    resultsContent: {
        padding: 20,
        paddingBottom: 100, // Space for option bar
    },
    resultsHeader: {
        marginBottom: 20,
    },
    productName: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    brandName: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#878787',
        marginBottom: 4,
    },
    servingInfo: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#3494D9',
    },
    confidenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 8,
    },
    confidenceLabel: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    confidenceBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    confidenceHigh: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
    },
    confidenceMedium: {
        backgroundColor: 'rgba(255, 152, 0, 0.2)',
    },
    confidenceLow: {
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
    },
    confidenceText: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: '#FFFFFF',
    },
    nutritionCard: {
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    nutritionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
        marginBottom: 16,
    },
    nutritionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#2C2C2E',
    },
    nutritionRowIndent: {
        paddingLeft: 16,
    },
    nutritionLabel: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: '#E7E8E9',
    },
    nutritionLabelIndent: {
        color: '#878787',
        fontSize: 14,
    },
    nutritionValue: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#FFFFFF',
    },
    warningsCard: {
        backgroundColor: 'rgba(255, 152, 0, 0.1)',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    warningsList: {
        flex: 1,
    },
    warningText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FF9800',
        lineHeight: 20,
    },
    actionButtons: {
        gap: 12,
    },
    confirmButton: {
        backgroundColor: '#3494D9',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 14,
        gap: 8,
    },
    confirmButtonDisabled: {
        backgroundColor: '#2C2C2E',
        opacity: 0.5,
    },
    confirmButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    retakeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#3494D9',
        gap: 8,
    },
    retakeButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#3494D9',
    },
});
