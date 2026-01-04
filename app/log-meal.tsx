import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SheetItem } from '@/components/ui/sheet-item';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
  addMealItems,
  createMeal,
  CreateMealItemInput,
  NormalizedFood,
  uploadMealPhoto,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Selected item with quantity from food search
interface SelectedFood extends NormalizedFood {
  quantity: number;
}

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

// Order matches the provided design
const MEAL_TYPES: MealType[] = ['Breakfast', 'Snack', 'Lunch', 'Dinner'];

function formatTime(d: Date) {
  const hh = d.getHours();
  const mm = d.getMinutes();
  const h12 = ((hh + 11) % 12) + 1;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function buildTimeOptions(stepMinutes: number = 30) {
  const out: Date[] = [];
  const base = new Date();
  base.setSeconds(0);
  base.setMilliseconds(0);
  base.setHours(0);
  base.setMinutes(0);
  for (let i = 0; i < (24 * 60) / stepMinutes; i++) {
    const d = new Date(base);
    d.setMinutes(i * stepMinutes);
    out.push(d);
  }
  return out;
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

function fromParts(parts: { hour12: number; minute: number; period: 'AM' | 'PM' }) {
  const { hour12, minute, period } = parts;
  let hours24 = hour12 % 12;
  if (period === 'PM') hours24 += 12;
  const d = new Date();
  d.setHours(hours24);
  d.setMinutes(minute);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

function ChevronDown() {
  return <Ionicons name="chevron-down" size={16} color="#878787" />;
}

function ChevronRight() {
  return <Ionicons name="chevron-forward" size={16} color="#E7E8E9" />;
}

export default function LogMealScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const [mealName, setMealName] = React.useState('');
  const [mealType, setMealType] = React.useState<MealType | null>(null);
  const [mealTime, setMealTime] = React.useState<Date | null>(null);
  const [imageUri, setImageUri] = React.useState<string | null>(null);
  const [mealItems, setMealItems] = React.useState<SelectedFood[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  const [typeModalOpen, setTypeModalOpen] = React.useState(false);
  const [timeModalOpen, setTimeModalOpen] = React.useState(false);
  const [imageSheetOpen, setImageSheetOpen] = React.useState(false);

  // Track if params have been consumed to prevent infinite loops
  const paramsConsumedRef = React.useRef<string | null>(null);

  // Restore form state from params (when returning from log-meal-items)
  React.useEffect(() => {
    // Create a unique key for the current params to detect changes
    const paramsKey = `${params.selectedFoods || ''}-${params.mealName || ''}`;

    // Skip if we've already processed these exact params
    if (paramsConsumedRef.current === paramsKey) {
      return;
    }
    paramsConsumedRef.current = paramsKey;

    // Restore meal name
    if (params.mealName && typeof params.mealName === 'string') {
      setMealName(params.mealName);
    }
    // Restore meal type
    if (params.mealType && typeof params.mealType === 'string') {
      setMealType(params.mealType as MealType);
    }
    // Restore meal time
    if (params.mealTime && typeof params.mealTime === 'string') {
      setMealTime(new Date(params.mealTime));
    }
    // Restore image
    if (params.imageUri && typeof params.imageUri === 'string') {
      setImageUri(params.imageUri);
    }
    // Restore existing meal items
    if (params.existingItems && typeof params.existingItems === 'string' && params.existingItems !== '[]') {
      try {
        const items = JSON.parse(params.existingItems) as SelectedFood[];
        setMealItems(items);
      } catch (e) {
        console.error('Failed to parse existing items:', e);
      }
    }
    // Handle selected foods from log-meal-items screen
    if (params.selectedFoods && typeof params.selectedFoods === 'string') {
      try {
        const foods = JSON.parse(params.selectedFoods) as SelectedFood[];
        setMealItems(prev => {
          // Merge new items with existing, avoiding duplicates
          const existingIds = new Set(prev.map(p => `${p.provider}-${p.external_id}`));
          const newItems = foods.filter(f => !existingIds.has(`${f.provider}-${f.external_id}`));
          return [...prev, ...newItems];
        });
      } catch (e) {
        console.error('Failed to parse selected foods:', e);
      }
    }
  }, [params.selectedFoods, params.mealName, params.mealType, params.mealTime, params.imageUri, params.existingItems]);

  const handleSaveMeal = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to save a meal');
      return;
    }
    if (!mealName.trim()) {
      Alert.alert('Error', 'Please enter a meal name');
      return;
    }

    setIsSaving(true);
    try {
      // Upload photo if present
      let photoUrl: string | null = null;
      if (imageUri) {
        photoUrl = await uploadMealPhoto(user.id, imageUri);
        // Continue even if photo upload fails
      }

      // Create the meal
      const meal = await createMeal(user.id, {
        name: mealName.trim(),
        meal_type: mealType?.toLowerCase() as 'breakfast' | 'lunch' | 'dinner' | 'snack' | null,
        logged_at: mealTime?.toISOString() || new Date().toISOString(),
        photo_path: photoUrl,
        notes: null,
      });

      if (!meal) {
        Alert.alert('Error', 'Failed to save meal');
        return;
      }

      // Add meal items if any
      if (mealItems.length > 0) {
        const items: CreateMealItemInput[] = mealItems.map(item => ({
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
        await addMealItems(user.id, meal.id, items);
      }

      Alert.alert('Success', 'Meal saved successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Save meal error:', error);
      Alert.alert('Error', 'Failed to save meal');
    } finally {
      setIsSaving(false);
    }
  };

  // Navigate to meal items screen while preserving form state
  const navigateToMealItems = () => {
    router.navigate({
      pathname: '/log-meal-items',
      params: {
        mealName,
        mealType: mealType || '',
        mealTime: mealTime?.toISOString() || '',
        imageUri: imageUri || '',
        existingItems: JSON.stringify(mealItems),
      },
    });
  };

  // Wheel options (minute is 00-59)
  const HOURS = React.useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')), []);
  const MINUTES = React.useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')), []);
  const PERIODS = React.useMemo(() => ['AM', 'PM'] as const, []);

  const [tempHour12, setTempHour12] = React.useState(8);
  const [tempMinute, setTempMinute] = React.useState(10);
  const [tempPeriod, setTempPeriod] = React.useState<'AM' | 'PM'>('AM');

  const ITEM_H = 44; // More compact standard size
  const V_PAD = ITEM_H * 1; // one item above/below visible center

  const pickFromCamera = React.useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!res.canceled) setImageUri(res.assets?.[0]?.uri ?? null);
  }, []);

  const pickFromLibrary = React.useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!res.canceled) setImageUri(res.assets?.[0]?.uri ?? null);
  }, []);

  // Initialize temp picker values when opening the time sheet
  React.useEffect(() => {
    if (!timeModalOpen) return;
    const base = mealTime ?? new Date();
    const parts = toParts(base);
    setTempHour12(parts.hour12);
    setTempMinute(parts.minute);
    setTempPeriod(parts.period);
  }, [timeModalOpen, mealTime]);

  const hourRef = React.useRef<FlatList<string>>(null);
  const minuteRef = React.useRef<FlatList<string>>(null);
  const periodRef = React.useRef<FlatList<'AM' | 'PM'>>(null);

  // Snap wheels to the selected values when opened (after layout)
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
          <Pressable onPress={() => router.dismissTo('/(tabs)')} style={styles.headerIconBtn}>
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>

          <Text style={styles.headerTitle}>LOG MEAL</Text>

          {/* spacer for centering */}
          <View style={styles.headerIconBtnSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* Form card */}
          <View style={styles.formCard}>
            {/* Meal Name */}
            <View style={styles.block}>
              <Text style={styles.label}>Meal Name</Text>
              <Input
                value={mealName}
                onChangeText={setMealName}
                placeholder="Enter Meal Name"
                returnKeyType="done"
              />
            </View>

            {/* Meal Type */}
            <View style={styles.block}>
              <Text style={styles.label}>Meal Type</Text>
              <DropdownMenu
                open={typeModalOpen}
                onOpenChange={setTypeModalOpen}
                trigger={
                  <Pressable
                    onPress={() => setTypeModalOpen(true)}
                    style={styles.selectShell}
                  >
                    <Text style={[styles.selectText, mealType && styles.selectTextActive]}>
                      {mealType ?? 'Select Meal Type'}
                    </Text>
                    <ChevronDown />
                  </Pressable>
                }
              >
                {MEAL_TYPES.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onSelect={() => {
                      setMealType(type);
                      setTypeModalOpen(false);
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{type}</Text>
                    {mealType === type && (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenu>
            </View>

            {/* Meal Time */}
            <View style={styles.block}>
              <Text style={styles.label}>Meal Time</Text>
              <Pressable onPress={() => setTimeModalOpen(true)} style={styles.selectShell}>
                <Text style={[styles.selectText, mealTime && styles.selectTextActive]}>
                  {mealTime ? formatTime(mealTime) : 'Select Meal Time'}
                </Text>
                <ChevronDown />
              </Pressable>
            </View>
          </View>

          {/* Add Image */}
          <Pressable onPress={() => setImageSheetOpen(true)} style={styles.actionRow}>
            <Text style={styles.actionText}>Add Image</Text>
            <View style={styles.actionRight}>
              {imageUri ? <Image source={{ uri: imageUri }} style={styles.thumb} /> : null}
              <ChevronRight />
            </View>
          </Pressable>

          {/* Add Meal Items */}
          <Pressable onPress={() => navigateToMealItems()} style={styles.actionRow}>
            <Text style={styles.actionText}>Add Meal Items</Text>
            <View style={styles.actionRight}>
              {mealItems.length > 0 && (
                <View style={styles.itemCountBadge}>
                  <Text style={styles.itemCountText}>{mealItems.length}</Text>
                </View>
              )}
              <ChevronRight />
            </View>
          </Pressable>

          {/* Selected Meal Items */}
          {mealItems.length > 0 && (
            <View style={styles.mealItemsSection}>
              <View style={styles.mealItemsHeader}>
                <Text style={styles.mealItemsSectionTitle}>Meal Items</Text>
                <Pressable onPress={() => navigateToMealItems()}>
                  <Text style={styles.mealItemsEditBtn}>Edit</Text>
                </Pressable>
              </View>
              {mealItems.map((item, index) => (
                <View key={`${item.provider}-${item.external_id}`}>
                  <View style={styles.mealItemRow}>
                    <View style={styles.mealItemInfo}>
                      <Text style={styles.mealItemName}>{item.display_name}</Text>
                      <Text style={styles.mealItemSource}>
                        {item.provider === 'fdc' ? 'USDA' : 'OFF'}
                      </Text>
                      <Text style={styles.mealItemNutrients} numberOfLines={2}>
                        {item.calories_kcal ? `${item.calories_kcal * item.quantity} kcal` : ''}
                        {item.carbs_g ? ` • ${item.carbs_g * item.quantity}g carbs` : ''}
                        {item.protein_g ? ` • ${item.protein_g * item.quantity}g protein` : ''}
                      </Text>
                    </View>
                    <View style={styles.quantityControls}>
                      <Pressable
                        onPress={() => {
                          if (item.quantity <= 1) {
                            setMealItems(prev => prev.filter((_, i) => i !== index));
                          } else {
                            setMealItems(prev => prev.map((it, i) =>
                              i === index ? { ...it, quantity: it.quantity - 1 } : it
                            ));
                          }
                        }}
                        style={styles.quantityBtn}
                      >
                        <Text style={styles.quantityBtnText}>−</Text>
                      </Pressable>
                      <View style={styles.quantityValue}>
                        <Text style={styles.quantityValueText}>{item.quantity}</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          setMealItems(prev => prev.map((it, i) =>
                            i === index ? { ...it, quantity: it.quantity + 1 } : it
                          ));
                        }}
                        style={styles.quantityBtn}
                      >
                        <Text style={styles.quantityBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                  {index < mealItems.length - 1 && <View style={styles.dashedDivider} />}
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtonsRow}>
            {/* Run Pre Meal Check Button */}
            <Pressable
              onPress={() => {
                // Navigate to pre-meal check with meal data
                router.push({
                  pathname: '/pre-meal-check',
                  params: {
                    mealName,
                    mealTime: mealTime?.toISOString() || '',
                    imageUri: imageUri || '',
                    mealItems: JSON.stringify(mealItems),
                  },
                } as any);
              }}
              disabled={!mealItems.length}
              style={[
                styles.preMealCheckButtonWrapper,
                !mealItems.length && styles.preMealCheckButtonDisabled,
              ]}
            >
              <LinearGradient
                colors={['#27AFDD', '#79C581']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.preMealCheckButton}
              >
                <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.preMealCheckButtonText}>Pre Meal Check</Text>
              </LinearGradient>
            </Pressable>

            {/* Save Button */}
            <Pressable
              onPress={handleSaveMeal}
              disabled={isSaving || !mealName.trim()}
              style={[
                styles.saveButton,
                (isSaving || !mealName.trim()) && styles.saveButtonDisabled,
              ]}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Meal Time sheet */}
        <Sheet open={timeModalOpen} onOpenChange={setTimeModalOpen}>
          <SheetContent showHandle={false} style={styles.timeSheet}>
            <View style={styles.timeSheetTopRow}>
              <View />
              <Pressable
                onPress={() => {
                  setMealTime(fromParts({ hour12: tempHour12, minute: tempMinute, period: tempPeriod }));
                  setTimeModalOpen(false);
                }}
              >
                <Text style={styles.timeSheetSave}>Save</Text>
              </Pressable>
            </View>

            <View style={styles.timePickerRow}>
              {/* Hour */}
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

              {/* Minute */}
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

              {/* Period */}
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

        {/* Image source sheet */}
        <Sheet open={imageSheetOpen} onOpenChange={setImageSheetOpen}>
          <SheetContent>
            <Text style={styles.sheetTitle}>Add Image</Text>
            <SheetItem
              title="Camera"
              onPress={async () => {
                setImageSheetOpen(false);
                await pickFromCamera();
              }}
            />
            <SheetItem
              title="Photo Library"
              onPress={async () => {
                setImageSheetOpen(false);
                await pickFromLibrary();
              }}
            />
            {imageUri ? (
              <SheetItem
                title="Remove Image"
                onPress={() => {
                  setImageUri(null);
                  setImageSheetOpen(false);
                }}
              />
            ) : null}
          </SheetContent>
        </Sheet>
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
  headerIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 33,
    backgroundColor: 'rgba(63,66,67,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  headerIconBtnSpacer: {
    width: 48,
    height: 48,
    opacity: 0,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 24,
  },
  formCard: {
    backgroundColor: 'rgba(63,66,67,0.25)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 24,
  },
  block: {
    gap: 24,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: Colors.textPrimary,
    lineHeight: 16 * 0.95,
  },
  // input styles are provided by <Input />
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
    lineHeight: 16 * 0.95,
  },
  selectTextActive: {
    color: Colors.textPrimary,
  },
  actionRow: {
    backgroundColor: 'rgba(63,66,67,0.25)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  actionText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 14 * 0.95,
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#1b1b1c',
  },
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sheetAction: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#3494D9',
  },
  sheetList: {
    maxHeight: 520,
  },
  // Meal Time wheel sheet (match provided design)
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
    height: 132, // 3 items visible (44 * 3)
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
    // subtle emphasis for the centered value
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
  // Meal Type options (match provided design)
  mealTypeSheet: {
    backgroundColor: '#3F4243',
    borderWidth: 0,
    left: 16,
    right: 16,
    bottom: 120,
    paddingVertical: 26,
    paddingHorizontal: 22,
    borderRadius: 26,
  },
  mealTypeList: {
    gap: 26,
  },
  mealTypeRow: {
    paddingVertical: 10,
  },
  mealTypeRowPressed: {
    opacity: 0.9,
  },
  mealTypeText: {
    fontFamily: fonts.medium,
    fontSize: 24,
    color: Colors.textPrimary,
  },
  dropdownItemText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: Colors.textPrimary,
    flex: 1,
  },
  // Meal items styles
  itemCountBadge: {
    backgroundColor: '#3494D9',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginRight: 8,
  },
  itemCountText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  mealItemsSection: {
    marginTop: 16,
    backgroundColor: 'rgba(63, 66, 67, 0.25)',
    borderRadius: 14,
    padding: 16,
  },
  mealItemsSectionTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#878787',
    marginBottom: 12,
  },
  mealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(135, 135, 135, 0.2)',
  },
  mealItemInfo: {
    flex: 1,
  },
  mealItemName: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: '#FFFFFF',
  },
  mealItemDetails: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#878787',
    marginTop: 2,
  },
  mealItemRemove: {
    padding: 4,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#285E2A',
    borderWidth: 1,
    borderColor: '#448D47',
    borderRadius: 12,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#3F4243',
    borderColor: '#5A5D60',
    opacity: 0.6,
  },
  saveButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  // New meal items Figma styles
  mealItemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  mealItemsEditBtn: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#3494D9',
  },
  mealItemSource: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: '#3494D9',
    marginTop: 2,
  },
  mealItemNutrients: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#878787',
    marginTop: 6,
    lineHeight: 18,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quantityBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#3F4243',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityBtnText: {
    fontFamily: fonts.medium,
    fontSize: 20,
    color: '#FFFFFF',
  },
  quantityValue: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#5A5D60',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityValueText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  dashedDivider: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(135, 135, 135, 0.3)',
    marginVertical: 16,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
  },
  preMealCheckButtonWrapper: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  preMealCheckButton: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  preMealCheckButtonDisabled: {
    opacity: 0.5,
  },
  preMealCheckButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});

