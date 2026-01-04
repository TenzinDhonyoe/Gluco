import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
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

export default function NotificationSettingsScreen() {
    const { user } = useAuth();
    const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadPreferences();
    }, []);

    const loadPreferences = async () => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('notification_preferences')
                .eq('id', user.id)
                .single();

            if (data?.notification_preferences) {
                setPreferences({ ...DEFAULT_PREFERENCES, ...data.notification_preferences });
            }
        } catch (error) {
            console.error('Failed to load preferences:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const savePreferences = async (newPreferences: NotificationPreferences) => {
        if (!user) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ notification_preferences: newPreferences })
                .eq('id', user.id);

            if (error) {
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
                trackColor={{ false: '#3F4243', true: '#3494D9' }}
                thumbColor={value ? '#FFFFFF' : '#878787'}
                ios_backgroundColor="#3F4243"
            />
        </View>
    );

    if (isLoading) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator color="#3494D9" size="large" />
            </View>
        );
    }

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
                    <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
                    <View style={styles.headerSpacer}>
                        {isSaving && <ActivityIndicator size="small" color="#3494D9" />}
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
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
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
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    card: {
        backgroundColor: '#1A1D1F',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2A2D30',
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
        color: '#FFFFFF',
        marginBottom: 4,
    },
    settingDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
    },
    divider: {
        height: 1,
        backgroundColor: '#2A2D30',
        marginHorizontal: 16,
    },
    footerNote: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#878787',
        textAlign: 'center',
        marginTop: 24,
        paddingHorizontal: 16,
    },
});
