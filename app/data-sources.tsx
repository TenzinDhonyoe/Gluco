import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { DexcomStatus, getDexcomStatus } from '@/lib/dexcom';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Image,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DataSourcesScreen() {
    const { user } = useAuth();
    const [dexcomStatus, setDexcomStatus] = useState<DexcomStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Toggle states for other integrations (placeholder)
    const [appleHealthActivity, setAppleHealthActivity] = useState(true);
    const [myFitnessPal, setMyFitnessPal] = useState(true);
    const [appleHealthSleep, setAppleHealthSleep] = useState(true);

    const loadDexcomStatus = useCallback(async () => {
        if (!user) return;
        try {
            const status = await getDexcomStatus();
            setDexcomStatus(status);
        } catch (error) {
            console.log('Failed to load Dexcom status:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadDexcomStatus();
    }, [loadDexcomStatus]);

    const handleBack = () => {
        router.back();
    };

    const handleConnectCGM = () => {
        router.push('/connect-dexcom' as never);
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
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBack}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="chevron-back" size={20} color="#E7E8E9" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>DATA SOURCES</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* CGM DEVICE Section */}
                    <Text style={styles.sectionTitle}>CGM DEVICE</Text>
                    <TouchableOpacity
                        style={styles.cgmCard}
                        onPress={handleConnectCGM}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.cgmCardText}>
                            {dexcomStatus?.connected
                                ? 'Dexcom Connected'
                                : 'Connect your CGM Device'}
                        </Text>
                        <Ionicons name="chevron-forward" size={20} color="#E7E8E9" />
                    </TouchableOpacity>

                    {/* ACTIVITY & MOVEMENT Section */}
                    <Text style={styles.sectionTitle}>ACTIVITY & MOVEMENT</Text>
                    <View style={styles.integrationCard}>
                        <View style={styles.integrationRow}>
                            <View style={styles.integrationIconContainer}>
                                <Image
                                    source={require('@/assets/images/apple-health-icon.png')}
                                    style={styles.integrationIcon}
                                    defaultSource={require('@/assets/images/apple-health-icon.png')}
                                />
                            </View>
                            <Text style={styles.integrationLabel}>Apple Health</Text>
                            <Switch
                                value={appleHealthActivity}
                                onValueChange={setAppleHealthActivity}
                                trackColor={{ false: '#3A3D40', true: '#3494D9' }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
                    </View>

                    {/* NUTRITION Section */}
                    <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>NUTRITION</Text>
                        <Text style={styles.sectionSubtitle}>(Meals Only)</Text>
                    </View>
                    <View style={styles.integrationCard}>
                        <View style={styles.integrationRow}>
                            <View style={[styles.integrationIconContainer, styles.mfpIconContainer]}>
                                <Ionicons name="barbell" size={20} color="#3494D9" />
                            </View>
                            <Text style={styles.integrationLabel}>MyFitnessPal</Text>
                            <Switch
                                value={myFitnessPal}
                                onValueChange={setMyFitnessPal}
                                trackColor={{ false: '#3A3D40', true: '#3494D9' }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
                    </View>

                    {/* SLEEP Section */}
                    <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>SLEEP</Text>
                        <Text style={styles.sectionSubtitle}>(Duration Only)</Text>
                    </View>
                    <View style={styles.integrationCard}>
                        <View style={styles.integrationRow}>
                            <View style={styles.integrationIconContainer}>
                                <Image
                                    source={require('@/assets/images/apple-health-icon.png')}
                                    style={styles.integrationIcon}
                                    defaultSource={require('@/assets/images/apple-health-icon.png')}
                                />
                            </View>
                            <Text style={styles.integrationLabel}>Apple Health</Text>
                            <Switch
                                value={appleHealthSleep}
                                onValueChange={setAppleHealthSleep}
                                trackColor={{ false: '#3A3D40', true: '#3494D9' }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
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
    cgmCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1A1D1F',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: '#2A2D30',
    },
    cgmCardText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#FFFFFF',
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
    mfpIconContainer: {
        backgroundColor: 'rgba(52, 148, 217, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    integrationIcon: {
        width: 36,
        height: 36,
    },
    integrationLabel: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
