import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    type ActivityIntensity,
    type ActivityLog,
    type GlucoseContext,
    type GlucoseLog,
    type Meal,
    type MealItem,
    type MealType,
    deleteMeal,
    deleteGlucoseLog,
    deleteActivityLog,
    ensureSignedMealPhotoUrl,
    getActivityLogById,
    getGlucoseLogById,
    getMealById,
    getMealItems,
    updateActivityLog,
    updateGlucoseLog,
    updateMeal,
} from '@/lib/supabase';
import { formatGlucoseWithUnit, parseGlucoseInput, getGlucoseInputPlaceholder } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type LogDetailType = 'meal' | 'glucose' | 'activity';

const GLUCOSE_CONTEXTS: { value: GlucoseContext; label: string }[] = [
    { value: 'pre_meal', label: 'Pre Meal' },
    { value: 'post_meal', label: 'Post Meal' },
    { value: 'random', label: 'Random' },
    { value: 'fasting', label: 'Fasting' },
    { value: 'bedtime', label: 'Bedtime' },
];

const INTENSITY_OPTIONS: { value: ActivityIntensity; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'intense', label: 'Intense' },
];

const MEAL_TYPES: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'dinner', label: 'Dinner' },
    { value: 'snack', label: 'Snack' },
];

function formatContextLabel(context: string | null): string {
    if (!context) return 'Manual';
    return context
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatDateTime(isoString: string): string {
    const date = new Date(isoString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${month} ${day}, ${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function ChevronDown() {
    return <Ionicons name="chevron-down" size={16} color="#878787" />;
}

export default function LogDetailScreen() {
    const { user } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const params = useLocalSearchParams<{ type: string; id: string }>();
    const type = params.type as LogDetailType | undefined;
    const id = params.id;

    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Meal state
    const [meal, setMeal] = useState<Meal | null>(null);
    const [mealItems, setMealItems] = useState<MealItem[]>([]);
    const [mealPhotoUrl, setMealPhotoUrl] = useState<string | null>(null);
    const [editMealName, setEditMealName] = useState('');
    const [editMealType, setEditMealType] = useState<MealType | null>(null);
    const [editMealNotes, setEditMealNotes] = useState('');
    const [mealTypeModalOpen, setMealTypeModalOpen] = useState(false);

    // Glucose state
    const [glucoseLog, setGlucoseLog] = useState<GlucoseLog | null>(null);
    const [editGlucoseLevel, setEditGlucoseLevel] = useState('');
    const [editGlucoseContext, setEditGlucoseContext] = useState<GlucoseContext | null>(null);
    const [editGlucoseNotes, setEditGlucoseNotes] = useState('');
    const [contextModalOpen, setContextModalOpen] = useState(false);

    // Activity state
    const [activityLog, setActivityLog] = useState<ActivityLog | null>(null);
    const [editActivityName, setEditActivityName] = useState('');
    const [editDuration, setEditDuration] = useState('');
    const [editIntensity, setEditIntensity] = useState<ActivityIntensity | null>(null);
    const [editActivityNotes, setEditActivityNotes] = useState('');
    const [intensityModalOpen, setIntensityModalOpen] = useState(false);

    // Validate params
    const isValidParams = type && ['meal', 'glucose', 'activity'].includes(type) && id;

    // Computed total macros for meal items
    const totalMacros = useMemo(() => {
        return mealItems.reduce(
            (acc, item) => ({
                calories: acc.calories + (item.nutrients.calories_kcal || 0),
                carbs: acc.carbs + (item.nutrients.carbs_g || 0),
                protein: acc.protein + (item.nutrients.protein_g || 0),
                fat: acc.fat + (item.nutrients.fat_g || 0),
                fibre: acc.fibre + (item.nutrients.fibre_g || 0),
            }),
            { calories: 0, carbs: 0, protein: 0, fat: 0, fibre: 0 }
        );
    }, [mealItems]);

    // Initialize edit fields from fetched data
    const initMealEditFields = useCallback((m: Meal) => {
        setEditMealName(m.name);
        setEditMealType(m.meal_type);
        setEditMealNotes(m.notes || '');
    }, []);

    const initGlucoseEditFields = useCallback((g: GlucoseLog) => {
        setEditGlucoseLevel(formatGlucoseWithUnit(g.glucose_level, glucoseUnit).split(' ')[0]);
        setEditGlucoseContext(g.context);
        setEditGlucoseNotes(g.notes || '');
    }, [glucoseUnit]);

    const initActivityEditFields = useCallback((a: ActivityLog) => {
        setEditActivityName(a.activity_name);
        setEditDuration(String(a.duration_minutes));
        setEditIntensity(a.intensity);
        setEditActivityNotes(a.notes || '');
    }, []);

    // Fetch data on mount
    useEffect(() => {
        if (!user || !isValidParams) {
            setIsLoading(false);
            return;
        }

        async function fetchData() {
            setIsLoading(true);
            try {
                if (type === 'meal') {
                    const [fetchedMeal, fetchedItems] = await Promise.all([
                        getMealById(id!, user!.id),
                        getMealItems(id!),
                    ]);
                    if (fetchedMeal) {
                        setMeal(fetchedMeal);
                        initMealEditFields(fetchedMeal);
                        if (fetchedMeal.photo_path) {
                            const url = await ensureSignedMealPhotoUrl(fetchedMeal.photo_path);
                            setMealPhotoUrl(url);
                        }
                    }
                    setMealItems(fetchedItems);
                } else if (type === 'glucose') {
                    const fetched = await getGlucoseLogById(id!, user!.id);
                    if (fetched) {
                        setGlucoseLog(fetched);
                        initGlucoseEditFields(fetched);
                    }
                } else if (type === 'activity') {
                    const fetched = await getActivityLogById(id!, user!.id);
                    if (fetched) {
                        setActivityLog(fetched);
                        initActivityEditFields(fetched);
                    }
                }
            } catch (error) {
                console.error('Error fetching log detail:', error);
            } finally {
                setIsLoading(false);
            }
        }

        fetchData();
    }, [user, type, id]);

    const handleToggleEdit = () => {
        if (isEditing) {
            // Cancel: reset fields
            if (type === 'meal' && meal) initMealEditFields(meal);
            if (type === 'glucose' && glucoseLog) initGlucoseEditFields(glucoseLog);
            if (type === 'activity' && activityLog) initActivityEditFields(activityLog);
        }
        setIsEditing(!isEditing);
    };

    const handleSave = async () => {
        if (!user || !id) return;
        setIsSaving(true);

        try {
            if (type === 'meal') {
                if (!editMealName.trim()) {
                    Alert.alert('Invalid Input', 'Meal name cannot be empty');
                    setIsSaving(false);
                    return;
                }
                const updated = await updateMeal(id, user.id, {
                    name: editMealName.trim(),
                    meal_type: editMealType,
                    notes: editMealNotes.trim() || null,
                });
                if (updated) {
                    setMeal(updated);
                    initMealEditFields(updated);
                    setIsEditing(false);
                } else {
                    Alert.alert('Error', 'Failed to update meal.');
                }
            } else if (type === 'glucose') {
                const levelMmol = parseGlucoseInput(editGlucoseLevel, glucoseUnit);
                if (levelMmol === null || levelMmol <= 0) {
                    Alert.alert('Invalid Input', 'Please enter a valid glucose level');
                    setIsSaving(false);
                    return;
                }
                const updated = await updateGlucoseLog(id, user.id, {
                    glucose_level: levelMmol,
                    context: editGlucoseContext,
                    notes: editGlucoseNotes.trim() || null,
                });
                if (updated) {
                    setGlucoseLog(updated);
                    initGlucoseEditFields(updated);
                    setIsEditing(false);
                } else {
                    Alert.alert('Error', 'Failed to update glucose log.');
                }
            } else if (type === 'activity') {
                if (!editActivityName.trim()) {
                    Alert.alert('Invalid Input', 'Activity name cannot be empty');
                    setIsSaving(false);
                    return;
                }
                const durationNum = parseInt(editDuration, 10);
                if (isNaN(durationNum) || durationNum <= 0) {
                    Alert.alert('Invalid Input', 'Please enter a valid duration');
                    setIsSaving(false);
                    return;
                }
                if (!editIntensity) {
                    Alert.alert('Invalid Input', 'Please select an intensity level');
                    setIsSaving(false);
                    return;
                }
                const updated = await updateActivityLog(id, user.id, {
                    activity_name: editActivityName.trim(),
                    duration_minutes: durationNum,
                    intensity: editIntensity,
                    notes: editActivityNotes.trim() || null,
                });
                if (updated) {
                    setActivityLog(updated);
                    initActivityEditFields(updated);
                    setIsEditing(false);
                } else {
                    Alert.alert('Error', 'Failed to update activity log.');
                }
            }
        } catch (error) {
            console.error('Error saving:', error);
            Alert.alert('Error', 'An error occurred while saving.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = () => {
        const typeLabel = type === 'glucose' ? 'glucose log' : type === 'activity' ? 'activity log' : 'meal';
        Alert.alert(
            `Delete ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}`,
            `Are you sure you want to delete this ${typeLabel}? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        if (!user || !id) return;
                        setIsDeleting(true);
                        try {
                            let success = false;
                            if (type === 'meal') success = await deleteMeal(id, user.id);
                            else if (type === 'glucose') success = await deleteGlucoseLog(id, user.id);
                            else if (type === 'activity') success = await deleteActivityLog(id, user.id);

                            if (success) {
                                router.back();
                            } else {
                                Alert.alert('Error', `Failed to delete ${typeLabel}.`);
                            }
                        } catch (error) {
                            console.error('Error deleting:', error);
                            Alert.alert('Error', 'An error occurred while deleting.');
                        } finally {
                            setIsDeleting(false);
                        }
                    },
                },
            ]
        );
    };

    const getTitle = () => {
        if (type === 'meal') return 'MEAL DETAIL';
        if (type === 'glucose') return 'GLUCOSE DETAIL';
        if (type === 'activity') return 'ACTIVITY DETAIL';
        return 'LOG DETAIL';
    };

    const hasRecord =
        (type === 'meal' && meal) ||
        (type === 'glucose' && glucoseLog) ||
        (type === 'activity' && activityLog);

    // Render content based on type
    const renderMealContent = () => {
        if (!meal) return null;
        return (
            <>
                {mealPhotoUrl && (
                    <Image source={{ uri: mealPhotoUrl }} style={styles.mealPhoto} />
                )}

                <View style={styles.formCard}>
                    {/* Name */}
                    <View style={styles.block}>
                        <Text style={styles.label}>Name</Text>
                        {isEditing ? (
                            <View style={styles.inputShell}>
                                <TextInput
                                    value={editMealName}
                                    onChangeText={setEditMealName}
                                    placeholder="Meal name"
                                    placeholderTextColor="#878787"
                                    style={styles.textInput}
                                    returnKeyType="done"
                                />
                            </View>
                        ) : (
                            <Text style={styles.valueText}>{meal.name}</Text>
                        )}
                    </View>

                    {/* Meal Type */}
                    <View style={styles.block}>
                        <Text style={styles.label}>Meal Type</Text>
                        {isEditing ? (
                            <DropdownMenu
                                open={mealTypeModalOpen}
                                onOpenChange={setMealTypeModalOpen}
                                trigger={
                                    <Pressable
                                        onPress={() => setMealTypeModalOpen(true)}
                                        style={styles.selectShell}
                                    >
                                        <Text style={[styles.selectText, editMealType && styles.selectTextActive]}>
                                            {editMealType
                                                ? MEAL_TYPES.find(m => m.value === editMealType)?.label
                                                : 'Select Type'}
                                        </Text>
                                        <ChevronDown />
                                    </Pressable>
                                }
                            >
                                {MEAL_TYPES.map(option => (
                                    <DropdownMenuItem
                                        key={option.value}
                                        onSelect={() => {
                                            setEditMealType(option.value);
                                            setMealTypeModalOpen(false);
                                        }}
                                    >
                                        <Text style={styles.dropdownItemText}>{option.label}</Text>
                                        {editMealType === option.value && (
                                            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                                        )}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenu>
                        ) : (
                            <View style={styles.badgeRow}>
                                <View style={[styles.badge, { backgroundColor: Colors.mealLight }]}>
                                    <Text style={[styles.badgeText, { color: Colors.meal }]}>
                                        {meal.meal_type
                                            ? meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)
                                            : 'Meal'}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Logged Time */}
                    <View style={styles.block}>
                        <Text style={styles.label}>Logged At</Text>
                        <Text style={styles.valueText}>{formatDateTime(meal.logged_at)}</Text>
                    </View>

                    {/* Notes */}
                    <View style={styles.block}>
                        <Text style={styles.label}>Notes</Text>
                        {isEditing ? (
                            <View style={styles.inputShell}>
                                <TextInput
                                    value={editMealNotes}
                                    onChangeText={setEditMealNotes}
                                    placeholder="Add notes..."
                                    placeholderTextColor="#878787"
                                    style={styles.textInput}
                                    multiline
                                />
                            </View>
                        ) : (
                            <Text style={styles.valueTextSecondary}>
                                {meal.notes || 'No notes'}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Meal Items */}
                <View style={styles.formCard}>
                    <Text style={styles.sectionTitle}>Food Items</Text>
                    {mealItems.length === 0 ? (
                        <Text style={styles.emptyItemsText}>No food items logged</Text>
                    ) : (
                        mealItems.map((item, index) => (
                            <View key={item.id}>
                                {index > 0 && <View style={styles.itemDivider} />}
                                <View style={styles.mealItemRow}>
                                    <View style={styles.mealItemInfo}>
                                        <Text style={styles.mealItemName}>{item.display_name}</Text>
                                        <Text style={styles.mealItemServing}>
                                            {item.quantity} {item.unit}
                                            {item.brand ? ` - ${item.brand}` : ''}
                                        </Text>
                                    </View>
                                    <Text style={styles.mealItemCalories}>
                                        {Math.round(item.nutrients.calories_kcal || 0)} cal
                                    </Text>
                                </View>
                                <View style={styles.mealItemMacros}>
                                    <Text style={styles.macroChip}>
                                        C {Math.round(item.nutrients.carbs_g || 0)}g
                                    </Text>
                                    <Text style={styles.macroChip}>
                                        P {Math.round(item.nutrients.protein_g || 0)}g
                                    </Text>
                                    <Text style={styles.macroChip}>
                                        F {Math.round(item.nutrients.fat_g || 0)}g
                                    </Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>

                {/* Total Macros */}
                {mealItems.length > 0 && (
                    <View style={styles.formCard}>
                        <Text style={styles.sectionTitle}>Total Nutrition</Text>
                        <View style={styles.totalMacrosGrid}>
                            <View style={styles.macroBox}>
                                <Text style={styles.macroBoxValue}>{Math.round(totalMacros.calories)}</Text>
                                <Text style={styles.macroBoxLabel}>Calories</Text>
                            </View>
                            <View style={styles.macroBox}>
                                <Text style={styles.macroBoxValue}>{Math.round(totalMacros.carbs)}g</Text>
                                <Text style={styles.macroBoxLabel}>Carbs</Text>
                            </View>
                            <View style={styles.macroBox}>
                                <Text style={styles.macroBoxValue}>{Math.round(totalMacros.protein)}g</Text>
                                <Text style={styles.macroBoxLabel}>Protein</Text>
                            </View>
                            <View style={styles.macroBox}>
                                <Text style={styles.macroBoxValue}>{Math.round(totalMacros.fat)}g</Text>
                                <Text style={styles.macroBoxLabel}>Fat</Text>
                            </View>
                        </View>
                    </View>
                )}
            </>
        );
    };

    const renderGlucoseContent = () => {
        if (!glucoseLog) return null;
        return (
            <View style={styles.formCard}>
                {/* Glucose Level */}
                <View style={styles.block}>
                    <Text style={styles.label}>Glucose Level</Text>
                    {isEditing ? (
                        <View style={styles.glucoseInputRow}>
                            <View style={styles.glucoseInputShell}>
                                <TextInput
                                    value={editGlucoseLevel}
                                    onChangeText={setEditGlucoseLevel}
                                    placeholder={getGlucoseInputPlaceholder(glucoseUnit)}
                                    placeholderTextColor="#878787"
                                    style={styles.textInput}
                                    keyboardType="decimal-pad"
                                    returnKeyType="done"
                                />
                            </View>
                            <Text style={styles.unitLabel}>{glucoseUnit}</Text>
                        </View>
                    ) : (
                        <Text style={styles.valueLarge}>
                            {formatGlucoseWithUnit(glucoseLog.glucose_level, glucoseUnit)}
                        </Text>
                    )}
                </View>

                {/* Context */}
                <View style={styles.block}>
                    <Text style={styles.label}>Context</Text>
                    {isEditing ? (
                        <DropdownMenu
                            open={contextModalOpen}
                            onOpenChange={setContextModalOpen}
                            trigger={
                                <Pressable
                                    onPress={() => setContextModalOpen(true)}
                                    style={styles.selectShell}
                                >
                                    <Text style={[styles.selectText, editGlucoseContext && styles.selectTextActive]}>
                                        {editGlucoseContext
                                            ? GLUCOSE_CONTEXTS.find(c => c.value === editGlucoseContext)?.label
                                            : 'Select Context'}
                                    </Text>
                                    <ChevronDown />
                                </Pressable>
                            }
                        >
                            {GLUCOSE_CONTEXTS.map(ctx => (
                                <DropdownMenuItem
                                    key={ctx.value}
                                    onSelect={() => {
                                        setEditGlucoseContext(ctx.value);
                                        setContextModalOpen(false);
                                    }}
                                >
                                    <Text style={styles.dropdownItemText}>{ctx.label}</Text>
                                    {editGlucoseContext === ctx.value && (
                                        <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenu>
                    ) : (
                        <View style={styles.badgeRow}>
                            <View style={[styles.badge, { backgroundColor: Colors.glucoseLight }]}>
                                <Text style={[styles.badgeText, { color: Colors.glucose }]}>
                                    {formatContextLabel(glucoseLog.context)}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Logged Time */}
                <View style={styles.block}>
                    <Text style={styles.label}>Logged At</Text>
                    <Text style={styles.valueText}>{formatDateTime(glucoseLog.logged_at)}</Text>
                </View>

                {/* Notes */}
                <View style={styles.block}>
                    <Text style={styles.label}>Notes</Text>
                    {isEditing ? (
                        <View style={styles.inputShell}>
                            <TextInput
                                value={editGlucoseNotes}
                                onChangeText={setEditGlucoseNotes}
                                placeholder="Add notes..."
                                placeholderTextColor="#878787"
                                style={styles.textInput}
                                multiline
                            />
                        </View>
                    ) : (
                        <Text style={styles.valueTextSecondary}>
                            {glucoseLog.notes || 'No notes'}
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    const renderActivityContent = () => {
        if (!activityLog) return null;
        return (
            <View style={styles.formCard}>
                {/* Activity Name */}
                <View style={styles.block}>
                    <Text style={styles.label}>Activity Name</Text>
                    {isEditing ? (
                        <View style={styles.inputShell}>
                            <TextInput
                                value={editActivityName}
                                onChangeText={setEditActivityName}
                                placeholder="Activity name"
                                placeholderTextColor="#878787"
                                style={styles.textInput}
                                returnKeyType="done"
                            />
                        </View>
                    ) : (
                        <Text style={styles.valueText}>{activityLog.activity_name}</Text>
                    )}
                </View>

                {/* Duration */}
                <View style={styles.block}>
                    <Text style={styles.label}>Duration</Text>
                    {isEditing ? (
                        <View style={styles.durationInputRow}>
                            <View style={styles.durationInputShell}>
                                <TextInput
                                    value={editDuration}
                                    onChangeText={setEditDuration}
                                    placeholder="Duration"
                                    placeholderTextColor="#878787"
                                    style={styles.textInput}
                                    keyboardType="number-pad"
                                    returnKeyType="done"
                                />
                            </View>
                            <Text style={styles.unitLabel}>mins</Text>
                        </View>
                    ) : (
                        <Text style={styles.valueText}>{activityLog.duration_minutes} minutes</Text>
                    )}
                </View>

                {/* Intensity */}
                <View style={styles.block}>
                    <Text style={styles.label}>Intensity</Text>
                    {isEditing ? (
                        <DropdownMenu
                            open={intensityModalOpen}
                            onOpenChange={setIntensityModalOpen}
                            trigger={
                                <Pressable
                                    onPress={() => setIntensityModalOpen(true)}
                                    style={styles.selectShell}
                                >
                                    <Text style={[styles.selectText, editIntensity && styles.selectTextActive]}>
                                        {editIntensity
                                            ? INTENSITY_OPTIONS.find(i => i.value === editIntensity)?.label
                                            : 'Select Intensity'}
                                    </Text>
                                    <ChevronDown />
                                </Pressable>
                            }
                        >
                            {INTENSITY_OPTIONS.map(option => (
                                <DropdownMenuItem
                                    key={option.value}
                                    onSelect={() => {
                                        setEditIntensity(option.value);
                                        setIntensityModalOpen(false);
                                    }}
                                >
                                    <Text style={styles.dropdownItemText}>{option.label}</Text>
                                    {editIntensity === option.value && (
                                        <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenu>
                    ) : (
                        <View style={styles.badgeRow}>
                            <View style={[styles.badge, { backgroundColor: Colors.activityLight }]}>
                                <Text style={[styles.badgeText, { color: Colors.activity }]}>
                                    {activityLog.intensity.charAt(0).toUpperCase() + activityLog.intensity.slice(1)}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Logged Time */}
                <View style={styles.block}>
                    <Text style={styles.label}>Logged At</Text>
                    <Text style={styles.valueText}>{formatDateTime(activityLog.logged_at)}</Text>
                </View>

                {/* Notes */}
                <View style={styles.block}>
                    <Text style={styles.label}>Notes</Text>
                    {isEditing ? (
                        <View style={styles.inputShell}>
                            <TextInput
                                value={editActivityNotes}
                                onChangeText={setEditActivityNotes}
                                placeholder="Add notes..."
                                placeholderTextColor="#878787"
                                style={styles.textInput}
                                multiline
                            />
                        </View>
                    ) : (
                        <Text style={styles.valueTextSecondary}>
                            {activityLog.notes || 'No notes'}
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    // Error / not found states
    if (!isValidParams && !isLoading) {
        return (
            <View style={styles.root}>
                <LinearGradient colors={['#1a1f24', '#181c20', '#111111']} locations={[0, 0.3, 1]} style={styles.topGlow} />
                <SafeAreaView edges={['top']} style={styles.safe}>
                    <View style={styles.header}>
                        <LiquidGlassIconButton size={44} onPress={() => router.back()}>
                            <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
                        </LiquidGlassIconButton>
                        <Text style={styles.headerTitle}>ERROR</Text>
                        <View style={styles.headerSpacer} />
                    </View>
                    <View style={styles.emptyState}>
                        <Ionicons name="alert-circle-outline" size={48} color={Colors.textTertiary} />
                        <Text style={styles.emptyStateText}>Invalid log parameters</Text>
                        <Pressable onPress={() => router.back()} style={styles.backLink}>
                            <Text style={styles.backLinkText}>Go back</Text>
                        </Pressable>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <LinearGradient
                colors={['#1a1f24', '#181c20', '#111111']}
                locations={[0, 0.3, 1]}
                style={styles.topGlow}
            />

            <SafeAreaView edges={['top']} style={styles.safe}>
                {/* Header */}
                <View style={styles.header}>
                    <LiquidGlassIconButton size={44} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
                    </LiquidGlassIconButton>

                    <Text style={styles.headerTitle}>{getTitle()}</Text>

                    {hasRecord ? (
                        <LiquidGlassIconButton size={44} onPress={handleToggleEdit}>
                            <Ionicons
                                name={isEditing ? 'close' : 'pencil'}
                                size={20}
                                color="#E7E8E9"
                            />
                        </LiquidGlassIconButton>
                    ) : (
                        <View style={styles.headerSpacer} />
                    )}
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.textTertiary} />
                    </View>
                ) : !hasRecord ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="document-text-outline" size={48} color={Colors.textTertiary} />
                        <Text style={styles.emptyStateText}>Log not found</Text>
                        <Pressable onPress={() => router.back()} style={styles.backLink}>
                            <Text style={styles.backLinkText}>Go back</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.content}
                        >
                            {type === 'meal' && renderMealContent()}
                            {type === 'glucose' && renderGlucoseContent()}
                            {type === 'activity' && renderActivityContent()}
                        </ScrollView>

                        {/* Bottom Button */}
                        <View style={styles.bottomButtonContainer}>
                            {isEditing ? (
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
                                        <Text style={styles.saveButtonText}>Save Changes</Text>
                                    )}
                                </Pressable>
                            ) : (
                                <Pressable
                                    onPress={handleDelete}
                                    disabled={isDeleting}
                                    style={({ pressed }) => [
                                        styles.deleteButton,
                                        isDeleting && styles.saveButtonDisabled,
                                        pressed && !isDeleting && styles.deleteButtonPressed,
                                    ]}
                                >
                                    {isDeleting ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <>
                                            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                            <Text style={styles.deleteButtonText}>Delete</Text>
                                        </>
                                    )}
                                </Pressable>
                            )}
                        </View>
                    </>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#111111',
    },
    topGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 220,
    },
    safe: {
        flex: 1,
    },
    header: {
        height: 72,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        letterSpacing: 1,
    },
    headerSpacer: {
        width: 44,
        height: 44,
        opacity: 0,
    },
    content: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: Platform.OS === 'ios' ? 120 : 100,
        gap: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    emptyStateText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: Colors.textPrimary,
    },
    backLink: {
        marginTop: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    backLinkText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.primary,
    },
    // Form card
    formCard: {
        backgroundColor: 'rgba(63,66,67,0.25)',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 20,
        gap: 24,
    },
    block: {
        gap: 10,
    },
    label: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textTertiary,
    },
    valueText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    valueLarge: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: Colors.textPrimary,
    },
    valueTextSecondary: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: Colors.textSecondary,
    },
    // Input styles (match log-activity / log-glucose)
    inputShell: {
        backgroundColor: '#1b1b1c',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#313135',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    textInput: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
        padding: 0,
    },
    selectShell: {
        backgroundColor: '#1b1b1c',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#313135',
        paddingHorizontal: 16,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#878787',
    },
    selectTextActive: {
        color: Colors.textPrimary,
    },
    glucoseInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    glucoseInputShell: {
        flex: 1,
        backgroundColor: '#1b1b1c',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#313135',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    durationInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    durationInputShell: {
        flex: 1,
        backgroundColor: '#1b1b1c',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#313135',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    unitLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    dropdownItemText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
        flex: 1,
    },
    // Badge styles
    badgeRow: {
        flexDirection: 'row',
    },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    badgeText: {
        fontFamily: fonts.medium,
        fontSize: 14,
    },
    // Meal photo
    mealPhoto: {
        width: '100%',
        height: 200,
        borderRadius: 16,
        backgroundColor: '#1a1b1c',
    },
    // Section title
    sectionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    emptyItemsText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
    },
    // Meal item styles
    mealItemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    mealItemInfo: {
        flex: 1,
        gap: 4,
    },
    mealItemName: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    mealItemServing: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
    },
    mealItemCalories: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textPrimary,
        marginLeft: 12,
    },
    mealItemMacros: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 6,
    },
    macroChip: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    itemDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 12,
    },
    // Total macros grid
    totalMacrosGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    macroBox: {
        alignItems: 'center',
        gap: 4,
        flex: 1,
    },
    macroBoxValue: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
    },
    macroBoxLabel: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    // Bottom buttons
    bottomButtonContainer: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 40 : 20,
        left: 16,
        right: 16,
    },
    saveButton: {
        backgroundColor: '#285E2A',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#448D47',
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
    deleteButton: {
        backgroundColor: 'rgba(255, 59, 48, 0.12)',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 59, 48, 0.3)',
    },
    deleteButtonPressed: {
        opacity: 0.8,
    },
    deleteButtonText: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: '#FF3B30',
    },
});
