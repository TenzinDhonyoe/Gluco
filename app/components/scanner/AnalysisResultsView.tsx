/**
 * Analysis Results View
 * Displays meal analysis results with photo, macros, and action buttons
 * Redesigned to match new UI mockup
 */

import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SelectedItem } from './FoodSearchResultsView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_HEIGHT = SCREEN_WIDTH * 0.55;

interface AnalysisResultsViewProps {
    imageUri: string;
    items: SelectedItem[];
    onReview: () => void;
    onSave: () => void;
    onClose: () => void;
    headerTitle?: string;
    primaryActionLabel?: string;
    reviewIcon?: keyof typeof Ionicons.glyphMap;
}

// Format serving size for display
function formatServing(item: SelectedItem): string {
    const qty = item.quantity || 1;
    const unit = item.serving_unit || 'serving';

    if (qty === 0.5) return `1/2 ${unit}`;
    if (qty === 0.25) return `1/4 ${unit}`;
    if (qty === 0.33 || qty === 0.34) return `1/3 ${unit}`;
    if (qty === 1) return `1 ${unit}`;
    return `${qty} ${unit}`;
}

// Get meal type based on time
function getMealType(): string {
    const hour = new Date().getHours();
    if (hour < 11) return 'Breakfast';
    if (hour < 15) return 'Lunch';
    if (hour < 18) return 'Snack';
    return 'Dinner';
}

// Format timestamp
function formatTimestamp(): string {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    const displayMin = minutes.toString().padStart(2, '0');
    return `${displayHour}:${displayMin} ${ampm} • Today`;
}

export default function AnalysisResultsView({
    imageUri,
    items,
    onReview,
    onSave,
    onClose,
    headerTitle = 'MEAL REVIEW',
    primaryActionLabel = 'Log this meal',
    reviewIcon = 'create-outline',
}: AnalysisResultsViewProps) {
    const insets = useSafeAreaInsets();

    // Calculate totals from items
    const totals = items.reduce(
        (acc, item) => ({
            calories: acc.calories + (item.calories_kcal || 0) * (item.quantity || 1),
            carbs: acc.carbs + (item.carbs_g || 0) * (item.quantity || 1),
            protein: acc.protein + (item.protein_g || 0) * (item.quantity || 1),
            fat: acc.fat + (item.fat_g || 0) * (item.quantity || 1),
            fiber: acc.fiber + (item.fibre_g || 0) * (item.quantity || 1),
        }),
        { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 }
    );

    // Generate meal name from items
    const mealName = items.length > 0
        ? items.slice(0, 2).map(i => i.display_name).join(' with ')
        : 'Analyzed Meal';

    // Simple metabolic score (placeholder logic - higher protein & fiber, lower carbs = better)
    const metabolicScore = Math.min(100, Math.max(0, Math.round(
        50 + (totals.protein * 1.5) + (totals.fiber * 2) - (totals.carbs * 0.3)
    )));

    // Generate drivers based on meal composition
    const drivers = [];
    if (totals.protein > 20) drivers.push('Good protein content supports satiety');
    if (totals.fiber > 5) drivers.push('Fiber helps slow glucose absorption');
    if (totals.carbs > 40) drivers.push('Higher carb content may impact glucose');
    if (totals.fat > 10) drivers.push('Healthy fats help moderate response');
    if (drivers.length === 0) drivers.push('Balanced meal composition');

    // Generate adjustment suggestions
    const adjustments = [];
    if (totals.carbs > 50) {
        adjustments.push({
            title: 'Reduce portion size',
            risk: '-8% Risk',
            description: 'A smaller portion can help moderate glucose response.',
        });
    }
    if (totals.fiber < 5) {
        adjustments.push({
            title: 'Add more fiber',
            risk: '-6% Risk',
            description: 'Adding vegetables or whole grains can slow glucose absorption.',
        });
    }
    if (totals.protein < 15) {
        adjustments.push({
            title: 'Add protein source',
            risk: '-10% Risk',
            description: 'Protein helps stabilize blood sugar levels.',
        });
    }
    adjustments.push({
        title: 'Take a 10 min post meal walk',
        risk: '-5% Risk',
        description: 'Light activity after eating helps your body process glucose.',
    });

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={styles.headerButton} onPress={onClose}>
                    <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{headerTitle}</Text>
                <TouchableOpacity style={styles.headerButton} onPress={onReview}>
                    <Ionicons name={reviewIcon} size={22} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Meal Title Section */}
                <View style={styles.mealTitleSection}>
                    <Text style={styles.mealName}>{mealName}</Text>
                    <Text style={styles.timestamp}>{formatTimestamp()}</Text>
                </View>

                {/* Photo */}
                <View style={styles.photoContainer}>
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.photo}
                        resizeMode="cover"
                    />
                </View>

                {/* Horizontal Macro Bar */}
                <View style={styles.macroBar}>
                    <View style={styles.macroColumn}>
                        <Text style={styles.macroLabel}>CARBS</Text>
                        <Text style={styles.macroValue}>{Math.round(totals.carbs)}g</Text>
                    </View>
                    <View style={styles.macroDivider} />
                    <View style={styles.macroColumn}>
                        <Text style={styles.macroLabel}>PROTEIN</Text>
                        <Text style={styles.macroValue}>{Math.round(totals.protein)}g</Text>
                    </View>
                    <View style={styles.macroDivider} />
                    <View style={styles.macroColumn}>
                        <Text style={styles.macroLabel}>FIBER</Text>
                        <Text style={styles.macroValue}>{Math.round(totals.fiber)}g</Text>
                    </View>
                    <View style={styles.macroDivider} />
                    <View style={styles.macroColumn}>
                        <Text style={styles.macroLabel}>FAT</Text>
                        <Text style={styles.macroValue}>{Math.round(totals.fat)}g</Text>
                    </View>
                </View>

                {/* Food Items List */}
                <View style={styles.itemsSection}>
                    {items.map((item, index) => (
                        <View key={index} style={styles.foodItem}>
                            <View style={styles.foodItemLeft}>
                                <Text style={styles.foodItemName}>{item.display_name}</Text>
                                <Text style={styles.foodItemBrand}>{item.brand || 'Generic'}</Text>
                            </View>
                            <Text style={styles.foodItemServing}>{formatServing(item)}</Text>
                        </View>
                    ))}
                    <TouchableOpacity>
                        <Text style={styles.dataSourceLink}>Food Data Source</Text>
                    </TouchableOpacity>
                </View>

                {/* Metabolic Score */}
                <View style={styles.scoreSection}>
                    <Text style={styles.scoreLabel}>Metabolic Score</Text>
                    <View style={styles.scoreBadge}>
                        <Text style={styles.scoreValue}>{metabolicScore}</Text>
                    </View>
                </View>

                {/* Drivers Section */}
                <View style={styles.driversSection}>
                    <Text style={styles.sectionTitle}>Drivers:</Text>
                    {drivers.map((driver, index) => (
                        <View key={index} style={styles.driverItem}>
                            <View style={styles.driverBullet} />
                            <Text style={styles.driverText}>{driver}</Text>
                        </View>
                    ))}
                </View>

                {/* Adjustments Section */}
                <View style={styles.adjustmentsSection}>
                    <Text style={styles.sectionTitle}>Try these adjustments:</Text>
                    {adjustments.slice(0, 3).map((adjustment, index) => (
                        <View key={index} style={styles.adjustmentCard}>
                            <View style={styles.adjustmentHeader}>
                                <Text style={styles.adjustmentTitle}>{adjustment.title}</Text>
                                <View style={styles.adjustmentRiskBadge}>
                                    <Text style={styles.adjustmentRisk}>{adjustment.risk}</Text>
                                </View>
                            </View>
                            <Text style={styles.adjustmentDesc}>{adjustment.description}</Text>
                        </View>
                    ))}
                </View>

                {/* Personalized Tip Card */}
                <View style={styles.tipCard}>
                    <View style={styles.tipIcon}>
                        <Ionicons name="bulb" size={20} color="#000000" />
                    </View>
                    <Text style={styles.tipText}>
                        {totals.carbs > 40
                            ? 'Consider pairing high-carb meals with protein to stabilize your glucose response.'
                            : 'Great job! This meal has a balanced composition for steady energy.'}
                    </Text>
                </View>
            </ScrollView>

            {/* Bottom Button */}
            <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}>
                <TouchableOpacity style={styles.logButton} onPress={onSave}>
                    <Text style={styles.logButtonText}>{primaryActionLabel}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        letterSpacing: 1.5,
        color: '#FFFFFF',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    mealTitleSection: {
        marginBottom: 16,
    },
    mealName: {
        fontFamily: fonts.semiBold,
        fontSize: 24,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    timestamp: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    photoContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 20,
    },
    photo: {
        width: '100%',
        height: PHOTO_HEIGHT,
    },
    macroBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 8,
        marginBottom: 24,
    },
    macroColumn: {
        flex: 1,
        alignItems: 'center',
    },
    macroDivider: {
        width: 1,
        height: 32,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    macroLabel: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: Colors.textSecondary,
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    macroValue: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: '#FFFFFF',
    },
    itemsSection: {
        marginBottom: 24,
    },
    foodItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    foodItemLeft: {
        flex: 1,
        marginRight: 16,
    },
    foodItemName: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 2,
    },
    foodItemBrand: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    foodItemServing: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textSecondary,
    },
    dataSourceLink: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textMuted,
        marginTop: 12,
    },
    scoreSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    scoreLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
    },
    scoreBadge: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 3,
        borderColor: '#D4AF37',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(212, 175, 55, 0.1)',
    },
    scoreValue: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: '#D4AF37',
    },
    driversSection: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 12,
    },
    driverItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    driverBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFFFFF',
        marginTop: 6,
        marginRight: 10,
    },
    driverText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    adjustmentsSection: {
        marginBottom: 24,
    },
    adjustmentCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    adjustmentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    adjustmentTitle: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#FFFFFF',
        flex: 1,
    },
    adjustmentRiskBadge: {
        marginLeft: 8,
    },
    adjustmentRisk: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: '#34C759',
    },
    adjustmentDesc: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    tipCard: {
        backgroundColor: 'rgba(212, 175, 55, 0.15)',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 20,
    },
    tipIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#D4AF37',
        justifyContent: 'center',
        alignItems: 'center',
    },
    tipText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 20,
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingTop: 16,
        backgroundColor: '#111111',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    logButton: {
        backgroundColor: '#2A2D30',
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
