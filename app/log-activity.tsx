import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { createActivityLog, type ActivityIntensity } from '@/lib/supabase';
import { triggerHaptic } from '@/lib/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

const INTENSITY_OPTIONS: { value: ActivityIntensity; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'intense', label: 'Intense' },
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

export default function LogActivityScreen() {
    const { user } = useAuth();
    const [activityName, setActivityName] = React.useState('');
    const [duration, setDuration] = React.useState('');
    const [intensity, setIntensity] = React.useState<ActivityIntensity | null>(null);
    const [activityTime, setActivityTime] = React.useState<Date>(new Date());
    const [isSaving, setIsSaving] = React.useState(false);

    const [timeModalOpen, setTimeModalOpen] = React.useState(false);
    const [intensityModalOpen, setIntensityModalOpen] = React.useState(false);

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
        const parts = toParts(activityTime);
        setTempHour12(parts.hour12);
        setTempMinute(parts.minute);
        setTempPeriod(parts.period);
    }, [timeModalOpen, activityTime]);

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
            Alert.alert('Error', 'You must be logged in to save activity logs');
            return;
        }

        if (!activityName.trim()) {
            Alert.alert('Invalid Input', 'Please enter an activity name');
            return;
        }

        const durationNum = parseInt(duration, 10);
        if (isNaN(durationNum) || durationNum <= 0) {
            Alert.alert('Invalid Input', 'Please enter a valid duration in minutes');
            return;
        }

        if (!intensity) {
            Alert.alert('Invalid Input', 'Please select an intensity level');
            return;
        }

        setIsSaving(true);
        try {
            const selectedTime = fromParts({ hour12: tempHour12, minute: tempMinute, period: tempPeriod });
            const result = await createActivityLog(user.id, {
                activity_name: activityName.trim(),
                logged_at: selectedTime.toISOString(),
                duration_minutes: durationNum,
                intensity,
            });

            if (result) {
                Alert.alert('Success', 'Activity logged successfully', [
                    { text: 'OK', onPress: () => router.back() },
                ]);
            } else {
                Alert.alert('Error', 'Failed to save activity log. Please try again.');
            }
        } catch (error) {
            console.error('Error saving activity log:', error);
            Alert.alert('Error', 'An error occurred while saving. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }, [user, activityName, duration, intensity, tempHour12, tempMinute, tempPeriod]);

    const selectedIntensityLabel = intensity
        ? INTENSITY_OPTIONS.find((i) => i.value === intensity)?.label
        : null;

    return (
        <View style={styles.root}>
            <View style={styles.safe}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.content}
                >
                    {/* Form card */}
                    <View style={styles.formCard}>
                        {/* Activity Name */}
                        <View style={styles.block}>
                            <Text style={styles.label}>Activity Name</Text>
                            <View style={styles.inputShell}>
                                <TextInput
                                    value={activityName}
                                    onChangeText={setActivityName}
                                    placeholder="Enter Activity Name"
                                    placeholderTextColor="#878787"
                                    style={styles.textInput}
                                    returnKeyType="done"
                                />
                            </View>
                        </View>

                        {/* Activity Time */}
                        <View style={styles.block}>
                            <Text style={styles.label}>Activity Time</Text>
                            <Pressable onPress={() => { triggerHaptic(); setTimeModalOpen(true); }} style={styles.selectShell}>
                                <Text style={[styles.selectText, styles.selectTextActive]}>
                                    {formatTime(activityTime)}
                                </Text>
                                <ChevronDown />
                            </Pressable>
                        </View>

                        {/* Duration */}
                        <View style={styles.block}>
                            <Text style={styles.label}>Duration</Text>
                            <View style={styles.durationInputRow}>
                                <View style={styles.durationInputShell}>
                                    <TextInput
                                        value={duration}
                                        onChangeText={setDuration}
                                        placeholder="Enter Duration"
                                        placeholderTextColor="#878787"
                                        style={styles.textInput}
                                        keyboardType="number-pad"
                                        returnKeyType="done"
                                    />
                                </View>
                                <Text style={styles.unitLabel}>mins</Text>
                            </View>
                        </View>

                        {/* Intensity */}
                        <View style={styles.block}>
                            <Text style={styles.label}>Intensity</Text>
                            <DropdownMenu
                                open={intensityModalOpen}
                                onOpenChange={setIntensityModalOpen}
                                trigger={
                                    <Pressable
                                        onPress={() => { triggerHaptic(); setIntensityModalOpen(true); }}
                                        style={styles.selectShell}
                                    >
                                        <Text style={[styles.selectText, intensity && styles.selectTextActive]}>
                                            {selectedIntensityLabel ?? 'Select Intensity'}
                                        </Text>
                                        <ChevronDown />
                                    </Pressable>
                                }
                            >
                                {INTENSITY_OPTIONS.map((option) => (
                                    <DropdownMenuItem
                                        key={option.value}
                                        onSelect={() => {
                                            setIntensity(option.value);
                                            setIntensityModalOpen(false);
                                        }}
                                    >
                                        <Text style={styles.dropdownItemText}>{option.label}</Text>
                                        {intensity === option.value && (
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
                        onPress={() => { triggerHaptic('medium'); handleSave(); }}
                        disabled={isSaving || !activityName || !duration || !intensity}
                        style={({ pressed }) => [
                            styles.saveButton,
                            (isSaving || !activityName || !duration || !intensity) && styles.saveButtonDisabled,
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
                                    triggerHaptic('medium');
                                    setActivityTime(fromParts({ hour12: tempHour12, minute: tempMinute, period: tempPeriod }));
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
            </View>
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
    content: {
        paddingHorizontal: 16,
        paddingTop: 24,
        paddingBottom: Platform.OS === 'ios' ? 100 : 80,
        gap: 24,
    },
    formCard: {
        backgroundColor: 'rgba(240, 248, 249, 0.7)',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 20,
        gap: 24,
        borderWidth: 1,
        borderColor: 'rgba(45, 212, 191, 0.10)',
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
    inputShell: {
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
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
    durationInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    durationInputShell: {
        flex: 1,
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.inputBorderSolid,
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
    saveButtonContainer: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 40 : 20,
        left: 16,
        right: 16,
    },
    saveButton: {
        backgroundColor: Colors.buttonAction,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButtonDisabled: {
        backgroundColor: Colors.buttonDisabled,
    },
    saveButtonPressed: {
        opacity: 0.8,
    },
    saveButtonText: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: Colors.buttonActionText,
    },
    // Time picker styles (same as glucose logging)
    timeSheet: {
        backgroundColor: 'rgba(240, 248, 249, 0.97)',
        borderWidth: 1,
        borderColor: 'rgba(45, 212, 191, 0.12)',
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
        backgroundColor: 'rgba(45, 212, 191, 0.08)',
    },
    wheelText: {
        fontFamily: fonts.medium,
        fontSize: 18,
        color: 'rgba(60, 60, 67, 0.4)',
    },
    wheelTextActive: {
        color: Colors.textPrimary,
        fontFamily: fonts.semiBold,
    },
});
