/**
 * Analysis Results View
 * Displays meal analysis results with photo, macros, and action buttons
 */

import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
const PHOTO_HEIGHT = SCREEN_WIDTH * 0.7;

interface AnalysisResultsViewProps {
    imageUri: string;
    items: SelectedItem[];
    onReview: () => void;
    onSave: () => void;
    onClose: () => void;
}

export default function AnalysisResultsView({
    imageUri,
    items,
    onReview,
    onSave,
    onClose,
}: AnalysisResultsViewProps) {
    const insets = useSafeAreaInsets();

    // Calculate totals from items
    const totals = items.reduce(
        (acc, item) => ({
            calories: acc.calories + (item.calories_kcal || 0) * (item.quantity || 1),
            carbs: acc.carbs + (item.carbs_g || 0) * (item.quantity || 1),
            protein: acc.protein + (item.protein_g || 0) * (item.quantity || 1),
            fat: acc.fat + (item.fat_g || 0) * (item.quantity || 1),
        }),
        { calories: 0, carbs: 0, protein: 0, fat: 0 }
    );

    // Generate meal name from items
    const mealName = items.length > 0
        ? items.slice(0, 2).map(i => i.display_name).join(' & ')
        : 'Analyzed Meal';

    // Simple metabolic score (placeholder logic)
    const metabolicScore = Math.min(10, Math.max(1, Math.round(
        10 - (totals.carbs / 50) + (totals.protein / 20) - (totals.fat / 30)
    )));

    return (
        <View style={styles.container}>
            {/* Background */}
            <LinearGradient
                colors={['#1a1f24', '#111111']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={styles.backButton} onPress={onClose}>
                    <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>MEAL ANALYSIS</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Photo Container */}
                <View style={styles.photoContainer}>
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.photo}
                        resizeMode="cover"
                    />
                    {/* Corner accents */}
                    <View style={[styles.photoCorner, styles.photoCornerTL]} />
                    <View style={[styles.photoCorner, styles.photoCornerTR]} />
                    <View style={[styles.photoCorner, styles.photoCornerBL]} />
                    <View style={[styles.photoCorner, styles.photoCornerBR]} />
                </View>

                {/* Content Card */}
                <View style={styles.contentCard}>
                    {/* Meal Info */}
                    <View style={styles.mealInfoSection}>
                        <Text style={styles.mealTypeLabel}>
                            {new Date().getHours() < 11 ? 'Breakfast' : new Date().getHours() < 15 ? 'Lunch' : 'Dinner'}
                        </Text>
                        <Text style={styles.mealName}>{mealName}</Text>
                        <Text style={styles.itemCount}>
                            {items.length} item{items.length !== 1 ? 's' : ''} detected
                        </Text>
                    </View>

                    {/* Macro Grid */}
                    <View style={styles.macroGrid}>
                        <View style={styles.macroItem}>
                            <View style={[styles.macroIcon, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
                                <Ionicons name="flame" size={18} color="#FF9500" />
                            </View>
                            <Text style={styles.macroLabel}>Calories</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.calories)}</Text>
                        </View>
                        <View style={styles.macroItem}>
                            <View style={[styles.macroIcon, { backgroundColor: 'rgba(52, 199, 89, 0.15)' }]}>
                                <Ionicons name="nutrition" size={18} color="#34C759" />
                            </View>
                            <Text style={styles.macroLabel}>Carbs</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.carbs)}g</Text>
                        </View>
                        <View style={styles.macroItem}>
                            <View style={[styles.macroIcon, { backgroundColor: 'rgba(255, 59, 48, 0.15)' }]}>
                                <Ionicons name="barbell" size={18} color="#FF3B30" />
                            </View>
                            <Text style={styles.macroLabel}>Protein</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.protein)}g</Text>
                        </View>
                        <View style={styles.macroItem}>
                            <View style={[styles.macroIcon, { backgroundColor: 'rgba(175, 82, 222, 0.15)' }]}>
                                <Ionicons name="water" size={18} color="#AF52DE" />
                            </View>
                            <Text style={styles.macroLabel}>Fat</Text>
                            <Text style={styles.macroValue}>{Math.round(totals.fat)}g</Text>
                        </View>
                    </View>

                    {/* Metabolic Insight */}
                    <View style={styles.insightSection}>
                        <View style={styles.insightHeader}>
                            <Ionicons name="heart" size={18} color={Colors.success} />
                            <Text style={styles.insightLabel}>Metabolic Score</Text>
                            <Text style={styles.insightValue}>{metabolicScore}/10</Text>
                        </View>
                        <View style={styles.insightBar}>
                            <View
                                style={[
                                    styles.insightProgress,
                                    { width: `${metabolicScore * 10}%` }
                                ]}
                            />
                        </View>
                        <Text style={styles.insightNote}>
                            {metabolicScore >= 7
                                ? '✨ Great balance of nutrients!'
                                : metabolicScore >= 4
                                    ? '💡 Consider adding more protein'
                                    : '⚠️ High carb content detected'}
                        </Text>
                    </View>

                    {/* Detected Items Preview */}
                    {items.length > 0 && (
                        <View style={styles.itemsSection}>
                            <Text style={styles.itemsSectionTitle}>Detected Items</Text>
                            {items.slice(0, 3).map((item, index) => (
                                <View key={index} style={styles.detectedItem}>
                                    <View style={styles.detectedItemDot} />
                                    <Text style={styles.detectedItemName} numberOfLines={1}>
                                        {item.display_name}
                                    </Text>
                                    <Text style={styles.detectedItemCal}>
                                        {Math.round((item.calories_kcal || 0) * (item.quantity || 1))} cal
                                    </Text>
                                </View>
                            ))}
                            {items.length > 3 && (
                                <Text style={styles.moreItems}>+ {items.length - 3} more</Text>
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={[styles.buttonContainer, { paddingBottom: insets.bottom + 16 }]}>
                <TouchableOpacity style={styles.reviewButton} onPress={onReview}>
                    <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.reviewButtonText}>Review</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={onSave}>
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>Save</Text>
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
        paddingBottom: 12,
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(63, 66, 67, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        letterSpacing: 1,
        color: '#FFFFFF',
    },
    headerSpacer: {
        width: 48,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    photoContainer: {
        marginHorizontal: 20,
        marginTop: 8,
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
    },
    photo: {
        width: '100%',
        height: PHOTO_HEIGHT,
    },
    photoCorner: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderColor: Colors.success,
        borderWidth: 2,
    },
    photoCornerTL: {
        top: 8,
        left: 8,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderTopLeftRadius: 8,
    },
    photoCornerTR: {
        top: 8,
        right: 8,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
        borderTopRightRadius: 8,
    },
    photoCornerBL: {
        bottom: 8,
        left: 8,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderBottomLeftRadius: 8,
    },
    photoCornerBR: {
        bottom: 8,
        right: 8,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderBottomRightRadius: 8,
    },
    contentCard: {
        marginHorizontal: 20,
        marginTop: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    mealInfoSection: {
        marginBottom: 20,
    },
    mealTypeLabel: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.success,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    mealName: {
        fontFamily: fonts.semiBold,
        fontSize: 22,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    itemCount: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    macroGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 20,
        gap: 12,
    },
    macroItem: {
        width: (SCREEN_WIDTH - 80 - 12) / 2,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        padding: 14,
        alignItems: 'flex-start',
    },
    macroIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    macroLabel: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        marginBottom: 2,
    },
    macroValue: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#FFFFFF',
    },
    insightSection: {
        backgroundColor: 'rgba(52, 199, 89, 0.08)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    insightLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        flex: 1,
    },
    insightValue: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: Colors.success,
    },
    insightBar: {
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        marginBottom: 10,
        overflow: 'hidden',
    },
    insightProgress: {
        height: '100%',
        backgroundColor: Colors.success,
        borderRadius: 3,
    },
    insightNote: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
    },
    itemsSection: {
        gap: 10,
    },
    itemsSectionTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    detectedItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    detectedItemDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.success,
    },
    detectedItemName: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 15,
        color: '#FFFFFF',
    },
    detectedItemCal: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    moreItems: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textMuted,
        marginLeft: 16,
    },
    buttonContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 12,
        paddingTop: 16,
        backgroundColor: '#111111',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    reviewButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    reviewButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    saveButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        borderRadius: 16,
        backgroundColor: Colors.buttonPrimary,
    },
    saveButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
