import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Colors } from '@/constants/Colors';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { schedulePostMealReviewNotification } from '@/lib/notifications';
import {
  addMealItems,
  createGlucoseLog,
  createMeal,
  CreateMealItemInput,
  NormalizedFood,
  uploadMealPhoto,
} from '@/lib/supabase';
import { getSmartUnitOptions } from '@/lib/utils/portionUnits';
import { getGlucoseInputPlaceholder, parseGlucoseInput } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  Alert,
  Animated,
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

const MEAL_DRAFT_KEY = 'meal_log_draft';
const MEAL_ITEMS_DRAFT_KEY = 'meal_items_draft';

type GlucoseContext = 'pre_meal' | 'post_meal' | 'random';

interface SelectedMealItem extends NormalizedFood {
  quantity: number;
  source?: 'matched' | 'manual';
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

function buildMealName(items: SelectedMealItem[], fallbackText: string) {
  const names = items
    .map((item) => item.display_name?.trim())
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) {
    const trimmed = fallbackText.trim();
    return trimmed ? trimmed.slice(0, 40) : 'Meal';
  }

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names[1]} +${names.length - 2}`;
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

export default function LogMealReviewScreen() {
  const { user } = useAuth();
  const glucoseUnit = useGlucoseUnit();
  const params = useLocalSearchParams();

  const [items, setItems] = React.useState<SelectedMealItem[]>([]);
  const [mealNotes, setMealNotes] = React.useState('');
  const [mealNameHint, setMealNameHint] = React.useState('');
  const [mealTitle, setMealTitle] = React.useState('');
  const [mealTitleEdited, setMealTitleEdited] = React.useState(false);
  const [imageUri, setImageUri] = React.useState<string | null>(null);
  const [photoPath, setPhotoPath] = React.useState<string | null>(null);
  const [mealTime, setMealTime] = React.useState<Date>(new Date());
  const [isSaving, setIsSaving] = React.useState(false);
  const [quantityInputs, setQuantityInputs] = React.useState<Record<string, string>>({});

  const [glucoseValue, setGlucoseValue] = React.useState('');
  const [showMacroBubble, setShowMacroBubble] = React.useState(false);
  const bubbleAnim = React.useRef(new Animated.Value(0)).current;

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

  const toggleMacroBubble = React.useCallback(() => {
    const toValue = showMacroBubble ? 0 : 1;
    setShowMacroBubble(!showMacroBubble);
    Animated.spring(bubbleAnim, {
      toValue,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [showMacroBubble, bubbleAnim]);

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

    return {
      countLabel: `${items.length} ${items.length === 1 ? 'item' : 'items'}`,
      carbsLabel: totals.hasData ? `${Math.round(totals.carbs)}g carbs` : '-- carbs',
      calories: Math.round(totals.calories),
      carbs: Math.round(totals.carbs),
      protein: Math.round(totals.protein),
      fat: Math.round(totals.fat),
      fibre: Math.round(totals.fibre),
      hasData: totals.hasData,
    };
  }, [items]);

  const autoMealTitle = React.useMemo(
    () => buildMealName(items, mealNotes || mealNameHint),
    [items, mealNotes, mealNameHint]
  );

  React.useEffect(() => {
    if (!mealTitleEdited) {
      setMealTitle(autoMealTitle);
    }
  }, [autoMealTitle, mealTitleEdited]);

  const needsReviewItems = React.useMemo(
    () => items.map((item, index) => ({ item, index })).filter(({ item }) => item.source === 'manual'),
    [items]
  );

  const matchedItems = React.useMemo(
    () => items.map((item, index) => ({ item, index })).filter(({ item }) => item.source !== 'manual'),
    [items]
  );

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
  }, [params.items, params.mealNotes, params.mealName, params.mealTitleEdited, params.imageUri, params.photoPath, params.mealTime]);

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

  const renderItemRow = (item: SelectedMealItem, index: number, highlight: boolean) => (
    <View
      key={`${item.provider}-${item.external_id}`}
      style={[styles.itemRow, highlight && styles.itemRowNeedsReview]}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.display_name}</Text>
        {item.source === 'manual' ? (
          <View style={styles.needsReviewPill}>
            <Text style={styles.needsReviewText}>Needs review</Text>
          </View>
        ) : null}
        <Pressable onPress={() => handleReplaceItem(index)} style={styles.replaceButton}>
          <Text style={styles.replaceButtonText}>Replace</Text>
        </Pressable>
        <Pressable onPress={() => handleRemoveItem(index)} style={styles.removeButton} hitSlop={8}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.itemMetaRow}>
        <View style={styles.qtyRow}>
          <Pressable onPress={() => handleUpdateQuantity(index, -0.25)} style={styles.qtyButton}>
            <Ionicons name="remove" size={20} color="#FFFFFF" />
          </Pressable>
          <TextInput
            value={quantityInputs[`${item.provider}-${item.external_id}`] ?? String(item.quantity || 1)}
            onChangeText={(text) => handleQuantityInputChange(index, text)}
            onBlur={() => handleQuantityInputBlur(index)}
            keyboardType="decimal-pad"
            style={styles.qtyInput}
          />
          <Pressable onPress={() => handleUpdateQuantity(index, 0.25)} style={styles.qtyButton}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </Pressable>
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

        <View style={styles.macroRow}>
          <Text style={styles.macroText}>{item.calories_kcal ?? '--'} kcal</Text>
          <Text style={styles.macroText}>{item.carbs_g ?? '--'}g carbs</Text>
          <Text style={styles.macroText}>{item.protein_g ?? '--'}g protein</Text>
          <Text style={styles.macroText}>{item.fat_g ?? '--'}g fat</Text>
        </View>
      </View>
    </View>
  );

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddItem = () => {
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
        meal_type: null,
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
        quantity: item.quantity,
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

      await addMealItems(user.id, meal.id, mealItems);

      if (glucoseLevelMmol !== null) {
        await createGlucoseLog(user.id, {
          glucose_level: glucoseLevelMmol,
          unit: 'mmol/L',
          logged_at: mealTime.toISOString(),
          context: 'pre_meal',
          notes: `Logged with meal: ${finalMealTitle}`,
        });
      }

      const proposedCheckIn = new Date(mealTime.getTime() + 2 * 60 * 60 * 1000);
      const minCheckIn = new Date(Date.now() + 60 * 1000);
      const checkInTime = proposedCheckIn > minCheckIn ? proposedCheckIn : minCheckIn;
      await schedulePostMealReviewNotification(meal.id, meal.name, checkInTime);

      await AsyncStorage.multiRemove([MEAL_DRAFT_KEY, MEAL_ITEMS_DRAFT_KEY]);

      Alert.alert('Success', 'Meal saved successfully!', [
        { text: 'OK', onPress: () => router.dismissTo('/(tabs)') },
      ]);
    } catch (error) {
      console.error('Save meal error:', error);
      Alert.alert('Error', 'Failed to save meal.');
    } finally {
      setIsSaving(false);
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
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && styles.headerIconBtnPressed,
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>REVIEW MEAL</Text>
          <View style={styles.headerIconBtnSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {imageUri ? (
            <View style={styles.photoCard}>
              <Image source={{ uri: imageUri }} style={styles.photoPreview} />
            </View>
          ) : null}

          <View style={styles.nameCard}>
            <Text style={styles.sectionLabel}>Meal name</Text>
            <TextInput
              value={mealTitle}
              onChangeText={(text) => {
                setMealTitle(text);
                setMealTitleEdited(Boolean(text.trim()));
              }}
              placeholder="Auto-generated"
              placeholderTextColor="#6F6F6F"
              style={styles.nameInput}
            />
          </View>

          {mealNotes ? (
            <View style={styles.descriptionCard}>
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.descriptionText}>{mealNotes}</Text>
            </View>
          ) : null}

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

          <View style={styles.glucoseCard}>
            <Text style={styles.sectionLabel}>Pre-meal Glucose (optional)</Text>
            <View style={styles.glucoseInputRow}>
              <Input
                value={glucoseValue}
                onChangeText={setGlucoseValue}
                placeholder={getGlucoseInputPlaceholder(glucoseUnit)}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.itemsCard}>
            <View style={styles.itemsHeader}>
              <Text style={styles.sectionLabel}>Items</Text>
              <Pressable onPress={handleAddItem} hitSlop={10}>
                <Text style={styles.addItemText}>Add item</Text>
              </Pressable>
            </View>

            {items.length === 0 ? (
              <Text style={styles.emptyText}>No items yet. Add one to continue.</Text>
            ) : (
              <View style={styles.sectionStack}>
                {needsReviewItems.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Needs review</Text>
                      <View style={styles.sectionBadge}>
                        <Text style={styles.sectionBadgeText}>{needsReviewItems.length}</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionHelper}>Check these items for accuracy.</Text>
                    {needsReviewItems.map(({ item, index }) => renderItemRow(item, index, true))}
                  </View>
                ) : null}

                {matchedItems.length > 0 ? (
                  <View style={styles.sectionBlock}>
                    {matchedItems.map(({ item, index }) => renderItemRow(item, index, false))}
                  </View>
                ) : null}
              </View>
            )}
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

      {/* Overlay to close bubble when tapping outside */}
      {showMacroBubble && (
        <Pressable
          style={styles.bubbleOverlay}
          onPress={toggleMacroBubble}
        />
      )}

      <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
        <View style={styles.footer}>
          {/* Animated Macro Bubble */}
          <Animated.View
            style={[
              styles.macroBubble,
              {
                opacity: bubbleAnim,
                transform: [
                  {
                    translateY: bubbleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                  {
                    scale: bubbleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents={showMacroBubble ? 'auto' : 'none'}
          >
            <View style={styles.macroBubbleContent}>
              <View style={styles.macroBubbleRow}>
                <Text style={styles.macroBubbleLabel}>🔥 Calories</Text>
                <Text style={styles.macroBubbleValue}>{summary.calories} kcal</Text>
              </View>
              <View style={styles.macroBubbleRow}>
                <Text style={styles.macroBubbleLabel}>🥩 Protein</Text>
                <Text style={styles.macroBubbleValue}>{summary.protein}g</Text>
              </View>
              <View style={styles.macroBubbleRow}>
                <Text style={styles.macroBubbleLabel}>🧈 Fat</Text>
                <Text style={styles.macroBubbleValue}>{summary.fat}g</Text>
              </View>
              <View style={styles.macroBubbleRow}>
                <Text style={styles.macroBubbleLabel}>🥬 Fiber</Text>
                <Text style={styles.macroBubbleValue}>{summary.fibre}g</Text>
              </View>
              <View style={styles.macroBubbleRow}>
                <Text style={styles.macroBubbleLabel}>🍞 Carbs</Text>
                <Text style={styles.macroBubbleValue}>{summary.carbs}g</Text>
              </View>
            </View>
          </Animated.View>

            <Pressable onPress={toggleMacroBubble} style={styles.summaryTouchable}>
            <View style={styles.summaryRow}>
              <Text style={styles.footerTitle}>{summary.countLabel}</Text>
              <Text style={styles.footerDivider}>•</Text>
              <Text style={styles.footerCarbs}>{summary.carbsLabel}</Text>
            </View>
            <Text style={styles.tapToSeeMore}>
              {showMacroBubble ? 'tap to close' : 'tap to see more'}
            </Text>
          </Pressable>
          <View style={styles.footerButtons}>
            <Pressable
              onPress={() => {
                const mealName = mealTitle.trim() || autoMealTitle;
                router.push({
                  pathname: '/pre-meal-check',
                  params: {
                    mealName,
                    mealTime: mealTime.toISOString(),
                    imageUri: imageUri || '',
                    mealItems: JSON.stringify(items),
                  },
                } as any);
              }}
              disabled={!items.length}
              style={({ pressed }) => [
                styles.preMealButton,
                !items.length && styles.secondaryButtonDisabled,
                pressed && styles.saveButtonPressed,
              ]}
            >
              <Ionicons name="sparkles" size={16} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={handleSaveMeal}
              disabled={isSaving || items.length === 0}
              style={({ pressed }) => [
                styles.saveButton,
                (isSaving || items.length === 0) && styles.saveButtonDisabled,
                pressed && styles.saveButtonPressed,
              ]}
            >
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Meal'}</Text>
            </Pressable>
          </View>
        </View>
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
    paddingBottom: 140,
  },
  sectionLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#A7A7A7',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  photoCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoPreview: {
    width: '100%',
    height: 180,
  },
  nameCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
  },
  nameInput: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  descriptionCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
  },
  descriptionText: {
    marginTop: 8,
    fontFamily: fonts.regular,
    color: '#E6E6E6',
    fontSize: 14,
    lineHeight: 20,
  },
  timeCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
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
  itemsCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addItemText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#7ED3FF',
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#8C8C8C',
  },
  itemRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  itemRowNeedsReview: {
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  needsReviewPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(244,67,54,0.16)',
  },
  needsReviewText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: '#F4A7A7',
  },
  replaceButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(126,211,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(126,211,255,0.3)',
  },
  replaceButtonText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#7ED3FF',
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(244,67,54,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionStack: {
    gap: 18,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: '#EAEAEA',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(244,67,54,0.2)',
  },
  sectionBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: '#F4A7A7',
  },
  sectionBadgeMuted: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sectionBadgeMutedText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: '#B5B5B5',
  },
  sectionHelper: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#A2A2A2',
  },
  itemMetaRow: {
    marginTop: 10,
    gap: 10,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3F4243',
  },
  qtyInput: {
    minWidth: 56,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: '#E8E8E8',
    fontFamily: fonts.medium,
    fontSize: 13,
    textAlign: 'center',
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  unitChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unitChipActive: {
    borderColor: 'rgba(126,211,255,0.6)',
    backgroundColor: 'rgba(126,211,255,0.16)',
  },
  unitText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#9B9B9B',
  },
  unitTextActive: {
    color: '#CFEFFF',
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  macroText: {
    fontFamily: fonts.regular,
    color: '#9B9B9B',
    fontSize: 12,
  },
  glucoseCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
  },
  glucoseInputRow: {
    marginTop: 10,
  },
  glucoseContextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  glucoseContextChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  glucoseContextChipActive: {
    backgroundColor: 'rgba(52,148,217,0.2)',
  },
  glucoseContextText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#8E8E8E',
  },
  glucoseContextTextActive: {
    color: '#79C0E8',
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
  secondaryButton: {
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(39,175,221,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(39,175,221,0.4)',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontFamily: fonts.semiBold,
    color: '#E5F8FF',
    fontSize: 15,
  },
  saveButton: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.buttonPrimary,
    shadowColor: Colors.buttonPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  saveButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  saveButtonText: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: 17,
    letterSpacing: 0.5,
  },
  footerSafe: {
    backgroundColor: '#111111',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 14,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  preMealButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(39,175,221,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(39,175,221,0.5)',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  footerTitle: {
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
    fontSize: 18,
  },
  footerDivider: {
    fontFamily: fonts.regular,
    color: '#6B6B6B',
    fontSize: 18,
  },
  footerCarbs: {
    fontFamily: fonts.semiBold,
    color: '#7ED3FF',
    fontSize: 18,
  },
  macroBubble: {
    position: 'absolute',
    bottom: '100%',
    left: 16,
    right: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(30, 35, 40, 0.98)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(126, 211, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  macroBubbleContent: {
    padding: 20,
    gap: 14,
  },
  macroBubbleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroBubbleLabel: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: '#B5B5B5',
  },
  macroBubbleValue: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  summaryTouchable: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  tapToSeeMore: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#6B6B6B',
    marginTop: 4,
  },
  bubbleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});
