import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Colors } from '@/constants/Colors';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { RESET_PASSWORD_REDIRECT_URI } from '@/lib/deeplinks';
import { deleteUserData, exportUserData, getUserProfile, resetUserLearning, supabase, updateUserProfile, UserProfile } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    InteractionManager,
    Linking,
    ScrollView,
    Share,
    StyleSheet,
    Switch,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AccountPrivacyScreen() {
    const { user, signOut, refreshProfile } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const [aiEnabled, setAiEnabled] = useState(false);

    // Load user profile
    const loadProfile = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const data = await getUserProfile(user.id);
            setProfile(data);
            setAiEnabled(data?.ai_enabled ?? false);
        } catch (error) {
            console.error('Failed to load profile:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => {
            loadProfile();
        });
        return () => task.cancel();
    }, [loadProfile]);

    const handleBack = () => {
        router.back();
    };

    const handleChangePassword = () => {
        Alert.alert(
            'Change Password',
            'A password reset link will be sent to your email address.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Send Link',
                    onPress: async () => {
                        if (!user?.email) {
                            Alert.alert('Error', 'No email address found for your account.');
                            return;
                        }

                        const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                            redirectTo: RESET_PASSWORD_REDIRECT_URI,
                        });

                        if (error) {
                            Alert.alert('Error', error.message);
                        } else {
                            Alert.alert('Success', 'Password reset link sent to your email.');
                        }
                    },
                },
            ]
        );
    };

    const handleToggleAi = async (value: boolean) => {
        if (!user) return;

        setAiEnabled(value);
        const updates: Partial<UserProfile> = {
            ai_enabled: value,
            ai_consent_at: value ? new Date().toISOString() : profile?.ai_consent_at ?? null,
        };

        const result = await updateUserProfile(user.id, updates);
        if (!result) {
            Alert.alert('Error', 'Failed to update AI preferences. Please try again.');
            setAiEnabled(profile?.ai_enabled ?? false);
            return;
        }

        setProfile(result);
        await refreshProfile();
    };

    const handleEditProfile = (field: string, currentValue: string | null) => {
        Alert.prompt(
            `Edit ${field}`,
            `Enter your ${field.toLowerCase()}`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: async (value: string | undefined) => {
                        if (!user || !value) return;
                        const fieldMap: Record<string, string> = {
                            'First Name': 'first_name',
                            'Last Name': 'last_name',
                            'Date of Birth': 'birth_date',
                            'Biological Sex': 'biological_sex',
                        };
                        const dbField = fieldMap[field];
                        if (dbField) {
                            await updateUserProfile(user.id, { [dbField]: value });
                            loadProfile();
                        }
                    },
                },
            ],
            'plain-text',
            currentValue || ''
        );
    };

    const handleExportData = async () => {
        if (!user) return;

        Alert.alert(
            'Export Data',
            'This will export all your data as a JSON file that you can save or share.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Export',
                    onPress: async () => {
                        try {
                            const data = await exportUserData(user.id);
                            if (!data) {
                                Alert.alert('Error', 'Failed to export data. Please try again.');
                                return;
                            }

                            const jsonString = JSON.stringify(data, null, 2);
                            await Share.share({
                                message: jsonString,
                                title: 'Gluco Data Export',
                            });
                        } catch (error) {
                            Alert.alert('Error', 'Failed to export data. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const handleResetLearning = () => {
        if (!user) return;

        Alert.alert(
            'Reset Personalized Learning',
            'This will erase all personalized patterns and recommendations. Your meal, glucose, and activity logs will be kept. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        const success = await resetUserLearning(user.id);
                        if (success) {
                            Alert.alert('Success', 'Personalized learning has been reset. New patterns will be built from your future activity.');
                        } else {
                            Alert.alert('Error', 'Failed to reset learning. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const handleDeleteAccount = () => {
        if (!user) return;

        Alert.alert(
            'Delete Account & Data',
            'This action is permanent and cannot be undone. All your data including meals, glucose logs, and activity history will be permanently deleted.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Account',
                    style: 'destructive',
                    onPress: () => {
                        Alert.prompt(
                            'Confirm Deletion',
                            'Type "DELETE" to confirm account deletion.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Delete',
                                    style: 'destructive',
                                    onPress: async (text: string | undefined) => {
                                        if (text !== 'DELETE') {
                                            Alert.alert('Cancelled', 'You must type DELETE to confirm.');
                                            return;
                                        }

                                        try {
                                            // Delete all user data
                                            const success = await deleteUserData(user.id);
                                            if (!success) {
                                                Alert.alert('Error', 'Failed to delete some data. Please contact support.');
                                                return;
                                            }

                                            // Clear all local storage including paywall state
                                            await AsyncStorage.clear();

                                            // Sign out the user
                                            await signOut();

                                            // Navigate to welcome screen
                                            router.replace('/');

                                            Alert.alert('Account Deleted', 'Your account and all data have been deleted.');
                                        } catch (error) {
                                            Alert.alert('Error', 'Failed to delete account. Please try again.');
                                        }
                                    },
                                },
                            ],
                            'plain-text'
                        );
                    },
                },
            ]
        );
    };

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const getRegionDisplay = () => {
        const region = profile?.region || 'Not set';
        return region === 'Canada' || region === 'UK' || region === 'EU'
            ? `${region} (mmol/L)`
            : region === 'US'
                ? `${region} (mg/dL)`
                : region;
    };

    // Row component for consistent styling
    const SettingsRow = ({
        label,
        value,
        onPress,
        showChevron = true,
        showDropdown = false,
        isExpanded = false,
    }: {
        label: string;
        value?: string | null;
        onPress?: () => void;
        showChevron?: boolean;
        showDropdown?: boolean;
        isExpanded?: boolean;
    }) => (
        <AnimatedPressable
            style={styles.row}
            onPress={onPress}
            disabled={!onPress}
        >
            <Text style={styles.rowLabel}>{label}</Text>
            <View style={styles.rowRight}>
                {value && <Text style={styles.rowValue}>{value}</Text>}
                {showChevron && <Ionicons name="chevron-forward" size={16} color="#878787" />}
                {showDropdown && (
                    <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color="#878787"
                    />
                )}
            </View>
        </AnimatedPressable>
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
                    <Text style={styles.headerTitle}>ACCOUNT & PRIVACY</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ACCOUNT Section */}
                    <Text style={styles.sectionTitle}>ACCOUNT</Text>
                    <View style={styles.card}>
                        <View style={styles.row}>
                            <Text style={styles.rowLabel}>Email</Text>
                            <Text style={styles.rowValue}>{user?.email || 'Not set'}</Text>
                        </View>
                        <View style={styles.divider} />
                        <SettingsRow
                            label="Password"
                            onPress={handleChangePassword}
                        />
                    </View>

                    {/* PROFILE Section */}
                    <Text style={styles.sectionTitle}>PROFILE</Text>
                    <View style={styles.card}>
                        <SettingsRow
                            label="First Name"
                            value={profile?.first_name || 'Not set'}
                            onPress={() => handleEditProfile('First Name', profile?.first_name ?? null)}
                        />
                        <View style={styles.divider} />
                        <SettingsRow
                            label="Last Name"
                            value={profile?.last_name || 'Not set'}
                            onPress={() => handleEditProfile('Last Name', profile?.last_name ?? null)}
                        />
                        <View style={styles.divider} />
                        <SettingsRow
                            label="Date of Birth"
                            value={formatDate(profile?.birth_date ?? null)}
                            onPress={() => handleEditProfile('Date of Birth', profile?.birth_date ?? null)}
                        />
                        <View style={styles.divider} />
                        <View style={styles.row}>
                            <View style={styles.rowLabelWithIcon}>
                                <Text style={styles.rowLabel}>Biological sex</Text>
                                <Ionicons name="information-circle-outline" size={16} color="#878787" />
                            </View>
                            <View style={styles.rowRight}>
                                <Text style={styles.rowValue}>
                                    {profile?.biological_sex || 'Not set'}
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color="#878787" />
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <SettingsRow
                            label="Region & Units"
                            value={getRegionDisplay()}
                            onPress={() => router.push('/customization' as never)}
                        />
                    </View>

                    {/* PRIVACY Section */}
                    <Text style={styles.sectionTitle}>PRIVACY</Text>
                    <View style={styles.card}>
                        <SettingsRow
                            label="Privacy Policy"
                            onPress={() => Linking.openURL(LEGAL_URLS.privacyPolicy)}
                        />
                        <View style={styles.divider} />
                        <View style={styles.row}>
                            <View style={styles.rowLabelBlock}>
                                <Text style={styles.rowLabel}>AI-Powered Insights</Text>
                                <Text style={styles.rowSubtext}>
                                    Allow AI to generate tips and analyze meal photos.
                                </Text>
                            </View>
                            <Switch
                                value={aiEnabled}
                                onValueChange={handleToggleAi}
                                trackColor={{ false: Colors.borderCard, true: Colors.primary }}
                                thumbColor={aiEnabled ? '#FFFFFF' : Colors.textTertiary}
                                ios_backgroundColor={Colors.borderCard}
                            />
                        </View>
                        <View style={styles.divider} />
                        <SettingsRow
                            label="How Gluco Works"
                            showChevron={false}
                            showDropdown={true}
                            isExpanded={expandedSection === 'how-works'}
                            onPress={() => toggleSection('how-works')}
                        />
                        {expandedSection === 'how-works' && (
                            <View style={styles.expandedContent}>
                                <Text style={styles.expandedText}>
                                    Gluco uses your glucose readings and lifestyle data to provide personalized insights and recommendations for better glucose management.
                                </Text>
                            </View>
                        )}
                        <View style={styles.divider} />
                        <SettingsRow
                            label="How Gluco Uses Your Data"
                            showChevron={false}
                            showDropdown={true}
                            isExpanded={expandedSection === 'data-use'}
                            onPress={() => toggleSection('data-use')}
                        />
                        {expandedSection === 'data-use' && (
                            <View style={styles.expandedContent}>
                                <Text style={styles.expandedText}>
                                    We keep your data private and only use it to provide features you enable. You can turn AI insights on or off at any time.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* DATA CONTROL Section */}
                    <Text style={styles.sectionTitle}>DATA CONTROL</Text>
                    <View style={styles.card}>
                        <SettingsRow
                            label="Export Data"
                            onPress={handleExportData}
                        />
                        <View style={styles.divider} />
                        <SettingsRow
                            label="Reset Personalized Learning"
                            onPress={handleResetLearning}
                        />
                        <View style={styles.divider} />
                        <AnimatedPressable
                            style={styles.row}
                            onPress={handleDeleteAccount}
                        >
                            <Text style={[styles.rowLabel, styles.dangerText]}>Delete Account & Data</Text>
                            <Ionicons name="chevron-forward" size={16} color="#878787" />
                        </AnimatedPressable>
                    </View>
                </ScrollView>
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
        fontSize: 18,
        color: Colors.textPrimary,
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
        color: Colors.textTertiary,
        letterSpacing: 1,
        marginTop: 24,
        marginBottom: 12,
    },
    card: {
        backgroundColor: Colors.backgroundCard,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    rowLabel: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    rowLabelBlock: {
        flex: 1,
        marginRight: 12,
    },
    rowSubtext: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textTertiary,
        marginTop: 4,
    },
    rowLabelWithIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rowValue: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textTertiary,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.borderCard,
        marginHorizontal: 16,
    },
    expandedContent: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    expandedText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: Colors.textTertiary,
        lineHeight: 20,
    },
    dangerText: {
        color: Colors.buttonDestructiveText,
    },
});
