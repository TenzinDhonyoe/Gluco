import { Input } from '@/components/ui/input';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Colors } from '@/constants/Colors';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { schedulePostMealActionReminder, schedulePostMealReviewNotification } from '@/lib/notifications';
import {
  addMealItems,
  createGlucoseLog,
  createMeal,
  CreateMealItemInput,
  deleteMeal,
  invokeMealAdjustments,
  MealAdjustment,
  NormalizedFood,
  uploadMealPhoto,
} from '@/lib/supabase';
import { getGlucoseInputPlaceholder, parseGlucoseInput } from '@/lib/utils/glucoseUnits';
import { getSmartUnitOptions } from '@/lib/utils/portionUnits';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MEAL_DRAFT_KEY = 'meal_log_draft';
const MEAL_ITEMS_DRAFT_KEY = 'meal_items_draft';

interface SelectedMealItem extends NormalizedFood {
  quantity: number;
  source?: 'matched' | 'manual';
  originalText?: string;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTime(d: Date) {
  const hh = d.getHours();
  const mm = d.getMinutes();
  const h12 = ((hh + 11) % 12) + 1;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toParts(date: Date) {
  const hours24 = date.getHours();
  const period: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM';
  const hour12 = ((hours24 + 11) % 12) + 1;
  return { hour12, minute: date.getMinutes(), period };
}

function applyTime(base: Date, parts: { hour12: number; minute: number; period: 'AM' | 'PM' }) {
  const { hour12, minute, period } = parts;
  let hours24 = hour12 % 12;
  if (period === 'PM') hours24 += 12;
  const d = new Date(base);
  d.setHours(hours24);
  d.setMinutes(minute);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

function buildMealName(items: SelectedMealItem[], fallbackText: string) {
  const names = items
    .map((item) => item.display_name?.trim())
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) {
    const trimmed = fallbackText.trim();
    return trimmed ? trimmed.slice(0, 40) : 'Meal';
  }

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}

function mergeItems(existing: SelectedMealItem[], incoming: SelectedMealItem[]) {
  const existingIds = new Set(existing.map((item) => `${item.provider}-${item.external_id}`));
  const next = [...existing];
  incoming.forEach((item) => {
    if (!existingIds.has(`${item.provider}-${item.external_id}`)) {
      next.push(item);
    }
  });
  return next;
}

function determineMealType(mealTime: Date): 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' {
  const hour = mealTime.getHours();
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 15) return 'Lunch';
  if (hour >= 15 && hour < 18) return 'Snack';
  if (hour >= 18 && hour < 22) return 'Dinner';
  return 'Snack';
}

// Calculate a simple meal score based on nutritional balance (0-10)
function calculateMealScore(summary: { calories: number; carbs: number; protein: number; fat: number }): number {
  if (summary.calories === 0) return 0;

  // Simple scoring based on macro balance
  const proteinRatio = summary.protein * 4 / summary.calories; // protein calories ratio
  const carbRatio = summary.carbs * 4 / summary.calories;
  const fatRatio = summary.fat * 9 / summary.calories;

  let score = 5; // Base score

  // Protein bonus (15-35% is ideal)
  if (proteinRatio >= 0.15 && proteinRatio <= 0.35) score += 2;
  else if (proteinRatio >= 0.10 && proteinRatio <= 0.40) score += 1;

  // Balanced carbs (40-55% is ideal)
  if (carbRatio >= 0.40 && carbRatio <= 0.55) score += 2;
  else if (carbRatio >= 0.30 && carbRatio <= 0.60) score += 1;

  // Moderate fat (20-35% is ideal)
  if (fatRatio >= 0.20 && fatRatio <= 0.35) score += 1;

  return Math.min(10, Math.max(1, Math.round(score)));
}

// ============================================
// ANNOTATION BUBBLE POSITIONS
// ============================================

function getBubblePositions(itemCount: number, photoHeight: number): { x: number; y: number; align: 'left' | 'right' }[] {
  const positions: { x: number; y: number; align: 'left' | 'right' }[] = [
    { x: 16, y: photoHeight * 0.15, align: 'left' },
    { x: SCREEN_WIDTH - 16, y: photoHeight * 0.2, align: 'right' },
    { x: 16, y: photoHeight * 0.4, align: 'left' },
    { x: SCREEN_WIDTH - 16, y: photoHeight * 0.45, align: 'right' },
    { x: 16, y: photoHeight * 0.65, align: 'left' },
  ];
  return positions.slice(0, Math.min(itemCount, 5));
}

// ============================================
// SUB-COMPONENTS
// ============================================

function MealTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    Breakfast: '#FF9500',
    Lunch: '#34C759',
    Dinner: '#5856D6',
    Snack: '#FF2D55',
  };
  const color = colors[type] || '#8E8E93';

  return (
    <View style={[styles.mealTypeBadge, { backgroundColor: `${color}20` }]}>
      <Text style={[styles.mealTypeBadgeText, { color }]}>{type}</Text>
    </View>
  );
}

function FoodAnnotationBubble({
  item,
  position,
  index,
}: {
  item: SelectedMealItem;
  position: { x: number; y: number; align: 'left' | 'right' };
  index: number;
}) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const translateAnim = React.useRef(new Animated.Value(position.align === 'left' ? -20 : 20)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateAnim, index]);

  const bubbleStyle = position.align === 'left'
    ? { left: position.x, top: position.y }
    : { right: SCREEN_WIDTH - position.x, top: position.y };

  const calories = Math.round((item.calories_kcal ?? 0) * (item.quantity || 1));

  return (
    <Animated.View
      style={[
        styles.annotationBubble,
        bubbleStyle,
        {
          opacity: fadeAnim,
          transform: [{ translateX: translateAnim }],
        },
      ]}
    >
      <Text style={styles.annotationName} numberOfLines={1}>{item.display_name}</Text>
      <Text style={styles.annotationCalories}>{calories}</Text>
    </Animated.View>
  );
}

// Simple macro row configuration - matches mockup
const SIMPLE_MACRO_CONFIG = [
  { key: 'carbs' as const, label: 'CARBS' },
  { key: 'protein' as const, label: 'PROTEIN' },
  { key: 'fibre' as const, label: 'FIBER' },
  { key: 'fat' as const, label: 'FAT' },
];

function SimpleMacroRow({ totals }: { totals: { carbs: number; protein: number; fat: number; fibre: number } }) {
  return (
    <View style={styles.simpleMacroRow}>
      {SIMPLE_MACRO_CONFIG.map((macro) => (
        <View key={macro.key} style={styles.simpleMacroItem}>
          <Text style={styles.simpleMacroLabel}>{macro.label}</Text>
          <Text style={styles.simpleMacroValue}>
            {Math.round(totals[macro.key])}g
          </Text>
        </View>
      ))}
    </View>
  );
}

// Generate AI-like insights based on meal content
function generateMealInsights(summary: any, items: any[]): string[] {
  const insights: string[] = [];
  const { carbs, protein, fat, fibre } = summary;

  // 1. Protein Analysis
  if (protein >= 30) {
    insights.push("High protein content supports muscle maintenance and satiety.");
  } else if (protein >= 15) {
    insights.push("Good source of protein to help stabilize blood sugar response.");
  } else if (carbs > 40 && protein < 10) {
    insights.push("Low protein relative to carbohydrates may lead to faster glucose absorption.");
  }

  // 2. Fiber Analysis
  if (fibre >= 10) {
    insights.push("Excellent fiber content promotes digestive health and reduces glycemic impact.");
  } else if (fibre >= 5) {
    insights.push("Contains dietary fiber which helps moderate glucose spikes.");
  } else if (carbs > 30 && fibre < 2) {
    insights.push("Low fiber content may result in more rapid blood sugar elevation.");
  }

  // 3. Macronutrient Balance
  if (protein > 20 && carbs > 20 && fat > 10) {
    insights.push("Balanced macronutrient profile provides sustained energy release.");
  } else if (fat > 20 && carbs < 20) {
    insights.push("Healthy fats provide steady energy without significant insulin spike.");
  } else if (fat > 20 && carbs > 50) {
    insights.push("Combination of fats and carbs may prolong post-meal glucose response.");
  }

  // 4. Food-Specific Insights
  const allNames = items.map(i => (i.name || i.display_name || '').toLowerCase()).join(' ');
  if (allNames.match(/fruit|berry|apple|banana|orange|grape|mango/)) {
    insights.push("Natural sugars from fruit provide quick energy accompanied by some fiber.");
  }
  if (allNames.match(/oat|quinoa|rice|pasta|bread|grain/)) {
    insights.push("Complex carbohydrates provide sustained fuel for activity.");
  }
  if (allNames.match(/salmon|fish|avocado|nut|seed|olive/)) {
    insights.push("Rich in healthy fats supporting metabolic health.");
  }
  if (allNames.match(/yogurt|kefir|kimchi|fermented/)) {
    insights.push("Contains probiotics supporting gut microbiome health.");
  }
  if (allNames.match(/sugar|candy|soda|sweet|cake|cookie/)) {
    insights.push("High glycemic index foods may cause rapid glucose fluctuations.");
  }

  // Fallback if no specific insights generated
  if (insights.length === 0) {
    if (carbs < 20) insights.push("Low carbohydrate meal has minimal impact on blood glucose.");
    else insights.push("Standard meal composition.");
  }

  // Return top 3 unique insights
  const unique = Array.from(new Set(insights));
  return unique.length > 0 ? unique.slice(0, 3) : ["Balanced meal."];
}

// Circular progress indicator metabolic score - matches mockup design
function MetabolicScoreBadge({ score }: { score: number }) {
  // Convert 0-10 score to 0-100 for display
  const displayScore = Math.round(score * 10);

  // Circle dimensions
  const size = 48;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate stroke offset based on percentage (score is 0-10, so divide by 10)
  const percentage = score / 10;
  const strokeDashoffset = circumference * (1 - percentage);

  // Get color based on score
  const getProgressColor = () => {
    if (score >= 7) return '#C4E538'; // Yellow-green for high scores
    if (score >= 4) return '#FF9500'; // Orange for medium scores
    return '#FF3B30'; // Red for low scores
  };

  return (
    <View style={styles.metabolicScoreRow}>
      <Text style={styles.metabolicScoreLabel}>Metabolic Score</Text>
      <View style={styles.circularScoreContainer}>
        <Svg width={size} height={size}>
          {/* Background circle (gray track) */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getProgressColor()}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        {/* Score text in center */}
        <View style={styles.scoreTextContainer}>
          <Text style={[styles.circularScoreText, { color: getProgressColor() }]}>
            {displayScore}
          </Text>
        </View>
      </View>
    </View>
  );
}

function QuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (newValue: number) => void;
}) {
  return (
    <View style={styles.quantityStepper}>
      <Pressable
        onPress={() => onChange(Math.max(1, value - 1))}
        style={styles.stepperButton}
      >
        <Ionicons name="remove" size={16} color="#FFFFFF" />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        style={styles.stepperButton}
      >
        <Ionicons name="add" size={16} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function AdjustmentCard({
  adjustment,
  isSelected,
  onToggle,
}: {
  adjustment: MealAdjustment;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.adjustmentCard,
        pressed && styles.adjustmentCardPressed,
      ]}
    >
      <View style={styles.adjustmentContent}>
        <Text style={styles.adjustmentAction}>{adjustment.action}</Text>
        <Text style={styles.adjustmentImpact}>{adjustment.impact}</Text>
        <Text style={styles.adjustmentDescription}>{adjustment.description}</Text>
      </View>
      <View style={[styles.adjustmentCheckbox, isSelected && styles.adjustmentCheckboxSelected]}>
        {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      </View>
    </Pressable>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function LogMealReviewScreen() {
  const { user } = useAuth();
  const glucoseUnit = useGlucoseUnit();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [items, setItems] = React.useState<SelectedMealItem[]>([]);
  const [mealNotes, setMealNotes] = React.useState('');
  const [mealNameHint, setMealNameHint] = React.useState('');
  const [mealTitle, setMealTitle] = React.useState('');
  const [mealTitleEdited, setMealTitleEdited] = React.useState(false);
  const [imageUri, setImageUri] = React.useState<string | null>(null);
  const [photoPath, setPhotoPath] = React.useState<string | null>(null);
  const [mealTime, setMealTime] = React.useState<Date>(new Date());
  const [isSaving, setIsSaving] = React.useState(false);
  const [servings, setServings] = React.useState(1);
  const [quantityInputs, setQuantityInputs] = React.useState<Record<string, string>>({});

  const [glucoseValue, setGlucoseValue] = React.useState('');
  const [fixResultsOpen, setFixResultsOpen] = React.useState(false);

  // Adjustments state
  const [adjustments, setAdjustments] = React.useState<MealAdjustment[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = React.useState(false);
  const [selectedAdjustments, setSelectedAdjustments] = React.useState<Set<string>>(new Set());

  // Manual macro override state (null = use calculated values from items)
  const [macroOverrides, setMacroOverrides] = React.useState<{
    carbs: string | null;
    protein: string | null;
    fibre: string | null;
    fat: string | null;
  }>({ carbs: null, protein: null, fibre: null, fat: null });

  const [timeModalOpen, setTimeModalOpen] = React.useState(false);
  const HOURS = React.useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')), []);
  const MINUTES = React.useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')), []);
  const PERIODS = React.useMemo(() => ['AM', 'PM'] as const, []);

  const initialParts = React.useMemo(() => toParts(new Date()), []);
  const [tempHour12, setTempHour12] = React.useState(initialParts.hour12);
  const [tempMinute, setTempMinute] = React.useState(initialParts.minute);
  const [tempPeriod, setTempPeriod] = React.useState<'AM' | 'PM'>(initialParts.period);

  const ITEM_H = 44;
  const V_PAD = ITEM_H * 1;
  const hourRef = React.useRef<FlatList<string>>(null);
  const minuteRef = React.useRef<FlatList<string>>(null);
  const periodRef = React.useRef<FlatList<'AM' | 'PM'>>(null);

  const PHOTO_HEIGHT = SCREEN_HEIGHT * 0.45;

  React.useEffect(() => {
    if (!timeModalOpen) return;
    const parts = toParts(mealTime);
    setTempHour12(parts.hour12);
    setTempMinute(parts.minute);
    setTempPeriod(parts.period);
  }, [timeModalOpen, mealTime]);

  React.useEffect(() => {
    if (!timeModalOpen) return;
    const t = setTimeout(() => {
      hourRef.current?.scrollToOffset({ offset: (tempHour12 - 1) * ITEM_H, animated: false });
      minuteRef.current?.scrollToOffset({ offset: tempMinute * ITEM_H, animated: false });
      periodRef.current?.scrollToOffset({ offset: (tempPeriod === 'AM' ? 0 : 1) * ITEM_H, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [timeModalOpen, tempHour12, tempMinute, tempPeriod, ITEM_H]);

  const onWheelEnd = React.useCallback((kind: 'hour' | 'minute' | 'period', y: number) => {
    const idx = Math.round(y / ITEM_H);
    if (kind === 'hour') setTempHour12(clamp(idx + 1, 1, 12));
    if (kind === 'minute') setTempMinute(clamp(idx, 0, 59));
    if (kind === 'period') setTempPeriod(idx >= 1 ? 'PM' : 'AM');
  }, [ITEM_H]);

  const summary = React.useMemo(() => {
    const totals = items.reduce(
      (acc, item) => {
        const qty = item.quantity || 1;
        return {
          calories: acc.calories + ((item.calories_kcal ?? 0) * qty),
          carbs: acc.carbs + ((item.carbs_g ?? 0) * qty),
          protein: acc.protein + ((item.protein_g ?? 0) * qty),
          fat: acc.fat + ((item.fat_g ?? 0) * qty),
          fibre: acc.fibre + ((item.fibre_g ?? 0) * qty),
          hasData: acc.hasData || item.carbs_g !== null,
        };
      },
      { calories: 0, carbs: 0, protein: 0, fat: 0, fibre: 0, hasData: false }
    );

    // Use overrides if provided, otherwise use calculated values
    const parseOverride = (val: string | null | undefined, fallback: number) => {
      if (val === null || val === undefined || val.trim() === '') return fallback;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? fallback : parsed;
    };

    return {
      calories: Math.round(totals.calories * servings),
      carbs: Math.round(parseOverride(macroOverrides.carbs, totals.carbs * servings)),
      protein: Math.round(parseOverride(macroOverrides.protein, totals.protein * servings)),
      fat: Math.round(parseOverride(macroOverrides.fat, totals.fat * servings)),
      fibre: Math.round(parseOverride(macroOverrides.fibre, totals.fibre * servings)),
      hasData: totals.hasData || Object.values(macroOverrides).some(v => v !== null && v !== undefined && (typeof v === 'string' ? v.trim() !== '' : true)),
    };
  }, [items, servings, macroOverrides]);

  const mealScore = React.useMemo(() => calculateMealScore(summary), [summary]);

  const drivers = React.useMemo(() => generateMealInsights(summary, items), [summary, items]);

  const autoMealTitle = React.useMemo(
    () => buildMealName(items, mealNotes || mealNameHint),
    [items, mealNotes, mealNameHint]
  );

  React.useEffect(() => {
    if (!mealTitleEdited) {
      setMealTitle(autoMealTitle);
    }
  }, [autoMealTitle, mealTitleEdited]);

  const mealType = React.useMemo(() => determineMealType(mealTime), [mealTime]);

  // Fetch adjustments when items change
  React.useEffect(() => {
    if (!user || items.length === 0) {
      setAdjustments([]);
      return;
    }

    const fetchAdjustments = async () => {
      setAdjustmentsLoading(true);
      try {
        const mealItemsForApi = items.map(item => ({
          display_name: item.display_name,
          calories_kcal: item.calories_kcal,
          carbs_g: item.carbs_g,
          protein_g: item.protein_g,
          fat_g: item.fat_g,
          fibre_g: item.fibre_g,
          sugar_g: item.sugar_g ?? null,
          quantity: item.quantity || 1,
        }));

        const result = await invokeMealAdjustments(user.id, mealItemsForApi, mealType.toLowerCase());
        if (result?.adjustments) {
          setAdjustments(result.adjustments);
        }
      } catch (error) {
        console.error('Failed to fetch adjustments:', error);
      } finally {
        setAdjustmentsLoading(false);
      }
    };

    // Debounce to avoid too many API calls
    const timeout = setTimeout(fetchAdjustments, 500);
    return () => clearTimeout(timeout);
  }, [user, items, mealType]);

  // Parse params
  React.useEffect(() => {
    if (params.items && typeof params.items === 'string') {
      try {
        const parsed = JSON.parse(params.items) as SelectedMealItem[];
        setItems(parsed);
      } catch (e) {
        console.error('Failed to parse items:', e);
      }
    }
    if (params.mealNotes && typeof params.mealNotes === 'string') {
      setMealNotes(params.mealNotes);
    }
    if (params.mealName && typeof params.mealName === 'string') {
      setMealNameHint(params.mealName);
      setMealTitle(params.mealName);
    }
    if (params.mealTitleEdited && typeof params.mealTitleEdited === 'string') {
      const edited = params.mealTitleEdited === '1' || params.mealTitleEdited === 'true';
      setMealTitleEdited(edited);
    }
    if (params.imageUri && typeof params.imageUri === 'string') {
      setImageUri(params.imageUri || null);
    }
    if (params.photoPath && typeof params.photoPath === 'string') {
      setPhotoPath(params.photoPath || null);
    }
    if (params.mealTime && typeof params.mealTime === 'string') {
      const parsed = new Date(params.mealTime);
      if (!Number.isNaN(parsed.getTime())) {
        setMealTime(parsed);
      }
    }
    if (params.macroOverrides && typeof params.macroOverrides === 'string') {
      try {
        const overrides = JSON.parse(params.macroOverrides);
        setMacroOverrides(overrides);
      } catch (e) {
        console.error('Failed to parse macroOverrides:', e);
      }
    }
  }, [params.items, params.mealNotes, params.mealName, params.mealTitleEdited, params.imageUri, params.photoPath, params.mealTime, params.macroOverrides]);

  React.useEffect(() => {
    if (!params.selectedFoods || typeof params.selectedFoods !== 'string') return;
    const replaceIndex = typeof params.replaceIndex === 'string' ? Number(params.replaceIndex) : null;

    try {
      const selected = JSON.parse(params.selectedFoods) as SelectedMealItem[];
      if (replaceIndex !== null && !Number.isNaN(replaceIndex) && selected.length > 0) {
        setItems((prev) => {
          if (replaceIndex < 0 || replaceIndex >= prev.length) return prev;
          const next = [...prev];
          next[replaceIndex] = selected[0];
          return next;
        });
        return;
      }
      setItems((prev) => mergeItems(prev, selected));
    } catch (e) {
      console.error('Failed to parse selected foods:', e);
    }
  }, [params.selectedFoods, params.replaceIndex]);

  React.useEffect(() => {
    setQuantityInputs((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const key = `${item.provider}-${item.external_id}`;
        if (!next[key]) {
          next[key] = String(item.quantity || 1);
        }
      });
      return next;
    });
  }, [items]);

  const getUnitOptions = React.useCallback(
    (item: SelectedMealItem) => getSmartUnitOptions(item.display_name || '', item.serving_unit || undefined),
    []
  );

  const handleUpdateQuantity = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev];
      const item = next[index];
      const nextQty = Math.max(0.25, (item.quantity || 1) + delta);
      next[index] = { ...item, quantity: nextQty };
      const key = `${item.provider}-${item.external_id}`;
      setQuantityInputs((prevInputs) => ({ ...prevInputs, [key]: String(nextQty) }));
      return next;
    });
  };

  const handleQuantityInputChange = (index: number, text: string) => {
    const item = items[index];
    if (!item) return;
    const key = `${item.provider}-${item.external_id}`;
    setQuantityInputs((prev) => ({ ...prev, [key]: text }));

    const parsed = Number(text.replace(',', '.'));
    if (!Number.isNaN(parsed) && parsed > 0) {
      setItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], quantity: parsed };
        return next;
      });
    }
  };

  const handleQuantityInputBlur = (index: number) => {
    const item = items[index];
    if (!item) return;
    const key = `${item.provider}-${item.external_id}`;
    const currentText = quantityInputs[key];
    const parsed = Number(currentText?.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed <= 0) {
      setQuantityInputs((prev) => ({ ...prev, [key]: String(item.quantity || 1) }));
    }
  };

  const handleUnitChange = (index: number, unit: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], serving_unit: unit };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddItem = () => {
    setFixResultsOpen(false);
    router.push({
      pathname: '/log-meal-items',
      params: {
        existingItems: JSON.stringify(items),
        returnTo: '/log-meal-review',
        mealName: mealTitle,
        mealTitleEdited: mealTitleEdited ? '1' : '0',
        mealNotes,
        imageUri: imageUri || '',
        photoPath: photoPath || '',
        mealTime: mealTime.toISOString(),
      },
    } as any);
  };

  const handleReplaceItem = (index: number) => {
    setFixResultsOpen(false);
    router.push({
      pathname: '/log-meal-items',
      params: {
        existingItems: JSON.stringify(items),
        returnTo: '/log-meal-review',
        replaceIndex: String(index),
        mealName: mealTitle,
        mealTitleEdited: mealTitleEdited ? '1' : '0',
        mealNotes,
        imageUri: imageUri || '',
        photoPath: photoPath || '',
        mealTime: mealTime.toISOString(),
      },
    } as any);
  };

  const handleSaveMeal = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to save a meal.');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Add items', 'Please add at least one meal item before saving.');
      return;
    }

    const trimmedGlucose = glucoseValue.trim();
    const glucoseLevelMmol = trimmedGlucose
      ? parseGlucoseInput(trimmedGlucose, glucoseUnit)
      : null;

    if (trimmedGlucose && glucoseLevelMmol === null) {
      Alert.alert('Invalid Input', 'Please enter a valid glucose level or clear the field.');
      return;
    }

    setIsSaving(true);

    try {
      let photoUrl: string | null = photoPath;
      if (!photoUrl && imageUri) {
        photoUrl = await uploadMealPhoto(user.id, imageUri);
      }

      const finalMealTitle = mealTitle.trim() || autoMealTitle;
      const meal = await createMeal(user.id, {
        name: finalMealTitle,
        meal_type: mealType.toLowerCase() as any,
        logged_at: mealTime.toISOString(),
        photo_path: photoUrl,
        notes: mealNotes || null,
      });

      if (!meal) {
        Alert.alert('Error', 'Failed to save meal.');
        return;
      }

      const mealItems: CreateMealItemInput[] = items.map((item) => ({
        provider: item.provider,
        external_id: item.external_id,
        display_name: item.display_name,
        brand: item.brand,
        quantity: item.quantity * servings,
        unit: 'serving',
        serving_size: item.serving_size,
        serving_unit: item.serving_unit,
        nutrients: {
          calories_kcal: item.calories_kcal,
          carbs_g: item.carbs_g,
          protein_g: item.protein_g,
          fat_g: item.fat_g,
          fibre_g: item.fibre_g,
          sugar_g: item.sugar_g,
          sodium_mg: item.sodium_mg,
        },
      }));

      try {
        await addMealItems(user.id, meal.id, mealItems);
      } catch (itemError) {
        // Items failed to save - clean up the orphaned meal
        console.error('Failed to save meal items, cleaning up meal:', itemError);
        await deleteMeal(meal.id, user.id);
        Alert.alert('Save Failed', 'Could not save meal items. Please try again.');
        return;
      }

      if (glucoseLevelMmol !== null) {
        await createGlucoseLog(user.id, {
          glucose_level: glucoseLevelMmol,
          unit: 'mmol/L',
          logged_at: mealTime.toISOString(),
          context: 'pre_meal',
          notes: `Logged with meal: ${finalMealTitle}`,
        });
      }

      const proposedCheckIn = new Date(mealTime.getTime() + 60 * 60 * 1000);
      const minCheckIn = new Date(Date.now() + 60 * 1000);
      const checkInTime = proposedCheckIn > minCheckIn ? proposedCheckIn : minCheckIn;
      await schedulePostMealReviewNotification(meal.id, meal.name, checkInTime, user.id).catch(() => {
        // Non-critical - don't fail the save if notification scheduling fails
      });
      await schedulePostMealActionReminder(meal.id, meal.name, user.id).catch(() => {
        // Non-critical - don't fail the save if notification scheduling fails
      });

      await AsyncStorage.multiRemove([MEAL_DRAFT_KEY, MEAL_ITEMS_DRAFT_KEY]);

      router.dismissTo('/(tabs)');
    } catch (error) {
      console.error('Save meal error:', error);
      Alert.alert('Error', 'Failed to save meal.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderItemRow = (item: SelectedMealItem, index: number) => (
    <View key={`${item.provider}-${item.external_id}`} style={styles.fixItemRow}>
      <View style={styles.fixItemHeader}>
        <Text style={styles.fixItemName}>{item.display_name}</Text>
        {item.source === 'manual' && (
          <View style={styles.needsReviewPill}>
            <Text style={styles.needsReviewText}>Needs review</Text>
          </View>
        )}
      </View>

      <View style={styles.fixItemControls}>
        <View style={styles.qtyRow}>
          <Pressable onPress={() => handleUpdateQuantity(index, -0.25)} style={styles.qtyButton}>
            <Ionicons name="remove" size={18} color="#FFFFFF" />
          </Pressable>
          <TextInput
            value={quantityInputs[`${item.provider}-${item.external_id}`] ?? String(item.quantity || 1)}
            onChangeText={(text) => handleQuantityInputChange(index, text)}
            onBlur={() => handleQuantityInputBlur(index)}
            keyboardType="decimal-pad"
            style={styles.qtyInput}
          />
          <Pressable onPress={() => handleUpdateQuantity(index, 0.25)} style={styles.qtyButton}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.fixItemActions}>
          <Pressable onPress={() => handleReplaceItem(index)} style={styles.replaceButton}>
            <Text style={styles.replaceButtonText}>Replace</Text>
          </Pressable>
          <Pressable onPress={() => handleRemoveItem(index)} style={styles.removeButton} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
          </Pressable>
        </View>
      </View>

      <View style={styles.unitRow}>
        {getUnitOptions(item).map((unit) => {
          const active = (item.serving_unit || 'serving') === unit;
          return (
            <Pressable
              key={unit}
              onPress={() => handleUnitChange(index, unit)}
              style={[styles.unitChip, active && styles.unitChipActive]}
            >
              <Text style={[styles.unitText, active && styles.unitTextActive]}>{unit}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.itemMacros}>
        <Text style={styles.itemMacroText}>{Math.round((item.calories_kcal ?? 0) * (item.quantity || 1))} cal</Text>
        <Text style={styles.itemMacroText}>{Math.round((item.carbs_g ?? 0) * (item.quantity || 1))}g carbs</Text>
        <Text style={styles.itemMacroText}>{Math.round((item.protein_g ?? 0) * (item.quantity || 1))}g protein</Text>
      </View>
    </View>
  );

  // Format time for display
  const formatMealDateTime = () => {
    const time = formatTime(mealTime);
    const now = new Date();
    const isToday = mealTime.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = mealTime.toDateString() === yesterday.toDateString();

    if (isToday) return `${time} • Today`;
    if (isYesterday) return `${time} • Yesterday`;
    return `${time} • ${mealTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  // Get serving display for food item
  const getServingDisplay = (item: SelectedMealItem) => {
    const qty = item.quantity || 1;
    const unit = item.serving_unit || 'serving';
    if (qty === 0.5) return `1/2 ${unit}`;
    if (qty === 0.25) return `1/4 ${unit}`;
    if (qty === 0.75) return `3/4 ${unit}`;
    return `${qty} ${unit}`;
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.newHeader}>
        <LiquidGlassIconButton size={44} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
        </LiquidGlassIconButton>
        <Text style={styles.headerTitle}>MEAL REVIEW</Text>
        <LiquidGlassIconButton size={44} onPress={() => setFixResultsOpen(true)}>
          <Ionicons name="pencil" size={20} color="#E7E8E9" />
        </LiquidGlassIconButton>
      </SafeAreaView>

      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={[styles.mainScrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Meal Name and Time */}
        <View style={styles.mealHeader}>
          <Text style={styles.mealTitleText}>{mealTitle || 'Untitled Meal'}</Text>
          <Text style={styles.mealTimeText}>{formatMealDateTime()}</Text>
        </View>

        {/* Photo Card */}
        <View style={styles.photoCard}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.photoCardImage} resizeMode="cover" />
          ) : (
            <View style={styles.photoCardPlaceholder}>
              <Ionicons name="restaurant-outline" size={48} color="rgba(255,255,255,0.3)" />
            </View>
          )}
        </View>

        {/* Simple Macro Row */}
        <SimpleMacroRow totals={summary} />

        {/* Food Items List */}
        <View style={styles.foodItemsList}>
          {items.map((item, index) => (
            <View key={`${item.provider}-${item.external_id}`} style={styles.foodItemRow}>
              <View style={styles.foodItemInfo}>
                <Text style={styles.foodItemName}>{item.display_name}</Text>
                {item.brand && <Text style={styles.foodItemBrand}>{item.brand}</Text>}
              </View>
              <Text style={styles.foodItemQuantity}>{getServingDisplay(item)}</Text>
            </View>
          ))}
        </View>

        {/* Food Data Source */}
        <Text style={styles.foodDataSource}>Food Data Source</Text>

        {/* Metabolic Score */}
        {summary.hasData && <MetabolicScoreBadge score={mealScore} />}

        {/* Drivers Section */}
        <View style={styles.driversSection}>
          <Text style={styles.driversSectionTitle}>Drivers:</Text>
          <View style={styles.driversList}>
            {drivers.map((driver, index) => (
              <View key={index} style={styles.driverItem}>
                <View style={styles.driverBullet} />
                <Text style={styles.driverText}>{driver}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Adjustments Section */}
        {(adjustments.length > 0 || adjustmentsLoading) && (
          <View style={styles.adjustmentsSection}>
            <Text style={styles.adjustmentsTitle}>Try these adjustments:</Text>
            {adjustmentsLoading ? (
              <View style={styles.adjustmentsLoading}>
                <Text style={styles.adjustmentsLoadingText}>Personalizing suggestions...</Text>
              </View>
            ) : (
              adjustments.map((adjustment) => (
                <AdjustmentCard
                  key={adjustment.id}
                  adjustment={adjustment}
                  isSelected={selectedAdjustments.has(adjustment.id)}
                  onToggle={() => {
                    setSelectedAdjustments((prev) => {
                      const next = new Set(prev);
                      if (next.has(adjustment.id)) {
                        next.delete(adjustment.id);
                      } else {
                        next.add(adjustment.id);
                      }
                      return next;
                    });
                  }}
                />
              ))
            )}
          </View>
        )}

        {/* Personalized Tip */}
        <View style={styles.tipBox}>
          <Ionicons name="bulb" size={20} color="#E5C100" />
          <Text style={styles.tipBoxText}>
            Consider adding more protein to help stabilize blood sugar levels throughout the morning.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Button */}
      <View style={[styles.bottomButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleSaveMeal}
          disabled={isSaving || items.length === 0}
          style={({ pressed }) => [
            styles.logMealButton,
            (isSaving || items.length === 0) && styles.logMealButtonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.logMealButtonText}>{isSaving ? 'Saving...' : 'Log this meal'}</Text>
        </Pressable>
      </View>

      {/* Fix Results Sheet */}
      <Sheet open={fixResultsOpen} onOpenChange={setFixResultsOpen}>
        <SheetContent style={styles.fixResultsSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Edit Meal</Text>
            <Pressable onPress={() => setFixResultsOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {/* Meal name edit */}
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionLabel}>Meal Name</Text>
              <TextInput
                value={mealTitle}
                onChangeText={(text) => {
                  setMealTitle(text);
                  setMealTitleEdited(Boolean(text.trim()));
                }}
                placeholder="Enter meal name"
                placeholderTextColor="#6F6F6F"
                style={styles.sheetInput}
              />
            </View>

            {/* Time edit */}
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionLabel}>Time</Text>
              <Pressable onPress={() => setTimeModalOpen(true)} style={styles.timeButton}>
                <Ionicons name="time-outline" size={18} color="#7ED3FF" />
                <Text style={styles.timeButtonText}>{formatTime(mealTime)}</Text>
                <Ionicons name="chevron-down" size={16} color="#878787" />
              </Pressable>
            </View>

            {/* Glucose */}
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionLabel}>Pre-meal Glucose (optional)</Text>
              <Input
                value={glucoseValue}
                onChangeText={setGlucoseValue}
                placeholder={getGlucoseInputPlaceholder(glucoseUnit)}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Macros Override */}
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionLabel}>Macros (override calculated values)</Text>
              <View style={styles.macroInputGrid}>
                <View style={styles.macroInputItem}>
                  <Text style={styles.macroInputLabel}>Carbs (g)</Text>
                  <TextInput
                    value={macroOverrides.carbs ?? ''}
                    onChangeText={(text) => setMacroOverrides(prev => ({ ...prev, carbs: text || null }))}
                    placeholder={String(summary.carbs)}
                    placeholderTextColor="#6F6F6F"
                    keyboardType="decimal-pad"
                    style={styles.macroInput}
                  />
                </View>
                <View style={styles.macroInputItem}>
                  <Text style={styles.macroInputLabel}>Protein (g)</Text>
                  <TextInput
                    value={macroOverrides.protein ?? ''}
                    onChangeText={(text) => setMacroOverrides(prev => ({ ...prev, protein: text || null }))}
                    placeholder={String(summary.protein)}
                    placeholderTextColor="#6F6F6F"
                    keyboardType="decimal-pad"
                    style={styles.macroInput}
                  />
                </View>
                <View style={styles.macroInputItem}>
                  <Text style={styles.macroInputLabel}>Fiber (g)</Text>
                  <TextInput
                    value={macroOverrides.fibre ?? ''}
                    onChangeText={(text) => setMacroOverrides(prev => ({ ...prev, fibre: text || null }))}
                    placeholder={String(summary.fibre)}
                    placeholderTextColor="#6F6F6F"
                    keyboardType="decimal-pad"
                    style={styles.macroInput}
                  />
                </View>
                <View style={styles.macroInputItem}>
                  <Text style={styles.macroInputLabel}>Fat (g)</Text>
                  <TextInput
                    value={macroOverrides.fat ?? ''}
                    onChangeText={(text) => setMacroOverrides(prev => ({ ...prev, fat: text || null }))}
                    placeholder={String(summary.fat)}
                    placeholderTextColor="#6F6F6F"
                    keyboardType="decimal-pad"
                    style={styles.macroInput}
                  />
                </View>
              </View>
            </View>

            {/* Items */}
            <View style={styles.sheetSection}>
              <View style={styles.itemsHeader}>
                <Text style={styles.sheetSectionLabel}>Items ({items.length})</Text>
                <Pressable onPress={handleAddItem}>
                  <Text style={styles.addItemText}>+ Add item</Text>
                </Pressable>
              </View>

              {items.length === 0 ? (
                <Text style={styles.emptyText}>No items yet. Add one to continue.</Text>
              ) : (
                items.map((item, index) => renderItemRow(item, index))
              )}
            </View>
          </ScrollView>
        </SheetContent>
      </Sheet>

      {/* Time Picker Sheet */}
      <Sheet open={timeModalOpen} onOpenChange={setTimeModalOpen}>
        <SheetContent showHandle={false} style={styles.timeSheet}>
          <View style={styles.timeSheetTopRow}>
            <View />
            <Pressable
              onPress={() => {
                setMealTime(applyTime(mealTime, { hour12: tempHour12, minute: tempMinute, period: tempPeriod }));
                setTimeModalOpen(false);
              }}
            >
              <Text style={styles.timeSheetSave}>Save</Text>
            </Pressable>
          </View>

          <View style={styles.timePickerRow}>
            <View style={styles.timeBox}>
              <FlatList
                ref={hourRef}
                data={HOURS}
                keyExtractor={(v) => v}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_H}
                decelerationRate="fast"
                contentContainerStyle={{ paddingVertical: V_PAD }}
                getItemLayout={(_, index) => ({ length: ITEM_H, offset: ITEM_H * index, index })}
                onMomentumScrollEnd={(e) => onWheelEnd('hour', e.nativeEvent.contentOffset.y)}
                renderItem={({ item, index }) => {
                  const isActive = index === tempHour12 - 1;
                  return (
                    <View style={[styles.wheelItem, isActive && styles.wheelItemActive]}>
                      <Text style={[styles.wheelText, isActive && styles.wheelTextActive]}>{item}</Text>
                    </View>
                  );
                }}
              />
            </View>

            <Text style={styles.timeColon}>:</Text>

            <View style={styles.timeBox}>
              <FlatList
                ref={minuteRef}
                data={MINUTES}
                keyExtractor={(v) => v}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_H}
                decelerationRate="fast"
                contentContainerStyle={{ paddingVertical: V_PAD }}
                getItemLayout={(_, index) => ({ length: ITEM_H, offset: ITEM_H * index, index })}
                onMomentumScrollEnd={(e) => onWheelEnd('minute', e.nativeEvent.contentOffset.y)}
                renderItem={({ item, index }) => {
                  const isActive = index === tempMinute;
                  return (
                    <View style={[styles.wheelItem, isActive && styles.wheelItemActive]}>
                      <Text style={[styles.wheelText, isActive && styles.wheelTextActive]}>{item}</Text>
                    </View>
                  );
                }}
              />
            </View>

            <View style={styles.timeBox}>
              <FlatList
                ref={periodRef}
                data={[...PERIODS]}
                keyExtractor={(v) => v}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_H}
                decelerationRate="fast"
                contentContainerStyle={{ paddingVertical: V_PAD }}
                getItemLayout={(_, index) => ({ length: ITEM_H, offset: ITEM_H * index, index })}
                onMomentumScrollEnd={(e) => onWheelEnd('period', e.nativeEvent.contentOffset.y)}
                renderItem={({ item, index }) => {
                  const isActive = (tempPeriod === 'AM' ? 0 : 1) === index;
                  return (
                    <View style={[styles.wheelItem, isActive && styles.wheelItemActive]}>
                      <Text style={[styles.wheelText, isActive && styles.wheelTextActive]}>{item}</Text>
                    </View>
                  );
                }}
              />
            </View>
          </View>
        </SheetContent>
      </Sheet>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Photo section
  photoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  // Annotation bubbles
  annotationBubble: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: 140,
  },
  annotationName: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: '#1a1a1a',
    textAlign: 'center',
  },
  annotationCalories: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#333',
    marginTop: 2,
  },


  // Floating header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 10,
  },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 33,
    backgroundColor: 'rgba(63, 66, 67, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    letterSpacing: 1,
  },

  // Bottom card
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(20, 20, 20, 0.98)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  cardScrollView: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  cardScrollContent: {
    flexGrow: 1,
  },
  cardContent: {
    paddingHorizontal: 20,
  },

  // Meal type badge
  mealTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  mealTypeBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Meal name row
  mealNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 16,
  },
  mealName: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 22,
    color: '#FFFFFF',
    lineHeight: 28,
  },

  // Quantity stepper
  quantityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
    marginHorizontal: 16,
  },

  // Macro grid
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  macroItem: {
    width: (SCREEN_WIDTH - 50) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 14,
  },
  macroIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  macroLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#A0A0A0',
    marginBottom: 2,
  },
  macroValue: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: '#FFFFFF',
  },

  // Metabolic score
  scoreContainer: {
    backgroundColor: 'rgba(52, 199, 89, 0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  scoreIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 45, 85, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  scoreLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#FFFFFF',
  },
  scoreValue: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  scoreBarBackground: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Adjustments section
  adjustmentsSection: {
    marginBottom: 20,
  },
  adjustmentsTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  adjustmentsLoading: {
    padding: 20,
    alignItems: 'center',
  },
  adjustmentsLoadingText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: '#8C8C8C',
  },
  adjustmentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  adjustmentCardPressed: {
    opacity: 0.8,
  },
  adjustmentContent: {
    flex: 1,
    marginRight: 12,
  },
  adjustmentAction: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  adjustmentImpact: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#8C8C8C',
    marginBottom: 8,
  },
  adjustmentDescription: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#A0A0A0',
    lineHeight: 18,
  },
  adjustmentCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  adjustmentCheckboxSelected: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  fixResultsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fixResultsText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  doneButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonDisabled: {
    opacity: 0.5,
  },
  doneButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },

  // Fix Results Sheet
  fixResultsSheet: {
    backgroundColor: '#1a1b1c',
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  sheetScroll: {
    paddingHorizontal: 20,
  },
  sheetSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  sheetSectionLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#A7A7A7',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  sheetInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: '#FFFFFF',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timeButtonText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: '#FFFFFF',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addItemText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#7ED3FF',
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: '#8C8C8C',
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Item rows in Fix Results
  fixItemRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  fixItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  fixItemName: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  needsReviewPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(244, 67, 54, 0.16)',
  },
  needsReviewText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: '#F4A7A7',
  },
  fixItemControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3F4243',
  },
  qtyInput: {
    minWidth: 50,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: '#E8E8E8',
    fontFamily: fonts.medium,
    fontSize: 14,
    textAlign: 'center',
  },
  fixItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replaceButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(126, 211, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(126, 211, 255, 0.3)',
  },
  replaceButtonText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#7ED3FF',
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  unitChipActive: {
    borderColor: 'rgba(126, 211, 255, 0.6)',
    backgroundColor: 'rgba(126, 211, 255, 0.16)',
  },
  unitText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#9B9B9B',
  },
  unitTextActive: {
    color: '#CFEFFF',
  },
  itemMacros: {
    flexDirection: 'row',
    gap: 12,
  },
  itemMacroText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#8C8C8C',
  },

  // Macro input grid for editing
  macroInputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  macroInputItem: {
    width: '47%',
  },
  macroInputLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#878787',
    marginBottom: 6,
  },
  macroInput: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3F3F3F',
  },

  // Time picker sheet
  timeSheet: {
    backgroundColor: '#3F4243',
    borderWidth: 0,
    left: 16,
    right: 16,
    bottom: 120,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 26,
  },
  timeSheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  timeSheetSave: {
    fontFamily: fonts.medium,
    fontSize: 17,
    color: '#3494D9',
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  timeBox: {
    width: 70,
    height: 132,
    borderRadius: 8,
    backgroundColor: Colors.inputBackgroundSolid,
    borderWidth: 1,
    borderColor: Colors.inputBorderSolid,
    overflow: 'hidden',
  },
  timeColon: {
    fontFamily: fonts.medium,
    fontSize: 18,
    color: '#FFFFFF',
    marginHorizontal: 2,
  },
  wheelItem: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  wheelText: {
    fontFamily: fonts.medium,
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  wheelTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.semiBold,
  },

  // ============================================
  // NEW REDESIGNED LAYOUT STYLES
  // ============================================

  // New Header (non-floating)
  newHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },

  // Main scroll view
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 16,
  },

  // Meal header section
  mealHeader: {
    marginBottom: 16,
  },
  mealTitleText: {
    fontFamily: fonts.semiBold,
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mealTimeText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: '#878787',
  },

  // Photo card
  photoCard: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#1a1a2e',
  },
  photoCardImage: {
    width: '100%',
    height: '100%',
  },
  photoCardPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },

  // Simple Macro Row
  // Simple Macro Row - Card Design
  simpleMacroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#1C1C1E', // Slightly lighter than background
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)', // Subtle border to define edges
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  simpleMacroItem: {
    alignItems: 'center',
    flex: 1, // Distribute space evenly
  },
  simpleMacroLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#9E9E9E', // Slightly muted label to make value pop
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 1,
  },
  simpleMacroValue: {
    fontFamily: fonts.bold, // Bolder value
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Food Items List
  foodItemsList: {
    marginBottom: 8,
  },
  foodItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  foodItemInfo: {
    flex: 1,
    marginRight: 16,
  },
  foodItemName: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: '#FFFFFF',
  },
  foodItemBrand: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#878787',
    marginTop: 2,
  },
  foodItemQuantity: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#FFFFFF',
  },

  // Food Data Source
  foodDataSource: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#878787',
    marginTop: 4,
    marginBottom: 20,
  },

  // Metabolic Score Row (badge style)
  metabolicScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  metabolicScoreLabel: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: '#FFFFFF',
  },
  scoreBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#000000',
  },

  // Circular progress indicator styles
  circularScoreContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularScoreText: {
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  driversSection: {
    marginBottom: 24,
  },
  driversSectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  driversList: {
    gap: 8,
  },
  driverItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    fontFamily: fonts.regular,
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 20,
  },

  // Tip Box
  tipBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(229, 193, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  tipBoxText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 12,
    lineHeight: 20,
  },

  // Bottom Button Container
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  logMealButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logMealButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  logMealButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#000000',
  },
});
