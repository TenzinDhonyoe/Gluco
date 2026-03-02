import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { supabase, type NotificationPreferences } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    InteractionManager,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View
} from 'react-native';

const DEFAULT_PREFERENCES: NotificationPreferences = {
    meal_reminders: true,
    post_meal_reviews: true,
    daily_insights: true,
    experiment_updates: true,
    active_action_midday: true,
    post_meal_action: true,
    weekly_summary: true,
};

function isMissingNotificationPrefsColumn(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    const message = (error.message || '').toLowerCase();
    return (error.code === '42703' || message.includes('does not exist')) && message.includes('notification_preferences');
}

type SettingRowProps = {
    label: string;
    description: string;
    value: boolean;
    onToggle: () => void;
    disabled?: boolean;
};

function SettingRow({ label, description, value, onToggle, disabled }: SettingRowProps) {
    return (
        <View style={[styles.settingRow, disabled && styles.settingRowDisabled]}>
            <View style={styles.settingTextContainer}>
                <Text style={[styles.settingLabel, disabled && styles.settingLabelDisabled]}>{label}</Text>
                <Text style={styles.settingDescription}>{description}</Text>
            </View>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: '#E5E5EA', true: Colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E5E5EA"
                disabled={disabled}
            />
        </View>
    );
}

export default function NotificationSettingsScreen() {
    const { user, profile, refreshProfile } = useAuth();
    const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
    const [preferencesPersistSupported, setPreferencesPersistSupported] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const masterEnabled = profile?.notifications_enabled ?? false;

    const loadPreferences = useCallback(async () => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('notification_preferences')
                .eq('id', user.id)
                .single();

            if (error) {
                if (isMissingNotificationPrefsColumn(error)) {
                    setPreferencesPersistSupported(false);
                    setPreferences(DEFAULT_PREFERENCES);
                    return;
                }
                throw error;
            }

            if (data?.notification_preferences) {
                setPreferences({ ...DEFAULT_PREFERENCES, ...data.notification_preferences });
            }
        } catch (error) {
            console.error('Failed to load preferences:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => {
            loadPreferences();
        });
        return () => task.cancel();
    }, [loadPreferences]);

    const savePreferences = async (newPreferences: NotificationPreferences) => {
        if (!user) return;
        if (!preferencesPersistSupported) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ notification_preferences: newPreferences })
                .eq('id', user.id);

            if (error) {
                if (isMissingNotificationPrefsColumn(error)) {
                    setPreferencesPersistSupported(false);
                    return;
                }
                Alert.alert('Error', 'Failed to save preferences');
            }
        } catch (error) {
            console.error('Failed to save preferences:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleMaster = async () => {
        if (!user) return;
        const newValue = !masterEnabled;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ notifications_enabled: newValue })
                .eq('id', user.id);

            if (error) {
                Alert.alert('Error', 'Failed to update notification setting');
            } else {
                refreshProfile?.();
                if (newValue && Platform.OS === 'ios') {
                    // Re-request notification permissions when toggling back on
                    const { requestNotificationPermissions } = await import('@/lib/notifications');
                    const granted = await requestNotificationPermissions();
                    if (!granted) {
                        // OS denied — revert the toggle and tell user to enable in Settings
                        await supabase
                            .from('profiles')
                            .update({ notifications_enabled: false })
                            .eq('id', user.id);
                        refreshProfile?.();
                        Alert.alert(
                            'Notifications Disabled',
                            'Notification permission was denied. Please enable notifications for Gluco in iOS Settings.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Open Settings', onPress: () => Linking.openSettings() },
                            ]
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Failed to toggle master notifications:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const togglePreference = (key: keyof NotificationPreferences) => {
        const newPreferences = {
            ...preferences,
            [key]: !preferences[key],
        };
        setPreferences(newPreferences);
        savePreferences(newPreferences);
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator color={Colors.primary} size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: 'Notifications' }} />
            <ScrollView style={styles.safeArea} contentContainerStyle={styles.scrollContent}>
                {/* Master Toggle */}
                <View style={styles.card}>
                    <View style={styles.masterRow}>
                        <View style={styles.masterIconContainer}>
                            <Ionicons name="notifications" size={22} color={masterEnabled ? Colors.primary : Colors.textTertiary} />
                        </View>
                        <View style={styles.settingTextContainer}>
                            <Text style={styles.masterLabel}>Allow Notifications</Text>
                            <Text style={styles.settingDescription}>
                                {masterEnabled ? 'Notifications are active' : 'All notifications are paused'}
                            </Text>
                        </View>
                        <Switch
                            value={masterEnabled}
                            onValueChange={toggleMaster}
                            trackColor={{ false: '#E5E5EA', true: Colors.primary }}
                            thumbColor="#FFFFFF"
                            ios_backgroundColor="#E5E5EA"
                        />
                    </View>
                </View>

                {/* Meal Tracking */}
                <Text style={styles.sectionHeader}>Meal Tracking</Text>
                <View style={styles.card}>
                    <SettingRow
                        label="Meal Reminders"
                        description="Nudges to log breakfast, lunch, and dinner"
                        value={preferences.meal_reminders ?? true}
                        onToggle={() => togglePreference('meal_reminders')}
                        disabled={!masterEnabled}
                    />
                    <View style={styles.divider} />
                    <SettingRow
                        label="Post-Meal Check-ins"
                        description="Review how you felt after eating"
                        value={preferences.post_meal_reviews ?? true}
                        onToggle={() => togglePreference('post_meal_reviews')}
                        disabled={!masterEnabled}
                    />
                    <View style={styles.divider} />
                    <SettingRow
                        label="Post-Meal Actions"
                        description="Quick activity suggestions after meals"
                        value={preferences.post_meal_action ?? true}
                        onToggle={() => togglePreference('post_meal_action')}
                        disabled={!masterEnabled}
                    />
                </View>

                {/* Wellness & Coaching */}
                <Text style={styles.sectionHeader}>Wellness & Coaching</Text>
                <View style={styles.card}>
                    <SettingRow
                        label="Daily Insights"
                        description="Personalized tips based on your patterns"
                        value={preferences.daily_insights ?? true}
                        onToggle={() => togglePreference('daily_insights')}
                        disabled={!masterEnabled}
                    />
                    <View style={styles.divider} />
                    <SettingRow
                        label="Midday Nudge"
                        description="A gentle reminder to stay on track"
                        value={preferences.active_action_midday ?? true}
                        onToggle={() => togglePreference('active_action_midday')}
                        disabled={!masterEnabled}
                    />
                    <View style={styles.divider} />
                    <SettingRow
                        label="Experiment Updates"
                        description="Progress on your active experiments"
                        value={preferences.experiment_updates ?? true}
                        onToggle={() => togglePreference('experiment_updates')}
                        disabled={!masterEnabled}
                    />
                </View>

                {/* Summary */}
                <Text style={styles.sectionHeader}>Summary</Text>
                <View style={styles.card}>
                    <SettingRow
                        label="Weekly Summary"
                        description="Recap of your week every Sunday evening"
                        value={preferences.weekly_summary ?? true}
                        onToggle={() => togglePreference('weekly_summary')}
                        disabled={!masterEnabled}
                    />
                </View>

                <Text style={styles.footerNote}>
                    Notifications help you build consistent habits and stay aware of your wellness patterns.
                </Text>
                {!preferencesPersistSupported && (
                    <Text style={styles.footerNote}>
                        Notification preferences will sync after the latest database migration is applied.
                    </Text>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 40,
    },
    sectionHeader: {
        fontFamily: fonts.semiBold,
        fontSize: 14,
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 24,
        marginBottom: 8,
        paddingHorizontal: 4,
    },
    card: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        overflow: 'hidden',
    },
    masterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    masterIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: Colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    masterLabel: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    settingRowDisabled: {
        opacity: 0.4,
    },
    settingTextContainer: {
        flex: 1,
        marginRight: 16,
    },
    settingLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    settingLabelDisabled: {
        color: Colors.textSecondary,
    },
    settingDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.borderCard,
        marginHorizontal: 16,
    },
    footerNote: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: Colors.textTertiary,
        textAlign: 'center',
        marginTop: 24,
        paddingHorizontal: 16,
    },
});
