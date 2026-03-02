import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { useWeightTrends } from '@/hooks/useWeightTrends';
import { createWeightLog } from '@/lib/supabase';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatDelta(delta: number | null): string {
    if (delta === null) return 'No 7-day baseline yet';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)} kg vs 7 days`;
}

export default function LogWeightScreen() {
    const { user } = useAuth();
    const { points, latestWeightKg, delta7dKg, isLoading, refetch } = useWeightTrends(30);
    const [inputWeight, setInputWeight] = useState('');
    const [saving, setSaving] = useState(false);

    const chartValues = useMemo(() => {
        if (!points.length) return [] as number[];
        return points.slice(-7).map(p => p.avg7d);
    }, [points]);

    const canSave = useMemo(() => {
        const parsed = Number(inputWeight);
        return Number.isFinite(parsed) && parsed > 0 && parsed < 500;
    }, [inputWeight]);

    const handleSave = async () => {
        if (!user?.id || !canSave) return;

        setSaving(true);
        try {
            const parsed = Number(inputWeight);
            const saved = await createWeightLog(user.id, {
                weight_kg: parsed,
                logged_at: new Date().toISOString(),
                source: 'manual',
            });

            if (!saved) {
                Alert.alert('Save failed', 'Please try again.');
                return;
            }

            setInputWeight('');
            await refetch();
            Alert.alert('Saved', 'Weight logged successfully.');
        } catch (error) {
            console.error('Error saving weight:', error);
            Alert.alert('Save failed', 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <View style={styles.card}>
                        <Text style={styles.cardLabel}>7-day trend</Text>
                        {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 16 }} />
                        ) : (
                            <>
                                <Text style={styles.currentValue}>
                                    {latestWeightKg !== null ? `${latestWeightKg.toFixed(1)} kg` : 'No data yet'}
                                </Text>
                                <Text style={styles.deltaText}>{formatDelta(delta7dKg)}</Text>

                                <View style={styles.sparklineRow}>
                                    {chartValues.length > 1 ? (
                                        chartValues.map((val, idx) => {
                                            const min = Math.min(...chartValues);
                                            const max = Math.max(...chartValues);
                                            const height = max === min
                                                ? 24
                                                : 12 + ((val - min) / (max - min)) * 40;
                                            return (
                                                <View key={`bar-${idx}`} style={styles.barWrap}>
                                                    <View style={[styles.bar, { height }]} />
                                                </View>
                                            );
                                        })
                                    ) : (
                                        <Text style={styles.noTrendText}>Add at least two logs to see a trend.</Text>
                                    )}
                                </View>
                            </>
                        )}
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardLabel}>Add today&apos;s weight</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                value={inputWeight}
                                onChangeText={setInputWeight}
                                keyboardType="decimal-pad"
                                placeholder="e.g. 72.4"
                                placeholderTextColor="#777"
                                style={styles.input}
                            />
                            <Text style={styles.inputUnit}>kg</Text>
                        </View>
                        <Text style={styles.inputHint}>Use morning, before-food logs for consistency.</Text>

                        <AnimatedPressable
                            style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            disabled={!canSave || saving}
                        >
                            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Weight</Text>}
                        </AnimatedPressable>
                    </View>
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    safeArea: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 16,
        paddingBottom: 40,
        gap: 14,
    },
    card: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        padding: 14,
    },
    cardLabel: {
        fontFamily: fonts.medium,
        fontSize: 13,
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    currentValue: {
        fontFamily: fonts.bold,
        fontSize: 28,
        color: Colors.textPrimary,
        marginTop: 10,
    },
    deltaText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 4,
        marginBottom: 12,
    },
    sparklineRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        minHeight: 56,
    },
    barWrap: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    bar: {
        width: '100%',
        borderRadius: 6,
        backgroundColor: Colors.success,
    },
    noTrendText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        backgroundColor: Colors.inputBackgroundSolid,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.borderMedium,
        paddingHorizontal: 12,
    },
    input: {
        flex: 1,
        color: Colors.textPrimary,
        fontFamily: fonts.medium,
        fontSize: 20,
        paddingVertical: 12,
    },
    inputUnit: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textSecondary,
        marginLeft: 8,
    },
    inputHint: {
        marginTop: 8,
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
    },
    saveButton: {
        marginTop: 14,
        borderRadius: 16,
        backgroundColor: Colors.buttonAction,
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButtonDisabled: {
        backgroundColor: Colors.buttonDisabled,
    },
    saveButtonText: {
        fontFamily: fonts.semiBold,
        color: Colors.buttonActionText,
        fontSize: 15,
    },
});
