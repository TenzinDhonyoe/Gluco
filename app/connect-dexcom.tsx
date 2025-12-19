import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import {
    buildDexcomAuthUrl,
    DexcomStatus,
    disconnectDexcom,
    exchangeDexcomCode,
    getDexcomStatus,
    syncDexcom,
} from '@/lib/dexcom';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// CGM Device options
const CGM_DEVICES = [
    { id: 'dexcom', name: 'Dexcom G6/G7', available: true },
    { id: 'freestyle', name: 'Freestyle Libre', available: false },
    { id: 'eversense', name: 'Eversense', available: false },
];

// Build redirect URI for OAuth callback
const REDIRECT_URI = Linking.createURL('dexcom');

export default function ConnectCGMScreen() {
    const { user } = useAuth();
    const [status, setStatus] = useState<DexcomStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    // Load connection status
    const loadStatus = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const result = await getDexcomStatus();
            setStatus(result);
        } catch (error) {
            console.error('Failed to load Dexcom status:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    // Handle OAuth callback
    useEffect(() => {
        const subscription = Linking.addEventListener('url', async (event) => {
            const url = event.url;
            if (url.includes('dexcom')) {
                const params = Linking.parse(url);
                const code = params.queryParams?.code as string | undefined;

                if (code) {
                    setIsConnecting(true);
                    try {
                        const result = await exchangeDexcomCode(code, REDIRECT_URI, 'prod');
                        if (result.ok) {
                            Alert.alert('Success', 'Dexcom connected successfully!');
                            await loadStatus();
                            // Auto-sync after connecting
                            handleSync();
                        } else {
                            Alert.alert('Error', result.error || 'Failed to connect');
                        }
                    } catch (error) {
                        Alert.alert('Error', 'Failed to complete connection');
                    } finally {
                        setIsConnecting(false);
                    }
                }
            }
        });

        return () => subscription.remove();
    }, [loadStatus]);

    const handleConnectDexcom = async () => {
        setIsConnecting(true);
        try {
            const authUrl = buildDexcomAuthUrl(REDIRECT_URI, 'prod');
            await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
        } catch (error) {
            console.error('OAuth error:', error);
            Alert.alert('Error', 'Failed to open Dexcom login');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const result = await syncDexcom(24);
            if (result.ok) {
                Alert.alert(
                    'Sync Complete',
                    `Imported ${result.inserted} new readings (${result.skipped} skipped)`
                );
            } else {
                Alert.alert('Error', 'Failed to sync glucose data');
            }
        } catch (error) {
            console.error('Sync error:', error);
            Alert.alert('Error', 'Failed to sync glucose data');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDisconnect = () => {
        Alert.alert(
            'Disconnect Dexcom',
            'Are you sure you want to disconnect your Dexcom account? Your previously synced data will be kept.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disconnect',
                    style: 'destructive',
                    onPress: async () => {
                        setIsDisconnecting(true);
                        try {
                            const result = await disconnectDexcom(false);
                            if (result.ok) {
                                Alert.alert('Disconnected', 'Dexcom has been disconnected');
                                setStatus({ connected: false });
                            } else {
                                Alert.alert('Error', result.error || 'Failed to disconnect');
                            }
                        } catch (error) {
                            Alert.alert('Error', 'Failed to disconnect');
                        } finally {
                            setIsDisconnecting(false);
                        }
                    },
                },
            ]
        );
    };

    const handleSelectDevice = (deviceId: string) => {
        if (deviceId === 'dexcom') {
            if (status?.connected) {
                // Already connected, show options
                Alert.alert(
                    'Dexcom Connected',
                    'What would you like to do?',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Sync Now', onPress: handleSync },
                        { text: 'Disconnect', style: 'destructive', onPress: handleDisconnect },
                    ]
                );
            } else {
                handleConnectDexcom();
            }
        } else {
            Alert.alert('Coming Soon', 'This device integration is not yet available.');
        }
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

            <SafeAreaView edges={['top']} style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBack}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="chevron-back" size={20} color="#E7E8E9" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>CONNECT CGM</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Description */}
                    <Text style={styles.description}>
                        Connect your CGM device to automatically sync glucose readings for real-time insights.
                    </Text>

                    {/* CGM Devices List */}
                    <View style={styles.devicesCard}>
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator color="#3494D9" />
                            </View>
                        ) : (
                            CGM_DEVICES.map((device, index) => (
                                <React.Fragment key={device.id}>
                                    <TouchableOpacity
                                        style={styles.deviceRow}
                                        onPress={() => handleSelectDevice(device.id)}
                                        activeOpacity={0.7}
                                        disabled={isConnecting || isSyncing || isDisconnecting}
                                    >
                                        <View style={styles.deviceInfo}>
                                            <Text style={styles.deviceName}>{device.name}</Text>
                                            {device.id === 'dexcom' && status?.connected && (
                                                <Text style={styles.connectedBadge}>Connected</Text>
                                            )}
                                            {!device.available && (
                                                <Text style={styles.comingSoonBadge}>Coming Soon</Text>
                                            )}
                                        </View>
                                        {(isConnecting || isSyncing || isDisconnecting) && device.id === 'dexcom' ? (
                                            <ActivityIndicator color="#3494D9" size="small" />
                                        ) : (
                                            <Ionicons name="chevron-forward" size={20} color="#878787" />
                                        )}
                                    </TouchableOpacity>
                                    {index < CGM_DEVICES.length - 1 && <View style={styles.divider} />}
                                </React.Fragment>
                            ))
                        )}
                    </View>

                    {/* Connected Status Info */}
                    {status?.connected && status.updatedAt && (
                        <Text style={styles.syncInfo}>
                            Last synced: {new Date(status.updatedAt).toLocaleString()}
                        </Text>
                    )}

                    {/* What data is synced? - Bottom Info */}
                    <View style={styles.infoSection}>
                        <Text style={styles.infoTitle}>What data is synced?</Text>
                        <View style={styles.infoItem}>
                            <Ionicons name="checkmark" size={16} color="#4CAF50" />
                            <Text style={styles.infoItemText}>Glucose readings (EGVs)</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Ionicons name="checkmark" size={16} color="#4CAF50" />
                            <Text style={styles.infoItemText}>Reading timestamps</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Ionicons name="lock-closed" size={16} color="#3494D9" />
                            <Text style={styles.infoItemText}>Your data is encrypted and secure</Text>
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
    description: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#AAAAAA',
        lineHeight: 20,
        marginTop: 8,
        marginBottom: 24,
    },
    devicesCard: {
        backgroundColor: '#1A1D1F',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2A2D30',
        overflow: 'hidden',
    },
    loadingContainer: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    deviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    deviceInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    deviceName: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#FFFFFF',
    },
    connectedBadge: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        overflow: 'hidden',
    },
    comingSoonBadge: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#878787',
        backgroundColor: 'rgba(135, 135, 135, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        overflow: 'hidden',
    },
    divider: {
        height: 1,
        backgroundColor: '#2A2D30',
        marginHorizontal: 16,
    },
    syncInfo: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: '#878787',
        textAlign: 'center',
        marginTop: 16,
    },
    infoSection: {
        marginTop: 32,
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: '#2A2D30',
    },
    infoTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 16,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    infoItemText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#AAAAAA',
    },
});
