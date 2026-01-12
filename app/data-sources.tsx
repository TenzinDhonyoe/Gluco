import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { fonts } from '@/hooks/useFonts';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Image,
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

    // Load initial state
    React.useEffect(() => {
        AsyncStorage.getItem('apple_health_enabled').then(value => {
            if (value !== null) {
                setAppleHealthEnabled(value === 'true');
            }
        });
    }, []);

    const handleToggle = async (value: boolean) => {
        setAppleHealthEnabled(value);
        await AsyncStorage.setItem('apple_health_enabled', value.toString());

        // If disabling, we might want to clear local state/cache or notify context
        // For now, simpler is better: strictly gate fetching
    };

    const handleBack = () => {
        router.back();
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
});
