import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    InteractionManager,
    StyleSheet,
    Switch,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface NotificationPreferences {
    meal_reminders: boolean;
    post_meal_reviews: boolean;
    daily_insights: boolean;
    experiment_updates: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
    meal_reminders: true,
    post_meal_reviews: true,
    daily_insights: true,
    experiment_updates: true,
};

function isMissingNotificationPrefsColumn(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    const message = (error.message || '').toLowerCase();
    return (error.code === '42703' || message.includes('does not exist')) && message.includes('notification_preferences');
}

export default function NotificationSettingsScreen() {
    const { user } = useAuth();
    const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
    const [preferencesPersistSupported, setPreferencesPersistSupported] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

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

    const togglePreference = (key: keyof NotificationPreferences) => {
        const newPreferences = {
            ...preferences,
            [key]: !preferences[key],
        };
        setPreferences(newPreferences);
        savePreferences(newPreferences);
    };

    const handleBack = () => {
        router.back();
    };

    const SettingRow = ({
        label,
        description,
        value,
        onToggle,
    }: {
        label: string;
        description: string;
        value: boolean;
        onToggle: () => void;
    }) => (
        <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>{label}</Text>
                <Text style={styles.settingDescription}>{description}</Text>
            </View>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: Colors.borderCard, true: Colors.primary }}
                thumbColor={value ? '#FFFFFF' : Colors.textTertiary}
                ios_backgroundColor={Colors.borderCard}
            />
        </View>
    );

    if (isLoading) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator color={Colors.primary} size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SafeAreaView edges={['top']} style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <LiquidGlassIconButton size={44} onPress={handleBack}>
                        <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
                    </LiquidGlassIconButton>
                    <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
                    <View style={styles.headerSpacer}>
                        {isSaving && <ActivityIndicator size="small" color={Colors.primary} />}
                    </View>
                </View>

                {/* Settings List */}
                <View style={styles.content}>
                    <View style={styles.card}>
                        <SettingRow
                            label="Meal Reminders"
                            description="Get reminded to log your meals"
                            value={preferences.meal_reminders}
                            onToggle={() => togglePreference('meal_reminders')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            label="Post-Meal Reviews"
                            description="Alerts to review your glucose response"
                            value={preferences.post_meal_reviews}
                            onToggle={() => togglePreference('post_meal_reviews')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            label="Daily Insights"
                            description="Personalized tips and patterns"
                            value={preferences.daily_insights}
                            onToggle={() => togglePreference('daily_insights')}
                        />
                        <View style={styles.divider} />
                        <SettingRow
                            label="Experiment Updates"
                            description="Progress on your active experiments"
                            value={preferences.experiment_updates}
                            onToggle={() => togglePreference('experiment_updates')}
                        />
                    </View>

                    <Text style={styles.footerNote}>
                        Notifications help you stay on track with your glucose management goals.
                    </Text>
                    {!preferencesPersistSupported && (
                        <Text style={styles.footerNote}>
                            Notification preferences will sync after the latest database migration is applied.
                        </Text>
                    )}
                </View>
            </SafeAreaView>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        letterSpacing: 2,
    },
    headerSpacer: {
        width: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    card: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        overflow: 'hidden',
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    settingTextContainer: {
        flex: 1,
        marginRight: 16,
    },
    settingLabel: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 4,
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
