import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SheetItem } from '@/components/ui/sheet-item';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { rankResults, scoreResult } from '@/lib/foodSearch/rank';
import { ParsedMealItem, parseMealDescription } from '@/lib/mealTextParser';
import {
  AnalyzedItem,
  NormalizedFood,
  invokeMealPhotoAnalyze,
  searchFoodsWithVariants,
  uploadMealPhoto,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';
import AnalysisResultsView from './components/scanner/AnalysisResultsView';

const MEAL_DRAFT_KEY = 'meal_log_draft';
const MEAL_ITEMS_DRAFT_KEY = 'meal_items_draft';
const MAX_MATCH_CONCURRENCY = 4;
const MAX_PHOTO_MATCH_CANDIDATES = 6;
const MIN_PHOTO_TEXT_SCORE = 55;
const MACRO_DISTANCE_MARGIN = 0.15;

interface SelectedMealItem extends NormalizedFood {
  quantity: number;
  source: 'matched' | 'manual';
  originalText?: string;
}

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

function ChevronDown() {
  return <Ionicons name="chevron-down" size={16} color="#878787" />;
}

function buildManualItem(parsed: ParsedMealItem): SelectedMealItem {
  return {
    provider: 'fdc',
    external_id: `manual-${uuid.v4()}`,
    display_name: parsed.name,
    brand: 'Manual Entry',
    serving_size: null,
    serving_unit: parsed.unit ?? 'serving',
    calories_kcal: null,
    carbs_g: null,
    protein_g: null,
    fat_g: null,
    fibre_g: null,
    sugar_g: null,
    sodium_mg: null,
    quantity: parsed.quantity || 1,
    source: 'manual',
    originalText: parsed.raw,
  };
}

function buildAnalyzedItem(item: AnalyzedItem): SelectedMealItem {
  return {
    provider: 'fdc',
    external_id: `ai-${uuid.v4()}`,
    display_name: item.display_name,
    brand: 'AI estimate',
    serving_size: null,
    serving_unit: item.unit || 'serving',
    calories_kcal: item.nutrients.calories_kcal,
    carbs_g: item.nutrients.carbs_g,
    protein_g: item.nutrients.protein_g,
    fat_g: item.nutrients.fat_g,
    fibre_g: item.nutrients.fibre_g,
    sugar_g: item.nutrients.sugar_g,
    sodium_mg: item.nutrients.sodium_mg,
    quantity: item.quantity || 1,
    source: 'matched',
    originalText: 'photo',
  };
}

function mapAnalyzedItems(items: AnalyzedItem[]): SelectedMealItem[] {
  return items.map((item) => buildAnalyzedItem(item));
}

function normalizeUnitLabel(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const cleaned = unit.trim().toLowerCase();
  if (!cleaned) return null;
  if (cleaned === 'serving' || cleaned === 'serve') return 'serving';
  if (cleaned === 'g' || cleaned === 'gram' || cleaned === 'grams') return 'g';
  if (cleaned === 'kg' || cleaned === 'kilogram' || cleaned === 'kilograms') return 'kg';
  if (cleaned === 'ml' || cleaned === 'milliliter' || cleaned === 'milliliters') return 'ml';
  if (cleaned === 'l' || cleaned === 'liter' || cleaned === 'liters') return 'l';
  if (cleaned === 'oz' || cleaned === 'ounce' || cleaned === 'ounces') return 'oz';
  if (cleaned === 'tbsp' || cleaned === 'tablespoon' || cleaned === 'tablespoons') return 'tbsp';
  if (cleaned === 'tsp' || cleaned === 'teaspoon' || cleaned === 'teaspoons') return 'tsp';
  if (cleaned === 'cup' || cleaned === 'cups') return 'cup';
  if (cleaned === 'slice' || cleaned === 'slices') return 'slice';
  if (cleaned === 'piece' || cleaned === 'pieces') return 'piece';
  return cleaned.endsWith('s') ? cleaned.slice(0, -1) : cleaned;
}

function isUnitCompatible(aiUnit: string | null | undefined, servingUnit: string | null | undefined): boolean {
  const aiNorm = normalizeUnitLabel(aiUnit);
  const servingNorm = normalizeUnitLabel(servingUnit);
  if (!aiNorm || aiNorm === 'serving') return true;
  if (!servingNorm || servingNorm === 'serving') return true;
  return aiNorm === servingNorm;
}

function countMacros(values: Array<number | null | undefined>): number {
  return values.filter((value) => typeof value === 'number' && Number.isFinite(value)).length;
}

function getAiMacroCount(item: AnalyzedItem): number {
  return countMacros([
    item.nutrients.calories_kcal,
    item.nutrients.carbs_g,
    item.nutrients.protein_g,
    item.nutrients.fat_g,
  ]);
}

function getFoodMacroCount(food: NormalizedFood): number {
  return countMacros([
    food.calories_kcal,
    food.carbs_g,
    food.protein_g,
    food.fat_g,
  ]);
}

function computeMacroDistance(item: AnalyzedItem, food: NormalizedFood): number | null {
  const pairs: Array<[number | null | undefined, number | null | undefined]> = [
    [item.nutrients.calories_kcal, food.calories_kcal],
    [item.nutrients.carbs_g, food.carbs_g],
    [item.nutrients.protein_g, food.protein_g],
    [item.nutrients.fat_g, food.fat_g],
  ];

  let total = 0;
  let count = 0;
  for (const [aiValue, candidateValue] of pairs) {
    if (typeof aiValue === 'number' && aiValue > 0 && typeof candidateValue === 'number') {
      total += Math.abs(candidateValue - aiValue) / Math.max(aiValue, 1);
      count += 1;
    }
  }

  if (count === 0) return null;
  return total / count;
}

// Simple in-memory cache for food search results (faster repeat lookups)
const foodSearchCache = new Map<string, NormalizedFood>();

async function matchParsedItem(parsed: ParsedMealItem): Promise<SelectedMealItem> {
  const cacheKey = parsed.name.toLowerCase().trim();

  // Check cache first for faster repeat lookups
  const cached = foodSearchCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      quantity: parsed.quantity || 1,
      serving_unit: parsed.unit ?? cached.serving_unit,
      source: 'matched',
      originalText: parsed.raw,
    };
  }

  const results = await searchFoodsWithVariants(parsed.name, [], 15);

  if (!results.length) {
    return buildManualItem(parsed);
  }

  // Use the proper ranking system which handles multi-word queries correctly
  // It scores based on token overlap, exact matches, and penalizes partial matches
  const rankedResults = rankResults(results, parsed.name);
  const best = rankedResults[0];

  if (!best) {
    return buildManualItem(parsed);
  }

  // Cache the result for future lookups
  foodSearchCache.set(cacheKey, best);

  return {
    ...best,
    quantity: parsed.quantity || 1,
    serving_unit: parsed.unit ?? best.serving_unit,
    source: 'matched',
    originalText: parsed.raw,
  };
}

async function matchAnalyzedItem(item: AnalyzedItem): Promise<SelectedMealItem> {
  const query = item.display_name?.trim();
  if (!query) {
    return buildAnalyzedItem(item);
  }

  const cacheKey = `photo:${query.toLowerCase()}`;
  const cached = foodSearchCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      quantity: item.quantity || 1,
      serving_unit: cached.serving_unit || item.unit || 'serving',
      source: 'matched',
      originalText: 'photo',
    };
  }

  const results = await searchFoodsWithVariants(query, [], 15);
  if (!results.length) {
    return buildAnalyzedItem(item);
  }

  const scored = results
    .map((food) => scoreResult(food, query))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PHOTO_MATCH_CANDIDATES);

  const bestText = scored[0];
  if (!bestText) {
    return buildAnalyzedItem(item);
  }

  const aiMacroCount = getAiMacroCount(item);
  const bestTextDistance = computeMacroDistance(item, bestText.food);

  let bestMacroCandidate = bestText;
  let bestMacroDistance = bestTextDistance;

  for (const candidate of scored) {
    if (candidate.score < MIN_PHOTO_TEXT_SCORE) continue;
    const distance = computeMacroDistance(item, candidate.food);
    if (distance === null) continue;
    if (bestMacroDistance === null || distance < bestMacroDistance) {
      bestMacroCandidate = candidate;
      bestMacroDistance = distance;
    }
  }

  const shouldUseMacroMatch = bestMacroDistance !== null
    && (bestTextDistance === null || bestMacroDistance + MACRO_DISTANCE_MARGIN < bestTextDistance);

  const selected = shouldUseMacroMatch ? bestMacroCandidate : bestText;
  const selectedFood = selected.food;
  const selectedMacroCount = getFoodMacroCount(selectedFood);
  const unitCompatible = isUnitCompatible(item.unit, selectedFood.serving_unit);
  const aiWeak = aiMacroCount < 2 || item.confidence === 'low';

  if (selectedMacroCount < 2) {
    return buildAnalyzedItem(item);
  }

  if (!unitCompatible && !aiWeak) {
    return buildAnalyzedItem(item);
  }

  foodSearchCache.set(cacheKey, selectedFood);

  return {
    ...selectedFood,
    quantity: unitCompatible ? (item.quantity || 1) : 1,
    serving_unit: selectedFood.serving_unit || item.unit || 'serving',
    source: 'matched',
    originalText: 'photo',
  };
}

async function matchAnalyzedItems(items: AnalyzedItem[]): Promise<SelectedMealItem[]> {
  const results: SelectedMealItem[] = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await matchAnalyzedItem(items[index]);
    }
  };

  const workerCount = Math.min(MAX_MATCH_CONCURRENCY, items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return results;
}

async function matchParsedItems(parsedItems: ParsedMealItem[]): Promise<SelectedMealItem[]> {
  const results: SelectedMealItem[] = new Array(parsedItems.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < parsedItems.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await matchParsedItem(parsedItems[index]);
    }
  };

  const workerCount = Math.min(MAX_MATCH_CONCURRENCY, parsedItems.length || 1);
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return results;
}

export default function LogMealScreen() {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const isNewSession = React.useMemo(() => {
    const value = params.newSession;
    if (Array.isArray(value)) {
      return value[0] === '1' || value[0] === 'true';
    }
    return value === '1' || value === 'true';
  }, [params.newSession]);

  const [mealName, setMealName] = React.useState('');
  const [mealNotes, setMealNotes] = React.useState('');
  const [imageUri, setImageUri] = React.useState<string | null>(null);
  const [photoPath, setPhotoPath] = React.useState<string | null>(null);
  const [mealTime, setMealTime] = React.useState<Date>(new Date());
  const [imageSheetOpen, setImageSheetOpen] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisStep, setAnalysisStep] = React.useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = React.useState<{
    items: SelectedMealItem[];
    imageUri?: string;
    photoPath?: string;
    mealNotes?: string;
  } | null>(null);
  const isReadyRef = React.useRef(false);
  const resumePromptedRef = React.useRef(false);

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

  const resetDraft = React.useCallback(() => {
    setMealName('');
    setMealNotes('');
    setImageUri(null);
    setPhotoPath(null);
    setMealTime(new Date());
  }, []);

  const saveDraft = React.useCallback(async () => {
    try {
      if (!mealName.trim() && !mealNotes.trim() && !imageUri) return;

      const draft = {
        mealName,
        mealNotes,
        imageUri,
        photoPath,
        mealTime: mealTime.toISOString(),
        savedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(MEAL_DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {
      console.warn('Failed to save meal draft:', e);
    }
  }, [mealName, mealNotes, imageUri, photoPath, mealTime]);

  React.useEffect(() => {
    const restoreDraft = async () => {
      try {
        if (isNewSession) {
          resetDraft();
          await AsyncStorage.multiRemove([MEAL_DRAFT_KEY, MEAL_ITEMS_DRAFT_KEY]);
          return;
        }

        const stored = await AsyncStorage.getItem(MEAL_DRAFT_KEY);
        if (stored) {
          const draft = JSON.parse(stored);
          const savedAt = new Date(draft.savedAt);
          const hoursSinceSave = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceSave < 24) {
            if (!resumePromptedRef.current) {
              resumePromptedRef.current = true;
              Alert.alert('Resume draft?', 'You have an unfinished meal log.', [
                {
                  text: 'Start new',
                  style: 'destructive',
                  onPress: async () => {
                    resetDraft();
                    await AsyncStorage.multiRemove([MEAL_DRAFT_KEY, MEAL_ITEMS_DRAFT_KEY]);
                  },
                },
                {
                  text: 'Resume',
                  onPress: () => {
                    if (draft.mealName) setMealName(draft.mealName);
                    if (draft.mealNotes) setMealNotes(draft.mealNotes);
                    if (draft.imageUri) setImageUri(draft.imageUri);
                    if (draft.photoPath) setPhotoPath(draft.photoPath);
                    if (draft.mealTime) {
                      const parsed = new Date(draft.mealTime);
                      if (!Number.isNaN(parsed.getTime())) {
                        setMealTime(parsed);
                      }
                    }
                  },
                },
              ]);
            }
          } else {
            await AsyncStorage.removeItem(MEAL_DRAFT_KEY);
          }
        }
      } catch (e) {
        console.warn('Failed to restore meal draft:', e);
      }
    };

    if (!isReadyRef.current) {
      isReadyRef.current = true;
      restoreDraft();
    }
  }, [isNewSession, resetDraft]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft();
    }, 500);
    return () => clearTimeout(timer);
  }, [mealName, mealNotes, imageUri, photoPath, mealTime, saveDraft]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        saveDraft();
      }
    });
    return () => subscription?.remove();
  }, [saveDraft]);

  const pickFromCamera = React.useCallback(async () => {
    const ImagePicker = await import('expo-image-picker');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;

    const res = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setImageUri(res.assets[0].uri);
      setPhotoPath(null);
    }
  }, []);

  const pickFromLibrary = React.useCallback(async () => {
    const ImagePicker = await import('expo-image-picker');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setImageUri(res.assets[0].uri);
      setPhotoPath(null);
    }
  }, []);

  const analyzeMeal = async () => {
    const trimmedNotes = mealNotes.trim();
    const hasText = Boolean(trimmedNotes);
    const hasPhoto = Boolean(imageUri);

    if (!hasText && !hasPhoto) {
      Alert.alert('Add details', 'Include a photo or describe what you ate.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStep('Preparing...');

    try {
      let nextPhotoPath = photoPath;
      let matchedItems: SelectedMealItem[] = [];

      if (hasPhoto) {
        if (!user) {
          Alert.alert('Sign in required', 'Please sign in to analyze a meal photo.');
          return;
        }

        if (!nextPhotoPath) {
          setAnalysisStep('Uploading photo...');
          nextPhotoPath = await uploadMealPhoto(user.id, imageUri!);
          if (!nextPhotoPath) {
            Alert.alert('Upload failed', 'Please try again with a different photo.');
            return;
          }
          setPhotoPath(nextPhotoPath);
        }

        setAnalysisStep('Analyzing photo...');
        const analysis = await invokeMealPhotoAnalyze(
          user.id,
          null,
          nextPhotoPath,
          mealTime.toISOString(),
          undefined,
          undefined,
          trimmedNotes || undefined
        );

        if (analysis?.status === 'complete' && analysis.items?.length) {
          setAnalysisStep('Refining items...');
          matchedItems = await matchAnalyzedItems(analysis.items);
          if (!matchedItems.length) {
            matchedItems = mapAnalyzedItems(analysis.items);
          }
        }
      }

      if (!matchedItems.length) {
        if (!trimmedNotes) {
          Alert.alert('No items found', 'Describe what you ate or try another photo.');
          return;
        }
        setAnalysisStep('Parsing your meal...');
        const parsed = parseMealDescription(trimmedNotes);
        if (parsed.length === 0) {
          Alert.alert('Could not parse', 'Try separating items with commas.');
          return;
        }
        setAnalysisStep('Matching foods...');
        matchedItems = await matchParsedItems(parsed);
      }

      // Show AnalysisResultsView instead of navigating
      setAnalysisResult({
        items: matchedItems,
        imageUri: imageUri || undefined,
        photoPath: nextPhotoPath || undefined,
        mealNotes: trimmedNotes,
      });
    } catch (e) {
      console.error('Meal analyze error:', e);
      Alert.alert('Analysis failed', 'Please try again in a moment.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep(null);
    }
  };





  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1a1f24', '#181c20', '#111111']}
        locations={[0, 0.35, 1]}
        style={styles.topGlow}
      />

      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.dismissTo('/(tabs)')}
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && styles.headerIconBtnPressed,
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>LOG MEAL</Text>
          <View style={styles.headerIconBtnSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.contentBlock}>
            <Text style={styles.sectionLabel}>Photo</Text>
            <Pressable style={styles.photoTile} onPress={() => setImageSheetOpen(true)}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera" size={22} color="#9AA0A6" />
                  <Text style={styles.photoPlaceholderText}>Add a photo (optional)</Text>
                </View>
              )}
              {imageUri ? (
                <Pressable
                  onPress={() => setImageUri(null)}
                  style={styles.photoRemove}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              ) : null}
            </Pressable>

            <View style={styles.timeCard}>
              <Text style={styles.sectionLabel}>Meal time</Text>
              <Pressable
                onPress={() => setTimeModalOpen(true)}
                style={({ pressed }) => [
                  styles.timeRow,
                  pressed && styles.timeRowPressed,
                ]}
              >
                <Text style={styles.timeValue}>{formatTime(mealTime)}</Text>
                <ChevronDown />
              </Pressable>
            </View>

            <View style={styles.textBlock}>
              <Text style={styles.sectionLabel}>What did you eat?</Text>
              <TextInput
                value={mealNotes}
                onChangeText={setMealNotes}
                multiline
                placeholder="Type the food name or specific ingredients"
                placeholderTextColor="#6F6F6F"
                style={styles.textArea}
              />
              <Text style={styles.helperText}>Separate items with commas for best matches.</Text>
              <View style={styles.tipBox}>
                <Ionicons name="bulb-outline" size={16} color="#7ED3FF" style={styles.tipIcon} />
                <Text style={styles.tipText}>
                  Add quantities like "1 cup", "2 tbsp", or "200g" to improve accuracy.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={analyzeMeal}
              disabled={isAnalyzing || (!mealNotes.trim() && !imageUri)}
              style={[
                styles.primaryButton,
                (isAnalyzing || (!mealNotes.trim() && !imageUri)) && styles.primaryButtonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>{isAnalyzing ? 'Reviewing...' : 'Review Meal'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>

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

      <Sheet open={imageSheetOpen} onOpenChange={setImageSheetOpen}>
        <SheetContent>
          <SheetItem
            title="Take Photo"
            icon="camera"
            onPress={() => {
              setImageSheetOpen(false);
              pickFromCamera();
            }}
          />
          <SheetItem
            title="Choose from Library"
            icon="image"
            onPress={() => {
              setImageSheetOpen(false);
              pickFromLibrary();
            }}
          />
          {imageUri ? (
            <SheetItem
              title="Remove Photo"
              icon="trash"
              onPress={() => {
                setImageSheetOpen(false);
                setImageUri(null);
                setPhotoPath(null);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      {isAnalyzing ? (
        <View style={styles.analyzeOverlay}>
          <ActivityIndicator size="large" color={Colors.buttonPrimary} />
          <Text style={styles.analyzeText}>{analysisStep || 'Analyzing...'}</Text>
        </View>
      ) : null}

      {/* Analysis Results View - Full screen overlay */}
      {analysisResult ? (
        <View style={StyleSheet.absoluteFill}>
          <AnalysisResultsView
            imageUri={analysisResult.imageUri}
            items={analysisResult.items}
            onReview={() => {
              router.push({
                pathname: '/log-meal-review',
                params: {
                  items: JSON.stringify(analysisResult.items),
                  mealName: '',
                  mealNotes: analysisResult.mealNotes || '',
                  imageUri: analysisResult.imageUri || '',
                  photoPath: analysisResult.photoPath || '',
                  mealTime: mealTime.toISOString(),
                },
              });
              setAnalysisResult(null);
            }}
            onSave={() => {
              router.push({
                pathname: '/log-meal-review',
                params: {
                  items: JSON.stringify(analysisResult.items),
                  mealName: '',
                  mealNotes: analysisResult.mealNotes || '',
                  imageUri: analysisResult.imageUri || '',
                  photoPath: analysisResult.photoPath || '',
                  mealTime: mealTime.toISOString(),
                  autoSave: 'true',
                },
              });
              setAnalysisResult(null);
            }}
            onClose={() => setAnalysisResult(null)}
          />
        </View>
      ) : null}
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
    height: 280,
  },
  safe: {
    flex: 1,
  },
  header: {
    height: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    letterSpacing: 1,
    color: Colors.textPrimary,
  },
  headerIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 33,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(63,66,67,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  headerIconBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  headerIconBtnSpacer: {
    width: 48,
    height: 48,
    opacity: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  contentBlock: {
    paddingBottom: 8,
  },
  sectionLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#A7A7A7',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  photoTile: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
    marginBottom: 20,
  },
  photoPreview: {
    width: '100%',
    height: 180,
  },
  photoPlaceholder: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  photoPlaceholderText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#9AA0A6',
  },
  photoRemove: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  textBlock: {
    marginBottom: 20,
  },
  nameInput: {
    borderRadius: 14,
    padding: 12,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  timeCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 20,
  },
  timeRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  timeRowPressed: {
    opacity: 0.8,
  },
  timeValue: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  textArea: {
    minHeight: 120,
    borderRadius: 14,
    padding: 12,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontFamily: fonts.regular,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  helperText: {
    marginTop: 8,
    fontFamily: fonts.regular,
    color: '#7D7D7D',
    fontSize: 12,
  },
  tipBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(126,211,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(126,211,255,0.15)',
  },
  tipIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  tipText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#A7C7D3',
    lineHeight: 18,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: Colors.buttonPrimary,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  analyzeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  analyzeText: {
    fontFamily: fonts.medium,
    color: '#FFFFFF',
    fontSize: 14,
  },
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
    backgroundColor: '#1b1b1c',
    borderWidth: 1,
    borderColor: '#313135',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  wheelText: {
    fontFamily: fonts.medium,
    fontSize: 18,
    color: 'rgba(255,255,255,0.45)',
  },
  wheelTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.semiBold,
  },
});
