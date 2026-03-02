import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { AnalyzedItem, MealPhotoAnalysisResult } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Reuse SelectedFood interface to be compatible
interface SelectedFood {
    provider: 'ai' | 'usda' | 'user';
    external_id: string;
    display_name: string;
    brand: string | null;
    quantity: number;
    serving_unit?: string;
    serving_size?: number;
    calories_kcal: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    fibre_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
}

export default function MealPhotoEstimateScreen() {
    const params = useLocalSearchParams();
    const [result, setResult] = React.useState<MealPhotoAnalysisResult | null>(null);
    const [items, setItems] = React.useState<SelectedFood[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        if (params.result && typeof params.result === 'string') {
            try {
                const parsed = JSON.parse(params.result);
                setResult(parsed);

                // Convert analyzed items to SelectedFood format
                if (parsed.items) {
                    const converted: SelectedFood[] = parsed.items.map((item: AnalyzedItem, i: number) => ({
                        provider: 'ai',
                        external_id: `ai-${Date.now()}-${i}`,
                        display_name: item.display_name,
                        brand: null,
                        quantity: item.quantity || 1,
                        serving_unit: item.unit || 'serving',
                        calories_kcal: item.nutrients.calories_kcal,
                        carbs_g: item.nutrients.carbs_g,
                        protein_g: item.nutrients.protein_g,
                        fat_g: item.nutrients.fat_g,
                        fibre_g: item.nutrients.fibre_g,
                        sugar_g: item.nutrients.sugar_g,
                        sodium_mg: item.nutrients.sodium_mg
                    }));
                    setItems(converted);
                }
            } catch (e) {
                console.error('Failed to parse result:', e);
                Alert.alert('Error', 'Could not load estimate');
            } finally {
                setIsLoading(false);
            }
        }
    }, [params.result]);

    const handleConfirm = () => {
        // Navigate back to Log Meal with items
        if (items.length === 0) {
            Alert.alert('No items', 'Please add at least one item or cancel.');
            return;
        }

        router.dismissTo({
            pathname: '/log-meal-review' as any,
            params: {
                mealId: params.mealId, // Pass back mealId just in case
                analyzedItems: JSON.stringify(items)
            }
        });
    };

    const removeItem = (index: number) => {
        const next = [...items];
        next.splice(index, 1);
        setItems(next);
    };

    const updateQuantity = (index: number, delta: number) => {
        const next = [...items];
        const item = next[index];
        const newQty = Math.max(0.25, (item.quantity || 0) + delta);

        // Scale nutrients? 
        // AI nutrients are usually PER ITEM as described.
        // If quantity changes, we assume the AI "quantity" was the base.
        // Actually simpler: AI returns "1 apple" with 50kcal.
        // If I change to "2 apples", nutrients should double.
        // BUT we stored the nutrients in the object.
        // SelectedFood structure implies `nutrients` are usually *per serving* or *total*?
        // In `log-meal.tsx` it maps `item.calories_kcal` directly.
        // So `calories_kcal` is the TOTAL for `quantity`.
        // We should scale definitions accordingly.

        const factor = newQty / item.quantity;

        // Create new object with scaled values
        next[index] = {
            ...item,
            quantity: newQty,
            calories_kcal: item.calories_kcal !== null ? Math.round(item.calories_kcal * factor) : null,
            carbs_g: item.carbs_g !== null ? Math.round(item.carbs_g * factor) : null,
            protein_g: item.protein_g !== null ? Math.round(item.protein_g * factor) : null,
            fat_g: item.fat_g !== null ? Math.round(item.fat_g * factor) : null,
            fibre_g: item.fibre_g !== null ? Math.round(item.fibre_g * factor) : null,
        };

        setItems(next);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.root}>
                {/* Header */}
                <View style={styles.header}>
                    <LiquidGlassIconButton size={44} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color="#1C1C1E" />
                    </LiquidGlassIconButton>
                    <Text style={styles.title}>Edit Estimate</Text>
                    <View style={{ width: 44 }} />
                </View>

                <ScrollView style={styles.content}>
                    <Text style={styles.disclaimer}>
                        {result?.disclaimer || "Estimates only. Edit to improve accuracy."}
                    </Text>

                    {items.map((item, index) => (
                        <View key={item.external_id} style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.itemName}>{item.display_name}</Text>
                                <Pressable onPress={() => { triggerHaptic(); removeItem(index); }} hitSlop={10}>
                                    <Ionicons name="close-circle-outline" size={20} color={Colors.textTertiary} />
                                </Pressable>
                            </View>

                            <View style={styles.cardRow}>
                                <View style={styles.qtyControl}>
                                    <Pressable onPress={() => { triggerHaptic(); updateQuantity(index, -0.25); }} style={styles.qtyBtn}>
                                        <Ionicons name="remove" size={16} color={Colors.textPrimary} />
                                    </Pressable>
                                    <Text style={styles.qtyText}>{item.quantity} {item.serving_unit || 'svg'}</Text>
                                    <Pressable onPress={() => { triggerHaptic(); updateQuantity(index, 0.25); }} style={styles.qtyBtn}>
                                        <Ionicons name="add" size={16} color={Colors.textPrimary} />
                                    </Pressable>
                                </View>

                                <View style={styles.macros}>
                                    <Text style={styles.macroText}>
                                        {item.calories_kcal ? `${item.calories_kcal} kcal` : '-'}
                                    </Text>
                                    <Text style={styles.macroSub}>
                                        C:{item.carbs_g ?? '-'} P:{item.protein_g ?? '-'} F:{item.fat_g ?? '-'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}

                    <Pressable
                        onPress={() => { triggerHaptic('medium'); handleConfirm(); }}
                        style={styles.confirmBtn}
                    >
                        <Text style={styles.confirmText}>Add to Meal</Text>
                        <Ionicons name="checkmark" size={20} color={Colors.buttonActionText} />
                    </Pressable>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    root: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backBtn: {
        padding: 8,
        marginLeft: -8,
    },
    backBtnPressed: {
        opacity: 0.6,
        transform: [{ scale: 0.97 }],
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
    },
    content: {
        flex: 1,
        padding: 20,
    },
    disclaimer: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
        marginBottom: 20,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    card: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    itemName: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: Colors.textPrimary,
        flex: 1,
        marginRight: 10,
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    qtyControl: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 8,
        padding: 4,
    },
    qtyBtn: {
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.borderCard,
        borderRadius: 6,
    },
    qtyText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
        marginHorizontal: 12,
    },
    macros: {
        alignItems: 'flex-end',
    },
    macroText: {
        fontFamily: fonts.bold,
        fontSize: 14,
        color: Colors.success,
        marginBottom: 2,
    },
    macroSub: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    confirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.buttonAction,
        paddingVertical: 16,
        borderRadius: 30,
        marginTop: 20,
        gap: 8,
    },
    confirmText: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: Colors.buttonActionText,
    },
});
