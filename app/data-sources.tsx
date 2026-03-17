import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import {
    isHealthKitAvailable,
    requestHealthKitAuthorization
} from '@/lib/healthkit';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import {
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native';

export default function DataSourcesScreen() {
    // Toggle state for Apple Health integration
    const [appleHealthEnabled, setAppleHealthEnabled] = useState(false);
    const [isRequestingHealthAuth, setIsRequestingHealthAuth] = useState(false);
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

    return (
        <View style={styles.container}>
            <View style={styles.safeArea}>
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
                                    source={require('@/assets/images/icons/apple-health-icon.png')}
                                    style={styles.integrationIcon}
                                    defaultSource={require('@/assets/images/icons/apple-health-icon.png')}
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
                                trackColor={{ false: '#E5E5EA', true: Colors.primary }}
                                thumbColor="#FFFFFF"
                                ios_backgroundColor="#E5E5EA"
                            />
                        </View>
                    </View>

                    {/* GLUCOSE Section */}
                    <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>GLUCOSE</Text>
                        <Text style={styles.sectionSubtitle}>(Manual Entry)</Text>
                    </View>
                    <View style={styles.infoCard}>
                        <Ionicons name="finger-print-outline" size={24} color={Colors.textSecondary} />
                        <Text style={styles.infoText}>
                            Log your glucose readings manually using the Log tab.
                        </Text>
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
        color: Colors.textTertiary,
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
        color: Colors.textTertiary,
        fontStyle: 'italic',
    },
    integrationCard: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
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
        color: Colors.textPrimary,
    },
    integrationDescription: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        marginTop: 2,
    },
    infoCard: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    infoText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
        lineHeight: 20,
    },
});
