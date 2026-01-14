import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { fonts } from '@/hooks/useFonts';
import {
    getActiveMinutes,
    getHRV,
    getRestingHeartRate,
    getSleepData,
    getSteps,
    initHealthKit,
    isHealthKitAvailable,
    requestHealthKitAuthorization
} from '@/lib/healthkit';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    ActivityIndicator,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DataSourcesScreen() {
    // Toggle state for Apple Health integration
    const [appleHealthEnabled, setAppleHealthEnabled] = useState(true);
    const [isRequestingHealthAuth, setIsRequestingHealthAuth] = useState(false);
    const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
    const [diagnostics, setDiagnostics] = useState<{
        isAvailable: boolean;
        isAuthorized: boolean;
        avgStepsPerDay: number | null;
        avgActiveMinutes: number | null;
        avgSleepHours: number | null;
        avgRestingHR: number | null;
        avgHRV: number | null;
        error: string | null;
    } | null>(null);

    // Load initial state
    React.useEffect(() => {
        let isMounted = true;
        const loadState = async () => {
            const value = await AsyncStorage.getItem('apple_health_enabled');
            if (!isMounted) return;

            if (value !== null) {
                setAppleHealthEnabled(value === 'true');
            } else if (Platform.OS !== 'ios' || !isHealthKitAvailable()) {
                // Default to disabled if HealthKit is unavailable
                setAppleHealthEnabled(false);
            }

            // If Apple Health is enabled, ensure we've requested permissions at least once.
            if (Platform.OS === 'ios' && value === 'true') {
                const alreadyRequested = await AsyncStorage.getItem('healthkit_permission_requested');
                if (!alreadyRequested) {
                    setIsRequestingHealthAuth(true);
                    await requestHealthKitAuthorization().catch(() => null);
                    setIsRequestingHealthAuth(false);
                    await AsyncStorage.setItem('healthkit_permission_requested', 'true');
                }
            }
        };

        loadState();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleToggle = async (value: boolean) => {
        if (!value) {
            setAppleHealthEnabled(false);
            await AsyncStorage.setItem('apple_health_enabled', 'false');
            return;
        }

        if (Platform.OS !== 'ios') {
            Alert.alert('Apple Health', 'Apple Health is only available on iOS devices.');
            setAppleHealthEnabled(false);
            await AsyncStorage.setItem('apple_health_enabled', 'false');
            return;
        }

        if (!isHealthKitAvailable()) {
            Alert.alert('Apple Health', 'HealthKit is not available on this device.');
            setAppleHealthEnabled(false);
            await AsyncStorage.setItem('apple_health_enabled', 'false');
            return;
        }

        setIsRequestingHealthAuth(true);
        const authorized = await requestHealthKitAuthorization().catch(() => false);
        setIsRequestingHealthAuth(false);

        if (!authorized) {
            Alert.alert(
                'Apple Health',
                'Permission was not granted. You can enable access later in the Health app.'
            );
            setAppleHealthEnabled(false);
            await AsyncStorage.setItem('apple_health_enabled', 'false');
            return;
        }

        setAppleHealthEnabled(true);
        await AsyncStorage.setItem('apple_health_enabled', 'true');
    };

    const handleBack = () => {
        router.back();
    };

    const runDiagnostics = async () => {
        if (isRunningDiagnostics) return;
        setIsRunningDiagnostics(true);

        const available = Platform.OS === 'ios' && isHealthKitAvailable();
        if (!available) {
            setDiagnostics({
                isAvailable: false,
                isAuthorized: false,
                avgStepsPerDay: null,
                avgActiveMinutes: null,
                avgSleepHours: null,
                avgRestingHR: null,
                avgHRV: null,
                error: 'HealthKit native module unavailable.',
            });
            setIsRunningDiagnostics(false);
            return;
        }

        const authorized = await initHealthKit().catch(() => false);
        if (!authorized) {
            setDiagnostics({
                isAvailable: true,
                isAuthorized: false,
                avgStepsPerDay: null,
                avgActiveMinutes: null,
                avgSleepHours: null,
                avgRestingHR: null,
                avgHRV: null,
                error: 'HealthKit authorization failed or was denied.',
            });
            setIsRunningDiagnostics(false);
            return;
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7);

        const [stepsData, sleepData, activeData, hrData, hrvData] = await Promise.all([
            getSteps(startDate, endDate),
            getSleepData(startDate, endDate),
            getActiveMinutes(startDate, endDate),
            getRestingHeartRate(startDate, endDate),
            getHRV(startDate, endDate),
        ]);

        setDiagnostics({
            isAvailable: true,
            isAuthorized: true,
            avgStepsPerDay: stepsData?.avgStepsPerDay ?? null,
            avgActiveMinutes: activeData?.avgMinutesPerDay ?? null,
            avgSleepHours: sleepData?.avgMinutesPerNight ? sleepData.avgMinutesPerNight / 60 : null,
            avgRestingHR: hrData?.avgRestingHR ?? null,
            avgHRV: hrvData?.avgHRV ?? null,
            error: null,
        });

        setIsRunningDiagnostics(false);
    };

    return (
        <View style={styles.container}>
            {/* Background gradient */}
            <LinearGradient
                colors={['#1a1f24', '#181c20', '#111111']}
                locations={[0, 0.3, 1]}
                style={styles.backgroundGradient}
            />

            <SafeAreaView style={styles.safeArea} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <AnimatedPressable
                        style={styles.backButton}
                        onPress={handleBack}
                    >
                        <Ionicons name="chevron-back" size={20} color="#E7E8E9" />
                    </AnimatedPressable>
                    <Text style={styles.headerTitle}>DATA SOURCES</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* CONNECTED SERVICES Section */}
                    <Text style={styles.sectionTitle}>CONNECTED SERVICES</Text>
                    <View style={styles.integrationCard}>
                        <View style={styles.integrationRow}>
                            <View style={styles.integrationIconContainer}>
                                <Image
                                    source={require('@/assets/images/apple-health-icon.png')}
                                    style={styles.integrationIcon}
                                    defaultSource={require('@/assets/images/apple-health-icon.png')}
                                />
                            </View>
                            <View style={styles.integrationInfo}>
                                <Text style={styles.integrationLabel}>Apple Health</Text>
                                <Text style={styles.integrationDescription}>
                                    Activity, sleep, steps & heart rate
                                </Text>
                            </View>
                            <Switch
                                value={appleHealthEnabled}
                                onValueChange={handleToggle}
                                disabled={isRequestingHealthAuth}
                                trackColor={{ false: '#3A3D40', true: '#3494D9' }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
                    </View>

                    {/* GLUCOSE Section */}
                    <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>GLUCOSE</Text>
                        <Text style={styles.sectionSubtitle}>(Manual Entry)</Text>
                    </View>
                    <View style={styles.infoCard}>
                        <Ionicons name="finger-print-outline" size={24} color="#878787" />
                        <Text style={styles.infoText}>
                            Log your glucose readings manually using the Log tab. CGM integrations coming soon.
                        </Text>
                    </View>

                    {/* HealthKit Diagnostics */}
                    <Text style={styles.sectionTitle}>HEALTHKIT DIAGNOSTICS</Text>
                    <View style={[styles.infoCard, styles.diagnosticsCard]}>
                        <View style={styles.diagnosticsHeader}>
                            <Ionicons name="pulse-outline" size={22} color="#878787" />
                            <Text style={styles.diagnosticsTitle}>Quick check for TestFlight</Text>
                        </View>
                        <Text style={styles.infoText}>
                            Runs a permission request and fetches a 7-day sample. Use this if Apple Health never prompts.
                        </Text>
                        <AnimatedPressable
                            style={styles.diagnosticsButton}
                            onPress={runDiagnostics}
                            disabled={isRunningDiagnostics}
                        >
                            {isRunningDiagnostics ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.diagnosticsButtonText}>Run HealthKit Check</Text>
                            )}
                        </AnimatedPressable>
                        {diagnostics && (
                            <View style={styles.diagnosticsResults}>
                                <Text style={styles.diagnosticsLine}>
                                    Available: {diagnostics.isAvailable ? 'Yes' : 'No'}
                                </Text>
                                <Text style={styles.diagnosticsLine}>
                                    Authorized: {diagnostics.isAuthorized ? 'Yes' : 'No'}
                                </Text>
                                <Text style={styles.diagnosticsLine}>
                                    Steps avg: {diagnostics.avgStepsPerDay ?? '—'}
                                </Text>
                                <Text style={styles.diagnosticsLine}>
                                    Activity avg: {diagnostics.avgActiveMinutes ?? '—'}
                                </Text>
                                <Text style={styles.diagnosticsLine}>
                                    Sleep avg: {diagnostics.avgSleepHours ? diagnostics.avgSleepHours.toFixed(1) : '—'} hrs
                                </Text>
                                <Text style={styles.diagnosticsLine}>
                                    Resting HR avg: {diagnostics.avgRestingHR ?? '—'}
                                </Text>
                                <Text style={styles.diagnosticsLine}>
                                    HRV avg: {diagnostics.avgHRV ?? '—'}
                                </Text>
                                {diagnostics.error && (
                                    <Text style={styles.diagnosticsError}>{diagnostics.error}</Text>
                                )}
                            </View>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    backgroundGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 280,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: '#FFFFFF',
        letterSpacing: 2,
    },
    headerSpacer: {
        width: 48,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    sectionTitle: {
        fontFamily: fonts.bold,
        fontSize: 12,
        color: '#878787',
        letterSpacing: 1,
        marginTop: 24,
        marginBottom: 12,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 24,
        marginBottom: 12,
        gap: 6,
    },
    sectionSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        fontStyle: 'italic',
    },
    integrationCard: {
        backgroundColor: '#1A1D1F',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2A2D30',
        overflow: 'hidden',
    },
    integrationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    integrationIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 8,
        overflow: 'hidden',
        marginRight: 12,
    },
    integrationIcon: {
        width: 36,
        height: 36,
    },
    integrationInfo: {
        flex: 1,
    },
    integrationLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
    },
    integrationDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        marginTop: 2,
    },
    infoCard: {
        backgroundColor: '#1A1D1F',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2A2D30',
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    infoText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        lineHeight: 20,
    },
    diagnosticsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    diagnosticsTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#E7E8E9',
    },
    diagnosticsButton: {
        marginTop: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#2A2D30',
        alignItems: 'center',
    },
    diagnosticsButtonText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },
    diagnosticsResults: {
        marginTop: 12,
        gap: 4,
    },
    diagnosticsLine: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#B7B9BB',
        flexWrap: 'wrap',
    },
    diagnosticsError: {
        marginTop: 6,
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#F44336',
        flexWrap: 'wrap',
    },
    diagnosticsCard: {
        flexDirection: 'column',
        alignItems: 'stretch',
    },
});
