import { AnimatedScreen } from '@/components/animated-screen';
import { Colors } from '@/constants/Colors';
import { useAuth, useGlucoseUnit } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { ActivityLog, getActivityLogs, getGlucoseLogs, getMeals, getPersonalizedTips, GlucoseLog, Meal } from '@/lib/supabase';
import { formatGlucoseWithUnit, GlucoseUnit } from '@/lib/utils/glucoseUnits';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TIP_CARD_WIDTH = 271;
const TIP_CARD_HEIGHT = 262;

// Types
type TipCategory = 'glucose' | 'meal' | 'activity' | 'sleep';

interface TipCardData {
    id: string;
    category: TipCategory;
    title: string;
    description: string;
    image: any;
    articleUrl?: string;
    metric?: string;
}

type LogType = 'activity' | 'meal' | 'glucose';

type FilterType = 'all' | 'meal' | 'activity' | 'glucose';

interface LogEntry {
    id: string;
    type: LogType;
    label: string;
    description: string;
    time: string;
    logged_at: string; // ISO string for sorting
}

// Default tips shown while loading personalized data
const TIPS_DATA: TipCardData[] = [
    {
        id: '1',
        category: 'glucose',
        title: 'Glucose',
        description: 'Gathering your data...',
        image: require('@/assets/images/glucose-tip-bg.png'),
    },
    {
        id: '2',
        category: 'meal',
        title: 'Meal',
        description: 'Gathering your data...',
        image: require('@/assets/images/meal-tip-bg.png'),
    },
    {
        id: '3',
        category: 'activity',
        title: 'Activity',
        description: 'Gathering your data...',
        image: require('@/assets/images/activity-tip-bg.png'),
    },
];

// Helper function to format context label
function formatContextLabel(context: string | null): string {
    if (!context) return 'Manual';
    return context
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Helper function to format time from ISO string
function formatLogTime(isoString: string): string {
    const date = new Date(isoString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Transform glucose log to unified LogEntry format
function transformGlucoseLog(log: GlucoseLog, glucoseUnit: GlucoseUnit): LogEntry {
    return {
        id: `glucose-${log.id}`,
        type: 'glucose',
        label: `Glucose (${formatContextLabel(log.context)})`,
        description: formatGlucoseWithUnit(log.glucose_level, glucoseUnit),
        time: formatLogTime(log.logged_at),
        logged_at: log.logged_at,
    };
}

// Transform activity log to unified LogEntry format
function transformActivityLog(log: ActivityLog): LogEntry {
    return {
        id: `activity-${log.id}`,
        type: 'activity',
        label: 'Activity',
        description: `${log.duration_minutes}min ${log.activity_name}`,
        time: formatLogTime(log.logged_at),
        logged_at: log.logged_at,
    };
}

// Transform meal log to unified LogEntry format
function transformMealLog(meal: Meal): LogEntry {
    return {
        id: `meal-${meal.id}`,
        type: 'meal',
        label: meal.name,
        description: meal.meal_type ? `${meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)}` : 'Meal',
        time: formatLogTime(meal.logged_at),
        logged_at: meal.logged_at,
    };
}

// Helper functions
function getCategoryIcon(category: TipCategory) {
    switch (category) {
        case 'glucose':
            return <GlucoseIcon />;
        case 'meal':
            return <MealIcon color="#EBA914" />;
        case 'activity':
            return <ActivityIcon color="#22EFEF" />;
        case 'sleep':
            return <Ionicons name="moon" size={20} color="#3494D9" />;
    }
}

function getLogIcon(type: LogType) {
    switch (type) {
        case 'activity':
            return <ActivityIcon color="#878787" />;
        case 'meal':
            return <MealIcon color="#878787" />;
        case 'glucose':
            return <GlucoseIcon color="#878787" />;
    }
}

// Custom Icon Components
function GlucoseIcon({ color = '#E55D5D' }: { color?: string }) {
    return (
        <View style={iconStyles.container}>
            <Ionicons name="water" size={20} color={color} />
        </View>
    );
}

function MealIcon({ color = '#EBA914' }: { color?: string }) {
    return (
        <View style={iconStyles.container}>
            <Ionicons name="restaurant" size={18} color={color} />
        </View>
    );
}

function ActivityIcon({ color = '#22EFEF' }: { color?: string }) {
    return (
        <View style={iconStyles.container}>
            <Ionicons name="walk" size={20} color={color} />
        </View>
    );
}

function FilterIcon() {
    return (
        <View style={iconStyles.filterIcon}>
            <View style={iconStyles.filterLine}>
                <View style={[iconStyles.filterDot, { left: 2 }]} />
            </View>
            <View style={iconStyles.filterLine}>
                <View style={[iconStyles.filterDot, { right: 2 }]} />
            </View>
            <View style={iconStyles.filterLine}>
                <View style={[iconStyles.filterDot, { left: 4 }]} />
            </View>
        </View>
    );
}

const iconStyles = StyleSheet.create({
    container: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterIcon: {
        width: 16,
        height: 16,
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    filterLine: {
        width: 16,
        height: 2,
        backgroundColor: 'white',
        borderRadius: 1,
        position: 'relative',
    },
    filterDot: {
        position: 'absolute',
        width: 4,
        height: 4,
        backgroundColor: '#1a1b1c',
        borderRadius: 2,
        top: -1,
        borderWidth: 1,
        borderColor: 'white',
    },
});

// Tip Card Component
function TipCard({ data, onPress }: { data: TipCardData; onPress?: () => void }) {
    return (
        <TouchableOpacity activeOpacity={0.9} style={styles.tipCard} onPress={onPress}>
            <Image source={data.image} style={styles.tipCardImage} resizeMode="cover" />
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
                locations={[0, 0.5, 1]}
                style={styles.tipCardGradient}
            />
            <View style={styles.tipCardContent}>
                <View style={styles.tipCardHeader}>
                    {getCategoryIcon(data.category)}
                    <Text style={styles.tipCardTitle}>{data.title}</Text>
                </View>
                <Text style={styles.tipCardDescription} numberOfLines={3}>
                    {data.description}
                </Text>
                {data.articleUrl && (
                    <Text style={styles.tipCardReadMore}>Tap to read more →</Text>
                )}
            </View>
        </TouchableOpacity>
    );
}

// Log Entry Component
function LogEntryRow({ entry }: { entry: LogEntry }) {
    return (
        <TouchableOpacity activeOpacity={0.7} style={styles.logEntry}>
            <View style={styles.logEntryLeft}>
                <View style={styles.logIcon}>
                    {getLogIcon(entry.type)}
                </View>
                <View style={styles.logInfo}>
                    <Text style={styles.logLabel}>{entry.label}</Text>
                    <Text style={styles.logDescription}>{entry.description}</Text>
                </View>
            </View>
            <Text style={styles.logTime}>{entry.time}</Text>
        </TouchableOpacity>
    );
}

export default function LogScreen() {
    const { user } = useAuth();
    const glucoseUnit = useGlucoseUnit();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tipsData, setTipsData] = useState<TipCardData[]>(TIPS_DATA);
    const [tipsLoading, setTipsLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);

    // Filter options for the dropdown
    const filterOptions: { value: FilterType; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'meal', label: 'Meals' },
        { value: 'activity', label: 'Exercise' },
        { value: 'glucose', label: 'Glucose' },
    ];

    // Get the current filter label
    const currentFilterLabel = filterOptions.find(opt => opt.value === filter)?.label || 'All';

    // Filter logs based on selected filter
    const filteredLogs = filter === 'all'
        ? logs
        : logs.filter(log => log.type === filter);

    // Fetch logs and personalized tips when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            async function fetchLogs() {
                if (!user) {
                    setIsLoading(false);
                    return;
                }

                setIsLoading(true);
                try {
                    // Fetch glucose, activity, and meal logs in parallel
                    const [glucoseLogs, activityLogs, mealLogs] = await Promise.all([
                        getGlucoseLogs(user.id, 50),
                        getActivityLogs(user.id, 50),
                        getMeals(user.id, 50),
                    ]);

                    // Transform to unified format
                    const transformedGlucose = glucoseLogs.map(log => transformGlucoseLog(log, glucoseUnit));
                    const transformedActivity = activityLogs.map(transformActivityLog);
                    const transformedMeals = mealLogs.map(transformMealLog);

                    // Combine and sort by logged_at (most recent first)
                    const allLogs = [...transformedGlucose, ...transformedActivity, ...transformedMeals].sort(
                        (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
                    );

                    setLogs(allLogs);
                } catch (error) {
                    console.error('Error fetching logs:', error);
                } finally {
                    setIsLoading(false);
                }
            }

            async function fetchTips() {
                if (!user) {
                    setTipsLoading(false);
                    return;
                }

                setTipsLoading(true);
                try {
                    const result = await getPersonalizedTips(user.id);
                    if (result && result.tips.length > 0) {
                        // Map personalized tips to TipCardData format
                        const personalizedTips: TipCardData[] = result.tips.map(tip => ({
                            id: tip.id,
                            category: tip.category,
                            title: tip.title,
                            description: tip.description,
                            articleUrl: tip.articleUrl,
                            metric: tip.metric,
                            image: tip.category === 'glucose'
                                ? require('@/assets/images/glucose-tip-bg.png')
                                : tip.category === 'meal'
                                    ? require('@/assets/images/meal-tip-bg.png')
                                    : require('@/assets/images/activity-tip-bg.png'),
                        }));
                        setTipsData(personalizedTips);
                    }
                } catch (error) {
                    console.error('Error fetching personalized tips:', error);
                    // Keep default tips on error
                } finally {
                    setTipsLoading(false);
                }
            }

            fetchLogs();
            fetchTips();
        }, [user, glucoseUnit])
    );

    const handleTipPress = (tip: TipCardData) => {
        if (tip.articleUrl) {
            Linking.openURL(tip.articleUrl).catch(err => {
                console.error('Failed to open URL:', err);
            });
        }
    };

    return (
        <AnimatedScreen>
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
                        <Text style={styles.headerTitle}>LOGS</Text>
                    </View>

                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Tips Section */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.tipsScroll}
                            contentContainerStyle={styles.tipsContainer}
                            snapToInterval={TIP_CARD_WIDTH + 16}
                            decelerationRate="fast"
                        >
                            {tipsData.map((tip) => (
                                <TipCard key={tip.id} data={tip} onPress={() => handleTipPress(tip)} />
                            ))}
                        </ScrollView>

                        {/* Recent Logs Section */}
                        <View style={styles.logsSection}>
                            {/* Section Header */}
                            <View style={styles.logsSectionHeader}>
                                <Text style={styles.logsSectionTitle}>RECENT LOGS</Text>
                                <TouchableOpacity
                                    style={styles.filterButton}
                                    onPress={() => setShowFilterDropdown(true)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.filterText}>{currentFilterLabel}</Text>
                                    <Ionicons
                                        name="chevron-down"
                                        size={14}
                                        color="#878787"
                                    />
                                </TouchableOpacity>
                            </View>

                            {/* Logs List */}
                            <View style={styles.logsCard}>
                                {isLoading ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator size="small" color="#878787" />
                                        <Text style={styles.loadingText}>Loading logs...</Text>
                                    </View>
                                ) : logs.length === 0 ? (
                                    <View style={styles.emptyContainer}>
                                        <Ionicons name="document-text-outline" size={32} color="#878787" />
                                        <Text style={styles.emptyText}>No logs yet</Text>
                                        <Text style={styles.emptySubtext}>
                                            Start tracking your glucose and activities!
                                        </Text>
                                    </View>
                                ) : filteredLogs.length === 0 ? (
                                    <View style={styles.emptyContainer}>
                                        <Ionicons name="filter-outline" size={32} color="#878787" />
                                        <Text style={styles.emptyText}>No {currentFilterLabel.toLowerCase()} logs</Text>
                                        <Text style={styles.emptySubtext}>
                                            Try a different filter or log some {currentFilterLabel.toLowerCase()}.
                                        </Text>
                                    </View>
                                ) : (
                                    filteredLogs.map((entry, index) => (
                                        <React.Fragment key={entry.id}>
                                            <LogEntryRow entry={entry} />
                                            {index < filteredLogs.length - 1 && (
                                                <View style={styles.logDivider} />
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </View>
                        </View>

                    </ScrollView>
                </SafeAreaView>

                {/* shadcn-inspired Filter Modal */}
                <Modal
                    visible={showFilterDropdown}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowFilterDropdown(false)}
                >
                    <Pressable
                        style={styles.filterModalOverlay}
                        onPress={() => setShowFilterDropdown(false)}
                    >
                        <Pressable
                            style={styles.filterModalContent}
                            onPress={(e) => e.stopPropagation()}
                        >
                            <View style={styles.filterModalHeader}>
                                <Text style={styles.filterModalTitle}>Filter by</Text>
                                <Pressable
                                    onPress={() => setShowFilterDropdown(false)}
                                    style={styles.filterModalCloseBtn}
                                >
                                    <Ionicons name="close" size={20} color="#878787" />
                                </Pressable>
                            </View>
                            <View style={styles.filterModalDivider} />
                            {filterOptions.map((option, index) => (
                                <Pressable
                                    key={option.value}
                                    style={({ pressed }) => [
                                        styles.filterModalOption,
                                        pressed && styles.filterModalOptionPressed,
                                        index === filterOptions.length - 1 && styles.filterModalOptionLast,
                                    ]}
                                    onPress={() => {
                                        setFilter(option.value);
                                        setShowFilterDropdown(false);
                                    }}
                                >
                                    <View style={styles.filterModalOptionLeft}>
                                        <View style={styles.filterModalRadio}>
                                            {filter === option.value && (
                                                <View style={styles.filterModalRadioInner} />
                                            )}
                                        </View>
                                        <Text style={[
                                            styles.filterModalOptionText,
                                            filter === option.value && styles.filterModalOptionTextActive,
                                        ]}>
                                            {option.label}
                                        </Text>
                                    </View>
                                    {filter === option.value && (
                                        <Ionicons name="checkmark-circle" size={20} color="#3494D9" />
                                    )}
                                </Pressable>
                            ))}
                        </Pressable>
                    </Pressable>
                </Modal>
            </View>
        </AnimatedScreen>
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
        height: 200,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        color: Colors.textPrimary,
        letterSpacing: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: Platform.OS === 'ios' ? 170 : 150,
    },
    // Tips Section
    tipsScroll: {
        marginBottom: 32,
    },
    tipsContainer: {
        paddingHorizontal: 16,
        gap: 16,
    },
    tipCard: {
        width: TIP_CARD_WIDTH,
        height: TIP_CARD_HEIGHT,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    tipCardImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
    },
    tipCardGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    tipCardContent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        gap: 8,
    },
    tipCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    tipCardTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 18,
        color: Colors.textPrimary,
        lineHeight: 22,
    },
    tipCardDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 18,
    },
    tipCardMetric: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    tipCardReadMore: {
        fontFamily: fonts.medium,
        fontSize: 11,
        color: '#3494D9',
        marginTop: 8,
    },
    // Logs Section
    logsSection: {
        paddingHorizontal: 16,
    },
    logsSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    logsSectionTitle: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    filterText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    filterDropdown: {
        backgroundColor: '#2A2D30',
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
    },
    filterOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#3F4243',
    },
    filterOptionActive: {
        backgroundColor: 'rgba(52, 148, 217, 0.1)',
    },
    filterOptionText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#FFFFFF',
    },
    filterOptionTextActive: {
        color: '#3494D9',
    },
    logsCard: {
        backgroundColor: '#1a1b1c',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    logEntry: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 8,
    },
    logEntryLeft: {
        flexDirection: 'row',
        gap: 16,
        flex: 1,
    },
    logIcon: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logInfo: {
        flex: 1,
        gap: 8,
    },
    logLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: '#878787',
        lineHeight: 14 * 1.2,
    },
    logDescription: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textPrimary,
        lineHeight: 14 * 0.95,
    },
    logTime: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textPrimary,
        lineHeight: 12 * 1.2,
    },
    logDivider: {
        height: 16,
    },
    // Loading state styles
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        gap: 12,
    },
    loadingText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    // Empty state styles
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        gap: 8,
    },
    emptyText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
        marginTop: 8,
    },
    emptySubtext: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
        textAlign: 'center',
    },
    // shadcn-inspired Filter Modal styles
    filterModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    filterModalContent: {
        width: '100%',
        maxWidth: 320,
        backgroundColor: '#1a1b1c',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 16,
    },
    filterModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    filterModalTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
        letterSpacing: 0.3,
    },
    filterModalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterModalDivider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    filterModalOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    filterModalOptionPressed: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    filterModalOptionLast: {
        borderBottomWidth: 0,
    },
    filterModalOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    filterModalRadio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#3F4243',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterModalRadioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#3494D9',
    },
    filterModalOptionText: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: '#AAAAAA',
    },
    filterModalOptionTextActive: {
        color: '#FFFFFF',
    },
});
