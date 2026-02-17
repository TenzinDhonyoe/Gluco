import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Colors } from '@/constants/Colors';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { createGlucoseLog, type GlucoseContext, updatePostMealReviewWithManualGlucose } from '@/lib/supabase';
import { parseGlucoseInput, getGlucoseInputPlaceholder, formatGlucoseWithUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const GLUCOSE_CONTEXTS: { value: GlucoseContext; label: string }[] = [
  { value: 'pre_meal', label: 'Pre Meal' },
  { value: 'post_meal', label: 'Post Meal' },
  { value: 'random', label: 'Random' },
  { value: 'fasting', label: 'Fasting' },
  { value: 'bedtime', label: 'Bedtime' },
];

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

export default function LogGlucoseScreen() {
  const { user } = useAuth();
  const glucoseUnit = useGlucoseUnit();
  const { reviewId, context: paramContext, returnTo } = useLocalSearchParams<{
    reviewId?: string;
    context?: string;
    returnTo?: string;
  }>();
  const [glucoseLevel, setGlucoseLevel] = React.useState('');
  const [context, setContext] = React.useState<GlucoseContext | null>(null);
  const [glucoseTime, setGlucoseTime] = React.useState<Date>(new Date());
  const [isSaving, setIsSaving] = React.useState(false);

  const [timeModalOpen, setTimeModalOpen] = React.useState(false);
  const [contextModalOpen, setContextModalOpen] = React.useState(false);

  // Auto-set context if coming from post-meal review
  React.useEffect(() => {
    if (paramContext === 'post_meal' && !context) {
      setContext('post_meal');
    }
  }, [paramContext, context]);

  // Wheel options (minute is 00-59)
  const HOURS = React.useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')), []);
  const MINUTES = React.useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')), []);
  const PERIODS = React.useMemo(() => ['AM', 'PM'] as const, []);

  // Initialize temp picker values with current time
  const getInitialParts = () => {
    const now = new Date();
    return toParts(now);
  };
  const initialParts = getInitialParts();
  const [tempHour12, setTempHour12] = React.useState(initialParts.hour12);
  const [tempMinute, setTempMinute] = React.useState(initialParts.minute);
  const [tempPeriod, setTempPeriod] = React.useState<'AM' | 'PM'>(initialParts.period);

  const ITEM_H = 44;
  const V_PAD = ITEM_H * 1;

  // Initialize temp picker values when opening the time sheet
  React.useEffect(() => {
    if (!timeModalOpen) return;
    const parts = toParts(glucoseTime);
    setTempHour12(parts.hour12);
    setTempMinute(parts.minute);
    setTempPeriod(parts.period);
  }, [timeModalOpen, glucoseTime]);

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

  const handleSave = React.useCallback(async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to save glucose logs');
      return;
    }

    // Parse input and convert to mmol/L for storage
    const levelMmol = parseGlucoseInput(glucoseLevel, glucoseUnit);
    if (levelMmol === null || levelMmol <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid glucose level');
      return;
    }

    setIsSaving(true);
    try {
      const selectedTime = fromParts({ hour12: tempHour12, minute: tempMinute, period: tempPeriod });
      const result = await createGlucoseLog(user.id, {
        glucose_level: levelMmol,  // Always store in mmol/L
        unit: 'mmol/L',
        logged_at: selectedTime.toISOString(),
        context: context || null,
      });

      if (result) {
        // If coming from post-meal review, update the review with this glucose value
        if (reviewId) {
          const updateSuccess = await updatePostMealReviewWithManualGlucose(reviewId, levelMmol);
          if (!updateSuccess) {
            console.warn('Failed to update post-meal review with glucose');
          }

          // Navigate to notifications with success feedback for post-meal reviews
          Alert.alert(
            'Review Submitted',
            `Your glucose reading of ${formatGlucoseWithUnit(levelMmol, glucoseUnit)} has been logged and compared with the prediction. This data will help improve future recommendations.`,
            [
              {
                text: 'OK',
                onPress: () => {
                  // Go to notifications screen instead of back to review
                  router.replace('/notifications-list' as any);
                }
              },
            ]
          );
        } else {
          // Regular glucose log (not from post-meal review)
          Alert.alert('Success', 'Glucose level logged successfully', [
            {
              text: 'OK',
              onPress: () => router.back()
            },
          ]);
        }
      } else {
        Alert.alert('Error', 'Failed to save glucose log. Please try again.');
      }
    } catch (error) {
      console.error('Error saving glucose log:', error);
      Alert.alert('Error', 'An error occurred while saving. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [user, glucoseLevel, glucoseUnit, tempHour12, tempMinute, tempPeriod, context, reviewId]);

  const selectedContextLabel = context
    ? GLUCOSE_CONTEXTS.find((c) => c.value === context)?.label
    : null;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <LiquidGlassIconButton size={44} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
          </LiquidGlassIconButton>

          <Text style={styles.headerTitle}>LOG GLUCOSE</Text>

          {/* spacer for centering */}
          <View style={styles.headerIconBtnSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* Form card */}
          <View style={styles.formCard}>
            {/* Time */}
            <View style={styles.block}>
              <Text style={styles.label}>Time</Text>
              <Pressable onPress={() => setTimeModalOpen(true)} style={styles.selectShell}>
                <Text style={[styles.selectText, styles.selectTextActive]}>
                  {formatTime(glucoseTime)}
                </Text>
                <ChevronDown />
              </Pressable>
            </View>

            {/* Glucose Level */}
            <View style={styles.block}>
              <Text style={styles.label}>Glucose Level</Text>
              <View style={styles.glucoseInputRow}>
                <View style={styles.glucoseInputShell}>
                  <TextInput
                    value={glucoseLevel}
                    onChangeText={setGlucoseLevel}
                    placeholder={getGlucoseInputPlaceholder(glucoseUnit)}
                    placeholderTextColor="#878787"
                    style={styles.glucoseInput}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>
                <Text style={styles.unitLabel}>{glucoseUnit}</Text>
              </View>
            </View>

            {/* Context */}
            <View style={styles.block}>
              <Text style={styles.label}>Context</Text>
              <DropdownMenu
                open={contextModalOpen}
                onOpenChange={setContextModalOpen}
                trigger={
                  <Pressable
                    onPress={() => setContextModalOpen(true)}
                    style={styles.selectShell}
                  >
                    <Text style={[styles.selectText, context && styles.selectTextActive]}>
                      {selectedContextLabel ?? 'Select Context'}
                    </Text>
                    <ChevronDown />
                  </Pressable>
                }
              >
                {GLUCOSE_CONTEXTS.map((ctx) => (
                  <DropdownMenuItem
                    key={ctx.value}
                    onSelect={() => {
                      setContext(ctx.value);
                      setContextModalOpen(false);
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{ctx.label}</Text>
                    {context === ctx.value && (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenu>
            </View>
          </View>
        </ScrollView>

        {/* Save Button */}
        <View style={styles.saveButtonContainer}>
          <Pressable
            onPress={handleSave}
            disabled={isSaving || !glucoseLevel}
            style={({ pressed }) => [
              styles.saveButton,
              (isSaving || !glucoseLevel) && styles.saveButtonDisabled,
              pressed && !isSaving && styles.saveButtonPressed,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>

        {/* Time sheet */}
        <Sheet open={timeModalOpen} onOpenChange={setTimeModalOpen}>
          <SheetContent showHandle={false} style={styles.timeSheet}>
            <View style={styles.timeSheetTopRow}>
              <View />
              <Pressable
                onPress={() => {
                  setGlucoseTime(fromParts({ hour12: tempHour12, minute: tempMinute, period: tempPeriod }));
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
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
  headerIconBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
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
    paddingBottom: Platform.OS === 'ios' ? 100 : 80,
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
    gap: 12,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: Colors.textPrimary,
    lineHeight: 16 * 0.95,
  },
  selectShell: {
    backgroundColor: Colors.inputBackgroundSolid,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.inputBorderSolid,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: Colors.textTertiary,
    lineHeight: 16 * 0.95,
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
    backgroundColor: Colors.inputBackgroundSolid,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.inputBorderSolid,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  glucoseInput: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: Colors.textPrimary,
    padding: 0,
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
  saveButtonContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 16,
    right: 16,
  },
  saveButton: {
    backgroundColor: Colors.buttonSecondary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.buttonSecondaryBorder,
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
  // Time picker styles (same as meal logging)
  timeSheet: {
    backgroundColor: Colors.borderCard,
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
    color: Colors.primary,
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
    color: Colors.textPrimary,
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
    color: Colors.textPrimary,
    fontFamily: fonts.semiBold,
  },
});
