/**
 * Meal Scanner Screen
 * Camera-first food scanning with multiple input options
 */

import { LiquidGlassIconButton } from '@/components/ui/LiquidGlassButton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { rankResults } from '@/lib/foodSearch';
import { parseLabelFromImage } from '@/lib/labelScan';
import { schedulePostMealActionReminder, schedulePostMealReviewNotification } from '@/lib/notifications';
import {
    analyzeMealPhotoWithRetry,
    FollowupQuestion,
    FollowupResponse,
    MealsFromPhotoResponse,
    toSelectedItems,
} from '@/lib/photoAnalysis';
import {
    addMealItems,
    AnalyzedItem,
    createMeal,
    CreateMealItemInput,
    deleteMeal,
    invokeMealPhotoAnalyze,
    NormalizedFood,
    searchFoodsWithVariants,
    uploadMealPhoto
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    LayoutAnimation,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import ReanimatedAnimated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnalysisResultsView from './components/scanner/AnalysisResultsView';
import FollowupQuestionView from './components/scanner/FollowupQuestionView';
import FoodSearchResultsView, { SelectedItem } from './components/scanner/FoodSearchResultsView';
// LabelScanResultsView removed - now using AnalysisResultsView for consistency
import ManualAddView from './components/scanner/ManualAddView';
import ScanningOverlay from './components/scanner/ScanningOverlay';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ScanMode = 'scan_food' | 'nutrition_label' | 'photo_album' | 'food_database' | 'manual_add';
type ScannerState = 'ready' | 'capturing' | 'analyzing' | 'error';

interface SelectedMealItem extends NormalizedFood {
    quantity: number;
    source: 'matched' | 'manual';
    originalText?: string;
}

const MAX_MATCH_CONCURRENCY = 4;

// Build a meal item from AI analysis
function buildAnalyzedItem(item: AnalyzedItem): SelectedMealItem {
    return {
        provider: 'fdc',
        external_id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        display_name: item.display_name || 'Unknown food',
        brand: 'AI estimate',
        serving_size: null,
        serving_unit: item.unit || 'serving',
        calories_kcal: item.nutrients?.calories_kcal ?? null,
        carbs_g: item.nutrients?.carbs_g ?? null,
        protein_g: item.nutrients?.protein_g ?? null,
        fat_g: item.nutrients?.fat_g ?? null,
        fibre_g: item.nutrients?.fibre_g ?? null,
        sugar_g: item.nutrients?.sugar_g ?? null,
        sodium_mg: item.nutrients?.sodium_mg ?? null,
        quantity: item.quantity || 1,
        source: 'matched',
        originalText: 'photo',
    };
}

// Match analyzed items to database foods
async function matchAnalyzedItem(item: AnalyzedItem): Promise<SelectedMealItem> {
    const query = item.display_name?.trim();
    if (!query) {
        return buildAnalyzedItem(item);
    }

    const results = await searchFoodsWithVariants(query, [], 15);
    if (!results.length) {
        return buildAnalyzedItem(item);
    }

    const ranked = rankResults(results, query);
    const best = ranked[0];

    if (!best) {
        return buildAnalyzedItem(item);
    }

    return {
        ...best,
        quantity: item.quantity || 1,
        serving_unit: best.serving_unit || item.unit || 'serving',
        source: 'matched',
        originalText: 'photo',
    };
}

async function matchAnalyzedItems(items: AnalyzedItem[]): Promise<SelectedMealItem[]> {
    const results: SelectedMealItem[] = new Array(items.length);
    let cursor = 0;

    const runWorker = async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await matchAnalyzedItem(items[index]);
        }
    };

    const workerCount = Math.min(MAX_MATCH_CONCURRENCY, items.length || 1);
    await Promise.all(Array.from({ length: workerCount }, runWorker));

    return results;
}

// Scan mode options
// Scan mode options - Reordered for better ergonomics (Scan in center)
const SCAN_OPTIONS: { mode: ScanMode; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { mode: 'photo_album', icon: 'images-outline', label: 'Upload' },
    { mode: 'food_database', icon: 'search-outline', label: 'Search' },
    { mode: 'scan_food', icon: 'restaurant', label: 'Scan' },      // Center
    { mode: 'nutrition_label', icon: 'barcode-outline', label: 'Label' },
    { mode: 'manual_add', icon: 'create-outline', label: 'Manual' },
];

// Constants for liquid glass option bar
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const OPTION_BAR_PADDING = 6;
const INDICATOR_SIZE = 56; // Circular indicator

// Animated Option Icon with bounce effect
function AnimatedOptionIcon({
    icon,
    focused,
    color,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    focused: boolean;
    color: string;
}) {
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);
    const didMountRef = useRef(false);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        if (focused) {
            scale.value = withSequence(
                withSpring(1.15, { damping: 16, stiffness: 600 }),
                withSpring(0.95, { damping: 18, stiffness: 500 }),
                withSpring(1, { damping: 20, stiffness: 400 })
            );
            translateY.value = withSequence(
                withSpring(-2, { damping: 16, stiffness: 600 }),
                withSpring(0.5, { damping: 18, stiffness: 500 }),
                withSpring(0, { damping: 20, stiffness: 400 })
            );
        } else {
            scale.value = withTiming(1, { duration: 100 });
            translateY.value = withTiming(0, { duration: 100 });
        }
    }, [focused, scale, translateY]);

    const iconStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: scale.value },
            { translateY: translateY.value },
        ],
    }));

    return (
        <ReanimatedAnimated.View style={iconStyle}>
            <Ionicons name={icon} size={22} color={color} />
        </ReanimatedAnimated.View>
    );
}

// Liquid Glass Option Bar Component
function LiquidGlassOptionBar({
    currentMode,
    onModeSelect,
    bottomInset,
    isFloating,
}: {
    currentMode: ScanMode;
    onModeSelect: (mode: ScanMode) => void;
    bottomInset: number;
    isFloating: boolean;
}) {
    const indicatorX = useSharedValue(0);
    const indicatorScaleX = useSharedValue(1);
    const indicatorScaleY = useSharedValue(1);
    const translateY = useSharedValue(0);
    const prevIndexRef = useRef(SCAN_OPTIONS.findIndex(o => o.mode === currentMode));

    // Calculate segment width based on option count
    const optionCount = SCAN_OPTIONS.length;
    const barWidth = SCREEN_WIDTH - 32; // 16px margin on each side
    const segmentWidth = barWidth / optionCount;

    // Current index
    const currentIndex = useMemo(() =>
        SCAN_OPTIONS.findIndex(o => o.mode === currentMode),
        [currentMode]
    );

    // Animate indicator position
    useEffect(() => {
        // Center the indicator on the button - buttons fill full bar width
        const targetX = segmentWidth * currentIndex + segmentWidth / 2 - INDICATOR_SIZE / 2;
        const distance = Math.abs(currentIndex - prevIndexRef.current);

        if (distance > 0) {
            // Liquid stretch effect
            indicatorScaleX.value = withSequence(
                withSpring(1.25 + distance * 0.08, { damping: 18, stiffness: 500 }),
                withSpring(0.92, { damping: 16, stiffness: 450 }),
                withSpring(1, { damping: 20, stiffness: 400 })
            );
            indicatorScaleY.value = withSequence(
                withSpring(0.78, { damping: 18, stiffness: 500 }),
                withSpring(1.06, { damping: 16, stiffness: 450 }),
                withSpring(1, { damping: 20, stiffness: 400 })
            );
        }

        indicatorX.value = withSpring(targetX, { damping: 18, stiffness: 180, mass: 0.8 });
        prevIndexRef.current = currentIndex;
    }, [currentIndex, segmentWidth, indicatorX, indicatorScaleX, indicatorScaleY]);

    // Animate vertical position for floating
    useEffect(() => {
        translateY.value = withSpring(isFloating ? -110 : 0, { damping: 20, stiffness: 200 });
    }, [isFloating, translateY]);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: indicatorX.value },
            { scaleX: indicatorScaleX.value },
            { scaleY: indicatorScaleY.value },
        ],
    }));



    const containerStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const handlePress = useCallback((mode: ScanMode) => {
        if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onModeSelect(mode);
    }, [onModeSelect]);

    return (
        <ReanimatedAnimated.View
            style={[
                styles.liquidOptionBarContainer,
                { paddingBottom: bottomInset + 20 },
                containerStyle
            ]}
        >
            <View style={styles.liquidOptionBar}>
                {/* Glass background */}
                <LinearGradient
                    colors={['rgba(40, 44, 48, 0.95)', 'rgba(30, 33, 36, 0.98)', 'rgba(35, 38, 41, 0.95)']}
                    locations={[0, 0.5, 1]}
                    style={styles.optionBarGradient}
                />

                {/* Inner highlight */}
                <View style={styles.optionBarInnerHighlight} />

                {/* Liquid glass indicator */}
                <ReanimatedAnimated.View style={[styles.liquidIndicator, indicatorStyle]}>
                    <LinearGradient
                        colors={['rgba(255, 255, 255, 0.22)', 'rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.15)']}
                        locations={[0, 0.5, 1]}
                        style={styles.liquidIndicatorGradient}
                    />
                </ReanimatedAnimated.View>

                {/* Option buttons */}
                {SCAN_OPTIONS.map((option) => {
                    const isActive = currentMode === option.mode;
                    return (
                        <Pressable
                            key={option.mode}
                            style={[styles.liquidOptionButton, { width: segmentWidth }]}
                            onPress={() => handlePress(option.mode)}
                        >
                            <View style={styles.liquidOptionContent}>
                                <AnimatedOptionIcon
                                    icon={option.icon}
                                    focused={isActive}
                                    color={isActive ? '#FFFFFF' : '#6B6B6B'}
                                />
                                <Text style={[
                                    styles.liquidOptionLabel,
                                    isActive && styles.liquidOptionLabelActive
                                ]}>
                                    {option.label}
                                </Text>
                            </View>
                        </Pressable>
                    );
                })}
            </View>
        </ReanimatedAnimated.View>
    );
}

export default function MealScannerScreen() {
    const insets = useSafeAreaInsets();
    const { user, profile } = useAuth();
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();

    const [scanMode, setScanMode] = useState<ScanMode>('scan_food');
    const [scannerState, setScannerState] = useState<ScannerState>('ready');
    const [flashMode, setFlashMode] = useState<FlashMode>('off');
    const [analysisStep, setAnalysisStep] = useState<string | null>(null);
    // labelScanResult state removed - now using analysisResult for label scans too
    const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<{
        items: SelectedMealItem[];
        imageUri?: string;
        photoPath?: string;
        followups?: FollowupQuestion[];
        photoQuality?: MealsFromPhotoResponse['photo_quality'];
    } | null>(null);
    const [pendingFollowups, setPendingFollowups] = useState<FollowupQuestion[]>([]);
    const [followupResponses, setFollowupResponses] = useState<FollowupResponse[]>([]);
    const [labelSubMode, setLabelSubMode] = useState<'barcode' | 'label'>('label');
    const [isCartModalOpen, setIsCartModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Macro overrides logic
    const [editMacrosOpen, setEditMacrosOpen] = useState(false);
    const [macroOverrides, setMacroOverrides] = useState<{
        calories?: number;
        carbs?: number;
        protein?: number;
        fat?: number;
        fibre?: number;
    }>({});

    // Reset overrides when result changes
    useEffect(() => {
        if (!analysisResult) {
            setMacroOverrides({});
        }
    }, [analysisResult]);

    // Track previous mode to revert if photo picker is cancelled
    const previousModeRef = useRef<ScanMode>('scan_food');

    // Derived state
    const showCaptureControls = !analysisResult && (scanMode === 'scan_food' || scanMode === 'nutrition_label');

    const handleBack = useCallback(() => {
        router.back();
    }, []);

    const toggleFlash = useCallback(() => {
        setFlashMode(prev => prev === 'off' ? 'on' : 'off');
    }, []);

    const analyzeImage = useCallback(async (imageUri: string, existingFollowupResponses?: FollowupResponse[]) => {
        if (!user) {
            router.push('/signin');
            return;
        }

        setScannerState('analyzing');
        setCapturedImageUri(imageUri); // Store for display during analysis
        setAnalysisStep('Uploading photo...');

        let photoPath: string | null = null;

        try {
            photoPath = await uploadMealPhoto(user.id, imageUri);
            if (!photoPath) {
                throw new Error('Photo upload failed. Please check your connection and try again.');
            }

            setAnalysisStep('Analyzing photo...');

            // Try the new endpoint first (FatSecret + USDA pipeline)
            const newResult = await analyzeMealPhotoWithRetry(user.id, photoPath, {
                followupResponses: existingFollowupResponses,
            });

            if (newResult.success) {
                const { data } = newResult;

                if (data.status === 'complete' || data.status === 'needs_followup') {
                    // Convert new API items to SelectedMealItem format
                    // Map nutrition_source to provider type for backward compatibility
                    const convertedItems: SelectedMealItem[] = toSelectedItems(data.items).map(item => ({
                        ...item,
                        // Map nutrition source to compatible provider type
                        provider: (item.provider === 'usda_fdc' ? 'fdc' : item.provider === 'fatsecret' ? 'fdc' : 'fdc') as 'fdc' | 'off',
                        source: 'matched' as const,
                        originalText: 'photo',
                    }));

                    // Show photo quality warning if needed
                    if (data.photo_quality?.is_blurry || data.photo_quality?.lighting_issue) {
                        console.log('[analyzeImage] Photo quality issues detected:', data.photo_quality);
                    }

                    // Show analysis results view
                    setAnalysisResult({
                        items: convertedItems,
                        imageUri: imageUri,
                        photoPath: photoPath,
                        followups: data.followups,
                        photoQuality: data.photo_quality,
                    });

                    // Store any pending followups
                    if (data.status === 'needs_followup' && data.followups?.length) {
                        setPendingFollowups(data.followups);
                    } else {
                        setPendingFollowups([]);
                    }

                    setScannerState('ready');
                    setAnalysisStep(null);
                    return;
                } else if (data.status === 'failed') {
                    // New endpoint returned failed, fall through to legacy
                    console.log('[analyzeImage] New endpoint returned failed status, trying legacy...');
                }
            } else {
                console.log('[analyzeImage] New endpoint error, trying legacy:', newResult.error);
            }

            // Fallback to legacy endpoint
            setAnalysisStep('Analyzing photo (fallback)...');
            const analysis = await invokeMealPhotoAnalyze(
                user.id,
                null,
                photoPath,
                new Date().toISOString(),
            );

            // Check if we got a valid response with items
            if (analysis?.status === 'complete' && analysis.items?.length) {
                setAnalysisStep('Matching foods...');
                const matchedItems = await matchAnalyzedItems(analysis.items);

                // Show analysis results view instead of navigating immediately
                setAnalysisResult({
                    items: matchedItems,
                    imageUri: imageUri,
                    photoPath: photoPath,
                });
                setScannerState('ready');
                setAnalysisStep(null);
                // Don't clear capturedImageUri - let the results view use it
            } else if (analysis === null) {
                // API call failed completely - offer retry or manual entry
                Alert.alert(
                    'Analysis Unavailable',
                    'Could not connect to the analysis service. You can try again or add items manually.',
                    [
                        { text: 'Retry', onPress: () => analyzeImage(imageUri) },
                        {
                            text: 'Add Manually',
                            onPress: () => {
                                setScannerState('ready');
                                setAnalysisStep(null);
                                setCapturedImageUri(null);
                                setScanMode('manual_add');
                            }
                        },
                    ]
                );
                setScannerState('ready');
                setAnalysisStep(null);
            } else {
                // Analysis returned but no items detected - offer options
                Alert.alert(
                    'No Food Detected',
                    'Could not identify food items in this photo. Try taking a clearer picture with better lighting, or add items manually.',
                    [
                        {
                            text: 'Retake Photo', onPress: () => {
                                setScannerState('ready');
                                setAnalysisStep(null);
                                setCapturedImageUri(null);
                            }
                        },
                        {
                            text: 'Search Database',
                            onPress: () => {
                                setScannerState('ready');
                                setAnalysisStep(null);
                                setCapturedImageUri(null);
                                setScanMode('food_database');
                            }
                        },
                        {
                            text: 'Add Manually',
                            onPress: () => {
                                setScannerState('ready');
                                setAnalysisStep(null);
                                setCapturedImageUri(null);
                                setScanMode('manual_add');
                            }
                        },
                    ]
                );
                setScannerState('ready');
                setAnalysisStep(null);
            }
        } catch (error) {
            console.error('Analysis error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
            // Show alert with helpful options
            Alert.alert(
                'Analysis Failed',
                errorMessage + '. You can try again or add items manually.',
                [
                    { text: 'Retry', onPress: () => analyzeImage(imageUri) },
                    {
                        text: 'Add Manually',
                        onPress: () => {
                            setScannerState('ready');
                            setAnalysisStep(null);
                            setCapturedImageUri(null);
                            setScanMode('manual_add');
                        }
                    },
                ]
            );
            setScannerState('ready');
            setAnalysisStep(null);
            setCapturedImageUri(null);
        }
    }, [user]);

    const pickFromLibrary = useCallback(async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;

        const result = await ImagePicker.launchImageLibraryAsync({
            quality: 0.8,
            allowsEditing: true,
            aspect: [4, 3],
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
            await analyzeImage(result.assets[0].uri);
        } else if (result.canceled) {
            // User cancelled, revert to previous mode
            setScanMode(previousModeRef.current);
        }
    }, [analyzeImage, user]);

    const handleModeSelect = useCallback((mode: ScanMode) => {
        // Trigger generic layout animation for smooth button resizing
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        // Update mode to trigger state change
        // Clear results when switching modes
        if (mode !== scanMode) {
            setAnalysisResult(null);
            setScannerState('ready');
        }

        // Key change: capture previous mode if we are switching TO photo_album
        if (mode === 'photo_album') {
            previousModeRef.current = scanMode;
        }

        setScanMode(mode);

        // Navigate directly for modes that open other screens
        if (mode === 'photo_album') {
            pickFromLibrary();
            return;
        }
    }, [pickFromLibrary, scanMode]);

    const scanLabel = useCallback(async (imageUri: string, base64?: string) => {
        if (!user) return;
        setScannerState('analyzing');
        setAnalysisStep('Reading label...');

        try {
            // Use base64 if available (faster for label parsing), otherwise uri
            // parseLabelFromImage expects base64 usually
            const result = await parseLabelFromImage(base64 || imageUri, { aiEnabled: profile?.ai_enabled ?? false });

            if (result.success && result.food) {
                // Convert label result to analysis result format for consistent UX
                const labelItem: SelectedMealItem = {
                    provider: 'fdc', // Use 'fdc' for type compatibility (label data is similar)
                    external_id: `label-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    display_name: result.food.display_name || result.parsed?.display_name || 'Scanned Item',
                    brand: result.food.brand || result.parsed?.brand || 'From label',
                    serving_size: result.parsed?.serving?.amount ?? null,
                    serving_unit: result.parsed?.serving?.unit || 'serving',
                    calories_kcal: result.food.calories_kcal ?? result.parsed?.per_serving?.calories ?? null,
                    carbs_g: result.food.carbs_g ?? result.parsed?.per_serving?.carbs_g ?? null,
                    protein_g: result.food.protein_g ?? result.parsed?.per_serving?.protein_g ?? null,
                    fat_g: result.food.fat_g ?? result.parsed?.per_serving?.fat_g ?? null,
                    fibre_g: result.food.fibre_g ?? result.parsed?.per_serving?.fibre_g ?? null,
                    sugar_g: result.food.sugar_g ?? result.parsed?.per_serving?.sugars_g ?? null,
                    sodium_mg: result.food.sodium_mg ?? result.parsed?.per_serving?.sodium_mg ?? null,
                    quantity: 1,
                    source: 'matched',
                    originalText: 'label',
                };
                setAnalysisResult({
                    items: [labelItem],
                    imageUri: undefined,
                    photoPath: undefined,
                });
            } else {
                Alert.alert('Scan Failed', result.error || 'Could not read label');
            }
        } catch (error) {
            console.error('Label scan error:', error);
            Alert.alert('Error', 'Failed to scan label');
        } finally {
            setScannerState('ready');
            setAnalysisStep(null);
        }
    }, [user, profile]);

    const handleCapture = useCallback(async () => {
        if (!cameraRef.current || scannerState !== 'ready') return;

        try {
            setScannerState('capturing');

            // Different capture options for different modes
            const isLabelMode = scanMode === 'nutrition_label';

            const photo = await cameraRef.current.takePictureAsync({
                base64: isLabelMode, // Require base64 for label scanning
                quality: 0.8,
                exif: false,
            });

            if (!photo?.uri) {
                throw new Error('Failed to capture photo');
            }

            if (isLabelMode) {
                await scanLabel(photo.uri, photo.base64);
            } else {
                await analyzeImage(photo.uri);
            }
        } catch (error) {
            console.error('Capture error:', error);
            setScannerState('ready');
        }
    }, [scannerState, analyzeImage, scanLabel, scanMode]);

    // Handle callbacks from child components
    const handleFoodSearchClose = useCallback(() => {
        router.dismissTo('/(tabs)');
    }, []);

    const handleFoodSearchSave = useCallback((items: SelectedItem[]) => {
        // Show AnalysisResultsView with selected items
        setAnalysisResult({
            items: items as SelectedMealItem[],
            imageUri: undefined,
            photoPath: undefined,
        });
    }, []);

    // handleLabelConfirm and handleLabelRetake removed - label scanning now uses AnalysisResultsView

    const handleManualAddSave = useCallback((item: SelectedItem) => {
        // Show AnalysisResultsView with manual item
        setAnalysisResult({
            items: [item] as SelectedMealItem[],
            imageUri: undefined,
            photoPath: undefined,
        });
    }, []);

    const handleManualAddClose = useCallback(() => {
        router.dismissTo('/(tabs)');
    }, []);

    // Analysis Results handlers
    const handleAnalysisReview = useCallback(() => {
        if (!analysisResult) return;
        setEditMacrosOpen(true);
    }, [analysisResult]);

    const handleAnalysisSave = useCallback(async (checkedSuggestions: { title: string; action_type: string }[]) => {
        if (!analysisResult || !user || isSaving) return;

        setIsSaving(true);

        try {
            // Upload photo if needed
            let photoUrl: string | null = analysisResult.photoPath || null;
            if (!photoUrl && analysisResult.imageUri) {
                photoUrl = await uploadMealPhoto(user.id, analysisResult.imageUri);
            }

            // Generate auto meal name from items
            const autoMealName = analysisResult.items
                .slice(0, 2)
                .map((item) => item.display_name?.trim())
                .filter(Boolean)
                .join(', ') || 'Meal';

            // Generate notes from checked suggestions
            const suggestionNotes = checkedSuggestions.length > 0
                ? `Committed to: ${checkedSuggestions.map(s => s.title).join(', ')}`
                : null;

            // Determine meal type based on time of day
            const now = new Date();
            const hour = now.getHours();
            let mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'snack';
            if (hour >= 5 && hour < 11) mealType = 'breakfast';
            else if (hour >= 11 && hour < 15) mealType = 'lunch';
            else if (hour >= 18 && hour < 22) mealType = 'dinner';

            // Create the meal
            const meal = await createMeal(user.id, {
                name: autoMealName,
                meal_type: mealType,
                logged_at: now.toISOString(),
                photo_path: photoUrl,
                notes: suggestionNotes,
            });

            if (!meal) {
                Alert.alert('Error', 'Failed to save meal. Please check your connection and try again.');
                return;
            }

            // Build meal items - distribute macro overrides proportionally across items
            const hasOverrides = macroOverrides.calories !== undefined ||
                macroOverrides.carbs !== undefined ||
                macroOverrides.protein !== undefined ||
                macroOverrides.fat !== undefined ||
                macroOverrides.fibre !== undefined;

            const mealItems: CreateMealItemInput[] = analysisResult.items.map((item) => {
                let nutrients = {
                    calories_kcal: item.calories_kcal,
                    carbs_g: item.carbs_g,
                    protein_g: item.protein_g,
                    fat_g: item.fat_g,
                    fibre_g: item.fibre_g,
                    sugar_g: item.sugar_g,
                    sodium_mg: item.sodium_mg,
                };

                // Only apply overrides for single-item meals to avoid inflating totals
                if (hasOverrides && analysisResult.items.length === 1) {
                    nutrients = {
                        ...nutrients,
                        calories_kcal: macroOverrides.calories ?? nutrients.calories_kcal,
                        carbs_g: macroOverrides.carbs ?? nutrients.carbs_g,
                        protein_g: macroOverrides.protein ?? nutrients.protein_g,
                        fat_g: macroOverrides.fat ?? nutrients.fat_g,
                        fibre_g: macroOverrides.fibre ?? nutrients.fibre_g,
                    };
                }

                return {
                    provider: item.provider || 'analyzed',
                    external_id: item.external_id || `analyzed_${Date.now()}_${Math.random()}`,
                    display_name: item.display_name,
                    brand: item.brand,
                    quantity: item.quantity || 1,
                    unit: 'serving',
                    serving_size: item.serving_size,
                    serving_unit: item.serving_unit,
                    nutrients,
                };
            });

            try {
                await addMealItems(user.id, meal.id, mealItems);
            } catch (itemError) {
                // Items failed to save - clean up the orphaned meal
                console.error('Failed to save meal items, cleaning up meal:', itemError);
                await deleteMeal(meal.id, user.id);
                Alert.alert(
                    'Save Failed',
                    'Could not save meal items. Please try again.',
                    [{ text: 'OK' }]
                );
                return;
            }

            // Schedule post-meal check-in notification (1 hour from now)
            const checkInTime = new Date(Date.now() + 60 * 60 * 1000);
            await schedulePostMealReviewNotification(meal.id, meal.name, checkInTime, user.id).catch(() => {
                // Non-critical - don't fail the save if notification scheduling fails
            });
            await schedulePostMealActionReminder(meal.id, meal.name, user.id).catch(() => {
                // Non-critical - don't fail the save if notification scheduling fails
            });

            // Clear state and navigate back
            setAnalysisResult(null);
            setCapturedImageUri(null);
            setMacroOverrides({ calories: undefined, carbs: undefined, protein: undefined, fibre: undefined, fat: undefined });

            const successMsg = checkedSuggestions.length > 0
                ? `${autoMealName} has been logged! Remember: ${checkedSuggestions[0].title}`
                : `${autoMealName} has been logged successfully!`;

            Alert.alert('Meal Logged', successMsg, [
                { text: 'OK', onPress: () => router.dismissTo('/(tabs)') }
            ]);
        } catch (error) {
            console.error('Save meal error:', error);
            Alert.alert('Error', 'Failed to save meal. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }, [analysisResult, user, macroOverrides, isSaving]);

    const handleAnalysisClose = useCallback(() => {
        setAnalysisResult(null);
        setCapturedImageUri(null);
        setPendingFollowups([]);
        setFollowupResponses([]);
    }, []);

    // Handle followup question completion
    const handleFollowupComplete = useCallback(async (responses: FollowupResponse[]) => {
        if (!analysisResult?.photoPath || !capturedImageUri) return;

        setFollowupResponses(responses);
        setPendingFollowups([]);

        // Re-analyze with followup responses to get updated items
        await analyzeImage(capturedImageUri, responses);
    }, [analysisResult?.photoPath, capturedImageUri, analyzeImage]);

    // Handle skipping followups
    const handleFollowupSkip = useCallback(() => {
        setPendingFollowups([]);
    }, []);

    // Loading permission state
    if (!permission) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={Colors.buttonPrimary} />
            </View>
        );
    }

    // Permission not granted
    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <View style={[styles.permissionContainer, { paddingTop: insets.top }]}>
                    <Ionicons name="camera-outline" size={64} color={Colors.textTertiary} />
                    <Text style={styles.permissionTitle}>Camera Access Required</Text>
                    <Text style={styles.permissionText}>
                        We need camera access to scan and log your meals.
                    </Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                        <Text style={styles.permissionButtonText}>Grant Access</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelButton} onPress={handleBack}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // AI not enabled
    if (!profile?.ai_enabled) {
        return (
            <View style={styles.container}>
                <View style={[styles.permissionContainer, { paddingTop: insets.top }]}>
                    <Ionicons name="sparkles-outline" size={64} color={Colors.textTertiary} />
                    <Text style={styles.permissionTitle}>AI Insights Disabled</Text>
                    <Text style={styles.permissionText}>
                        Enable AI insights in Privacy settings to scan food.
                    </Text>
                    <TouchableOpacity
                        style={styles.permissionButton}
                        onPress={() => router.push('/account-privacy')}
                    >
                        <Text style={styles.permissionButtonText}>Open Privacy Settings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelButton} onPress={handleBack}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // showCaptureControls moved up

    return (
        <View style={styles.container}>
            {/* Camera View - Background */}
            <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                flash={flashMode}
            />

            {/* UI Layer */}
            <View style={{ flex: 1, zIndex: 1 }}>
                {/* Header */}
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <LiquidGlassIconButton size={44} onPress={handleBack}>
                        <Ionicons name="chevron-back" size={22} color="#E7E8E9" />
                    </LiquidGlassIconButton>
                    <Text style={styles.headerTitle}>LOG MEAL</Text>
                    <View style={styles.headerButtonSpacer} />
                </View>

                {/* Overlays - Absolute Fill */}
                {/* LabelScanResultsView removed - label scans now use AnalysisResultsView below */}

                {/* 2. Food Search View */}
                {scanMode === 'food_database' && (
                    <View style={styles.overlayContainer}>
                        <FoodSearchResultsView
                            onClose={handleFoodSearchClose}
                            onSave={handleFoodSearchSave}
                            onScanBarcode={() => handleModeSelect('nutrition_label')}
                            onCartModalChange={setIsCartModalOpen}
                        />
                    </View>
                )}

                {/* 3. Manual Add View */}
                {scanMode === 'manual_add' && (
                    <View style={styles.overlayContainer}>
                        <ManualAddView
                            onClose={handleManualAddClose}
                            onSave={handleManualAddSave}
                        />
                    </View>
                )}

                {/* Targeting Frame - Only show if NO results and NOT searching */}
                {!analysisResult && scanMode !== 'food_database' && scanMode !== 'manual_add' && scanMode !== 'photo_album' ? (
                    <View style={styles.frameContainer}>
                        <View style={[
                            styles.targetFrame,
                            scanMode === 'nutrition_label' && styles.targetFrameLabel
                        ]}>
                            <View style={[styles.corner, styles.cornerTopLeft]} />
                            <View style={[styles.corner, styles.cornerTopRight]} />
                            <View style={[styles.corner, styles.cornerBottomLeft]} />
                            <View style={[styles.corner, styles.cornerBottomRight]} />
                        </View>
                        {scanMode === 'nutrition_label' && (
                            <Text style={styles.frameText}>Position label within frame</Text>
                        )}
                    </View>
                ) : (
                    // Spacer to keep layout consistent when frame is hidden
                    <View style={{ flex: 1 }} />
                )}

                {/* Liquid Glass Option Bar - Hide during analysis or when cart modal is open */}
                {scannerState === 'ready' && !isCartModalOpen && (
                    <LiquidGlassOptionBar
                        currentMode={scanMode}
                        onModeSelect={handleModeSelect}
                        bottomInset={insets.bottom}
                        isFloating={showCaptureControls}
                    />
                )}

                {/* Capture Controls - Hide in non-camera modes AND during analysis */}
                {showCaptureControls && scannerState === 'ready' && (
                    <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
                        <TouchableOpacity
                            style={styles.flashButton}
                            onPress={toggleFlash}
                        >
                            <Ionicons
                                name={flashMode === 'on' ? 'flash' : 'flash-off'}
                                size={24}
                                color="#FFFFFF"
                            />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.captureButton}
                            onPress={handleCapture}
                            disabled={scannerState !== 'ready'}
                        >
                            <View style={styles.captureButtonInner} />
                        </TouchableOpacity>

                        <View style={styles.controlPlaceholder} />
                    </View>
                )}
            </View>

            {/* Analyzing Overlay with Photo and Scan Animation */}
            {scannerState !== 'ready' && capturedImageUri && (
                <ScanningOverlay
                    imageUri={capturedImageUri}
                    statusText={analysisStep || 'Processing...'}
                />
            )}
            {/* Fallback for non-photo analysis states */}
            {scannerState !== 'ready' && !capturedImageUri && (
                <View style={styles.analyzeOverlay}>
                    <ActivityIndicator size="large" color={Colors.buttonPrimary} />
                    <Text style={styles.analyzeText}>{analysisStep || 'Processing...'}</Text>
                </View>
            )}

            {/* Analysis Results View - Full screen overlay */}
            {analysisResult && (
                <View style={styles.overlayContainer}>
                    <AnalysisResultsView
                        imageUri={analysisResult.imageUri}
                        items={analysisResult.items}
                        onReview={handleAnalysisReview}
                        onSave={handleAnalysisSave}
                        onClose={handleAnalysisClose}
                        macroOverrides={macroOverrides}
                        isSaving={isSaving}
                        followupComponent={pendingFollowups.length > 0 ? (
                            <FollowupQuestionView
                                questions={pendingFollowups}
                                onComplete={handleFollowupComplete}
                                onSkip={handleFollowupSkip}
                                title="Quick Confirmation"
                            />
                        ) : undefined}
                        photoQualityWarning={
                            analysisResult.photoQuality?.is_blurry
                                ? 'Photo appears blurry. Results may be less accurate.'
                                : analysisResult.photoQuality?.lighting_issue
                                    ? 'Poor lighting detected. Results may be less accurate.'
                                    : undefined
                        }
                    />
                </View>
            )}

            {/* Edit Macros Sheet */}
            <Sheet open={editMacrosOpen} onOpenChange={setEditMacrosOpen}>
                <SheetContent style={styles.macroSheet}>
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Edit Macros</Text>
                        <Pressable onPress={() => setEditMacrosOpen(false)}>
                            <Ionicons name="close" size={24} color="#FFFFFF" />
                        </Pressable>
                    </View>

                    <View style={styles.macroInputGrid}>
                        <View style={[styles.macroInputItem, { width: '100%' }]}>
                            <Text style={styles.macroInputLabel}>Calories (kcal)</Text>
                            <TextInput
                                value={macroOverrides.calories?.toString() ?? ''}
                                onChangeText={(text) => {
                                    const trimmed = text.trim();
                                    const parsed = trimmed === '' ? undefined : Number(trimmed);
                                    setMacroOverrides(p => ({ ...p, calories: parsed !== undefined && !isNaN(parsed) && parsed >= 0 ? parsed : undefined }));
                                }}
                                placeholder="0"
                                placeholderTextColor="#6F6F6F"
                                keyboardType="number-pad"
                                style={styles.macroInput}
                            />
                        </View>
                        <View style={styles.macroInputItem}>
                            <Text style={styles.macroInputLabel}>Carbs (g)</Text>
                            <TextInput
                                value={macroOverrides.carbs?.toString() ?? ''}
                                onChangeText={(text) => {
                                    const trimmed = text.trim();
                                    const parsed = trimmed === '' ? undefined : Number(trimmed);
                                    setMacroOverrides(p => ({ ...p, carbs: parsed !== undefined && !isNaN(parsed) && parsed >= 0 ? parsed : undefined }));
                                }}
                                placeholder="0"
                                placeholderTextColor="#6F6F6F"
                                keyboardType="number-pad"
                                style={styles.macroInput}
                            />
                        </View>
                        <View style={styles.macroInputItem}>
                            <Text style={styles.macroInputLabel}>Protein (g)</Text>
                            <TextInput
                                value={macroOverrides.protein?.toString() ?? ''}
                                onChangeText={(text) => {
                                    const trimmed = text.trim();
                                    const parsed = trimmed === '' ? undefined : Number(trimmed);
                                    setMacroOverrides(p => ({ ...p, protein: parsed !== undefined && !isNaN(parsed) && parsed >= 0 ? parsed : undefined }));
                                }}
                                placeholder="0"
                                placeholderTextColor="#6F6F6F"
                                keyboardType="number-pad"
                                style={styles.macroInput}
                            />
                        </View>
                        <View style={styles.macroInputItem}>
                            <Text style={styles.macroInputLabel}>Fiber (g)</Text>
                            <TextInput
                                value={macroOverrides.fibre?.toString() ?? ''}
                                onChangeText={(text) => {
                                    const trimmed = text.trim();
                                    const parsed = trimmed === '' ? undefined : Number(trimmed);
                                    setMacroOverrides(p => ({ ...p, fibre: parsed !== undefined && !isNaN(parsed) && parsed >= 0 ? parsed : undefined }));
                                }}
                                placeholder="0"
                                placeholderTextColor="#6F6F6F"
                                keyboardType="number-pad"
                                style={styles.macroInput}
                            />
                        </View>
                        <View style={styles.macroInputItem}>
                            <Text style={styles.macroInputLabel}>Fat (g)</Text>
                            <TextInput
                                value={macroOverrides.fat?.toString() ?? ''}
                                onChangeText={(text) => {
                                    const trimmed = text.trim();
                                    const parsed = trimmed === '' ? undefined : Number(trimmed);
                                    setMacroOverrides(p => ({ ...p, fat: parsed !== undefined && !isNaN(parsed) && parsed >= 0 ? parsed : undefined }));
                                }}
                                placeholder="0"
                                placeholderTextColor="#6F6F6F"
                                keyboardType="number-pad"
                                style={styles.macroInput}
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.saveMacrosButton}
                        onPress={() => setEditMacrosOpen(false)}
                    >
                        <Text style={styles.saveMacrosText}>Done</Text>
                    </TouchableOpacity>
                </SheetContent>
            </Sheet>
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    camera: {
        ...StyleSheet.absoluteFillObject,
    },

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    headerButton: {
        width: 48,
        height: 48,
        borderRadius: 33,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(63,66,67,0.3)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
    },
    headerButtonPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.97 }],
    },
    headerButtonSpacer: {
        width: 48,
        height: 48,
    },
    headerTitle: {
        fontFamily: fonts.bold,
        fontSize: 18,
        letterSpacing: 1,
        color: Colors.textPrimary,
    },

    // Label/Barcode Toggle
    labelToggleContainer: {
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        marginTop: 8,
    },
    labelToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(80, 80, 80, 0.9)',
        borderRadius: 20,
        padding: 3,
    },
    labelToggleButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 17,
    },
    labelToggleButtonActive: {
        backgroundColor: 'rgba(160, 160, 160, 0.9)',
    },
    labelToggleText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    labelToggleTextActive: {
        color: '#FFFFFF',
    },

    // Permission screens
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    permissionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#E7E8E9',
        marginTop: 16,
    },
    permissionText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textTertiary,
        textAlign: 'center',
        marginTop: 8,
    },
    permissionButton: {
        backgroundColor: Colors.buttonPrimary,
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 24,
    },
    permissionButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    cancelButton: {
        marginTop: 16,
        padding: 12,
    },
    cancelButtonText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.textTertiary,
    },

    // Targeting frame
    frameContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    targetFrame: {
        width: 280,
        height: 280,
        position: 'relative',
    },
    targetFrameLabel: {
        width: '70%',
        height: '60%',
    },
    frameText: {
        marginTop: 20,
        color: '#FFFFFF',
        fontFamily: fonts.regular,
        fontSize: 16,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10,
    },
    corner: {
        position: 'absolute',
        width: 48,
        height: 48,
        borderColor: '#FFFFFF',
        borderWidth: 3,
    },
    cornerTopLeft: {
        top: 0,
        left: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderTopLeftRadius: 12,
    },
    cornerTopRight: {
        top: 0,
        right: 0,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
        borderTopRightRadius: 12,
    },
    cornerBottomLeft: {
        bottom: 0,
        left: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderBottomLeftRadius: 12,
    },
    cornerBottomRight: {
        bottom: 0,
        right: 0,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderBottomRightRadius: 12,
    },

    // Liquid Glass Option Bar
    liquidOptionBarContainer: {
        alignItems: 'center',
        paddingHorizontal: 16,
        zIndex: 20,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    liquidOptionBar: {
        flexDirection: 'row',
        borderRadius: 32,
        height: 72,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    optionBarGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 32,
    },
    optionBarInnerHighlight: {
        position: 'absolute',
        top: 1,
        left: 1,
        right: 1,
        bottom: 1,
        borderRadius: 31,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    liquidIndicator: {
        position: 'absolute',
        top: (72 - INDICATOR_SIZE) / 2,
        width: INDICATOR_SIZE,
        height: INDICATOR_SIZE,
        borderRadius: INDICATOR_SIZE / 2, // Fully circular
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.18)',
    },
    liquidIndicatorGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: INDICATOR_SIZE / 2,
    },
    liquidOptionButton: {
        height: 72,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    liquidOptionContent: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    liquidOptionLabel: {
        fontFamily: fonts.medium,
        fontSize: 10,
        color: '#6B6B6B',
    },
    liquidOptionLabelActive: {
        color: '#FFFFFF',
        fontFamily: fonts.semiBold,
    },

    // Controls
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 40,
        backgroundColor: 'transparent', // Transparent background as requested
        paddingTop: 20,
    },
    flashButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureButton: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureButtonInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFFFFF',
        borderWidth: 3,
        borderColor: '#111111',
    },
    controlPlaceholder: {
        width: 50,
    },

    // Analyzing overlay
    analyzeOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    analyzeText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: '#FFFFFF',
    },
    // Macro Sheet Styles
    macroSheet: {
        padding: 20,
        backgroundColor: Colors.backgroundCard,
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    sheetTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#FFFFFF',
    },
    macroInputGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 24,
    },
    macroInputItem: {
        width: '47%', // 2 per row
    },
    macroInputLabel: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    macroInput: {
        backgroundColor: '#2C2C2E',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: '#FFFFFF',
        fontFamily: fonts.semiBold,
        fontSize: 16,
    },
    saveMacrosButton: {
        backgroundColor: '#285E2A',
        borderWidth: 1,
        borderColor: '#448D47',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveMacrosText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
