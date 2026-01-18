/**
 * Meal Scanner Screen
 * Camera-first food scanning with multiple input options
 */

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { rankResults } from '@/lib/foodSearch';
import { LabelScanResult, parseLabelFromImage } from '@/lib/labelScan';
import {
    AnalyzedItem,
    invokeMealPhotoAnalyze,
    NormalizedFood,
    searchFoodsWithVariants,
    uploadMealPhoto,
} from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    LayoutAnimation,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnalysisResultsView from './components/scanner/AnalysisResultsView';
import FoodSearchResultsView, { SelectedItem } from './components/scanner/FoodSearchResultsView';
import LabelScanResultsView from './components/scanner/LabelScanResultsView';
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

export default function MealScannerScreen() {
    const insets = useSafeAreaInsets();
    const { user, profile } = useAuth();
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();

    const [scanMode, setScanMode] = useState<ScanMode>('scan_food');
    const [scannerState, setScannerState] = useState<ScannerState>('ready');
    const [flashMode, setFlashMode] = useState<FlashMode>('off');
    const [analysisStep, setAnalysisStep] = useState<string | null>(null);
    const [labelScanResult, setLabelScanResult] = useState<LabelScanResult | null>(null);
    const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<{
        items: SelectedMealItem[];
        imageUri: string;
        photoPath: string;
    } | null>(null);
    const [labelSubMode, setLabelSubMode] = useState<'barcode' | 'label'>('label');

    // Track previous mode to revert if photo picker is cancelled
    const previousModeRef = useRef<ScanMode>('scan_food');

    // Derived state
    const showCaptureControls = !labelScanResult && (scanMode === 'scan_food' || scanMode === 'nutrition_label');

    // Animation for sliding bubble
    const bubbleAnim = useRef(new Animated.Value(0)).current;
    const bubbleWidthAnim = useRef(new Animated.Value(0)).current;
    const optionLayouts = useRef<{ [key in ScanMode]?: { x: number; width: number } }>({});

    // Animation for vertical dock movement
    const dockAnim = useRef(new Animated.Value(0)).current; // 0 = Bottom (Docked), 1 = Up (Floating)

    // Animate bubble when mode changes
    useEffect(() => {
        const layout = optionLayouts.current[scanMode];
        if (layout) {
            Animated.parallel([
                Animated.timing(bubbleAnim, {
                    toValue: layout.x,
                    useNativeDriver: false,
                    duration: 300,
                    easing: Easing.out(Easing.cubic),
                }),
                Animated.timing(bubbleWidthAnim, {
                    toValue: layout.width,
                    useNativeDriver: false,
                    duration: 300,
                    easing: Easing.out(Easing.cubic),
                }),
            ]).start();
        }
    }, [scanMode]);

    // Animate dock vertical position based on capture controls visibility
    useEffect(() => {
        Animated.timing(dockAnim, {
            toValue: showCaptureControls ? 1 : 0,
            duration: 300,
            useNativeDriver: false, // transforming layout properties
            easing: Easing.out(Easing.cubic),
        }).start();
    }, [showCaptureControls]);


    // Animation - Removed complex sliding bubble for a simpler, custom design
    const handleBack = useCallback(() => {
        router.back();
    }, []);

    const toggleFlash = useCallback(() => {
        setFlashMode(prev => prev === 'off' ? 'on' : 'off');
    }, []);

    const analyzeImage = useCallback(async (imageUri: string) => {
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
                throw new Error('Upload failed');
            }

            setAnalysisStep('Analyzing photo...');
            const analysis = await invokeMealPhotoAnalyze(
                user.id,
                null,
                photoPath,
                new Date().toISOString(),
            );

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
            } else {
                // No items detected - show alert and return to scanner
                Alert.alert(
                    'Analysis Failed',
                    'Could not detect any food items. Try taking a clearer picture.',
                    [{ text: 'Retry', onPress: () => { } }]
                );
                setScannerState('ready');
                setAnalysisStep(null);
                setCapturedImageUri(null);
            }
        } catch (error) {
            console.error('Analysis error:', error);
            // Show alert and return to scanner for retry
            Alert.alert(
                'Analysis Failed',
                'Something went wrong. Please try taking another picture.',
                [{ text: 'Retry', onPress: () => { } }]
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
            setLabelScanResult(null);
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

            if (result.success && result.parsed) {
                setLabelScanResult(result);
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
        // Navigate to review with selected items
        router.push({
            pathname: '/log-meal-review',
            params: {
                items: JSON.stringify(items),
                mealTime: new Date().toISOString(),
            },
        });
    }, []);

    const handleLabelConfirm = useCallback(() => {
        if (!labelScanResult?.food) return;
        // Navigate to review
        router.push({
            pathname: '/log-meal-review',
            params: {
                items: JSON.stringify([{ ...labelScanResult.food, quantity: 1 }]),
                mealTime: new Date().toISOString(),
            },
        });
    }, [labelScanResult]);

    const handleLabelRetake = useCallback(() => {
        setLabelScanResult(null);
        setScannerState('ready');
        setLabelScanResult(null);
        setScannerState('ready');
    }, []);

    const handleManualAddSave = useCallback((item: SelectedItem) => {
        router.push({
            pathname: '/log-meal-review',
            params: {
                items: JSON.stringify([item]),
                mealTime: new Date().toISOString(),
            },
        });
    }, []);

    const handleManualAddClose = useCallback(() => {
        router.dismissTo('/(tabs)');
    }, []);

    // Analysis Results handlers
    const handleAnalysisReview = useCallback(() => {
        if (!analysisResult) return;
        router.push({
            pathname: '/log-meal-review',
            params: {
                items: JSON.stringify(analysisResult.items),
                mealName: '',
                mealNotes: '',
                imageUri: analysisResult.imageUri,
                photoPath: analysisResult.photoPath,
                mealTime: new Date().toISOString(),
            },
        });
        setAnalysisResult(null);
        setCapturedImageUri(null);
    }, [analysisResult]);

    const handleAnalysisSave = useCallback(async () => {
        if (!analysisResult || !user) return;
        // Quick save - go directly to review and auto-confirm
        router.push({
            pathname: '/log-meal-review',
            params: {
                items: JSON.stringify(analysisResult.items),
                mealName: '',
                mealNotes: '',
                imageUri: analysisResult.imageUri,
                photoPath: analysisResult.photoPath,
                mealTime: new Date().toISOString(),
                autoSave: 'true',
            },
        });
        setAnalysisResult(null);
        setCapturedImageUri(null);
    }, [analysisResult, user]);

    const handleAnalysisClose = useCallback(() => {
        setAnalysisResult(null);
        setCapturedImageUri(null);
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
                <LinearGradient
                    colors={['#1E3A5F', '#111111', '#111111']}
                    style={styles.backgroundGradient}
                />
                <View style={[styles.permissionContainer, { paddingTop: insets.top }]}>
                    <Ionicons name="camera-outline" size={64} color="#878787" />
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
                <LinearGradient
                    colors={['#1E3A5F', '#111111', '#111111']}
                    style={styles.backgroundGradient}
                />
                <View style={[styles.permissionContainer, { paddingTop: insets.top }]}>
                    <Ionicons name="sparkles-outline" size={64} color="#878787" />
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
                    <Pressable
                        onPress={handleBack}
                        style={({ pressed }) => [
                            styles.headerButton,
                            pressed && styles.headerButtonPressed,
                        ]}
                    >
                        <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                    </Pressable>
                    <Text style={styles.headerTitle}>LOG MEAL</Text>
                    <View style={styles.headerButtonSpacer} />
                </View>

                {/* Overlays - Absolute Fill */}
                {labelScanResult && (
                    <View style={styles.overlayContainer}>
                        <LabelScanResultsView
                            scanResult={labelScanResult}
                            onConfirm={handleLabelConfirm}
                            onRetake={handleLabelRetake}
                        />
                    </View>
                )}

                {/* 2. Food Search View */}
                {scanMode === 'food_database' && (
                    <View style={styles.overlayContainer}>
                        <FoodSearchResultsView
                            onClose={handleFoodSearchClose}
                            onSave={handleFoodSearchSave}
                            onScanBarcode={() => handleModeSelect('nutrition_label')}
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
                {!labelScanResult && scanMode !== 'food_database' && scanMode !== 'manual_add' && scanMode !== 'photo_album' ? (
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

                {/* Option Pill Bar - Hide during analysis */}
                {scannerState === 'ready' && (
                    <Animated.View style={[
                        styles.optionBarContainer,
                        { paddingBottom: insets.bottom + 20 },
                        {
                            transform: [{
                                translateY: dockAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, -110] // Move UP by 110px when floating
                                })
                            }]
                        }
                    ]}>
                        <View style={styles.optionBar}>
                            {/* Animated Pill Background */}
                            <Animated.View
                                style={[
                                    styles.slidingPill,
                                    {
                                        transform: [{ translateX: bubbleAnim }],
                                        width: bubbleWidthAnim,
                                    },
                                ]}
                            />
                            {SCAN_OPTIONS.map((option) => {
                                const isActive = scanMode === option.mode;
                                return (
                                    <TouchableOpacity
                                        key={option.mode}
                                        style={styles.optionButton}
                                        onPress={() => handleModeSelect(option.mode)}
                                        activeOpacity={0.7}
                                        onLayout={(event) => {
                                            const { x, width } = event.nativeEvent.layout;
                                            optionLayouts.current[option.mode] = { x, width };

                                            // Initial measurements - set without animation if it matches current mode
                                            // Using setValue is safe for initial render
                                            if (isActive) {
                                                bubbleAnim.setValue(x);
                                                bubbleWidthAnim.setValue(width);
                                            }
                                        }}
                                    >
                                        <View style={[
                                            styles.iconContainer,
                                            // Removed iconContainerActive as we fill the whole button now
                                        ]}>
                                            <Ionicons
                                                name={option.icon}
                                                size={20}
                                                color={isActive ? '#000000' : '#878787'}
                                            />
                                        </View>
                                        <Text style={[
                                            styles.optionLabel,
                                            isActive && styles.optionLabelActive
                                        ]}>
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Animated.View>
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

            {/* Analysis Results View */}
            {analysisResult && (
                <AnalysisResultsView
                    imageUri={analysisResult.imageUri}
                    items={analysisResult.items}
                    onReview={handleAnalysisReview}
                    onSave={handleAnalysisSave}
                    onClose={handleAnalysisClose}
                />
            )}
        </View >
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
        height: 300,
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
        color: '#878787',
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
        color: '#878787',
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

    // Option bar
    optionBarContainer: {
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 20,
        zIndex: 20,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    optionBar: {
        flexDirection: 'row',
        backgroundColor: '#1E1E1E',
        borderRadius: 40, // Fully rounded
        padding: 4,
        gap: 4,
        borderWidth: 1,
        borderColor: '#333333',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    optionButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 30, // Fully rounded
        minWidth: 60,
        gap: 4,
        zIndex: 2, // Above pill
    },
    // optionButtonActive removed - layout handled by slidingPill
    slidingPill: {
        position: 'absolute',
        top: 4, // Matches padding of container (4)
        bottom: 4,
        backgroundColor: '#FFFFFF',
        borderRadius: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        zIndex: 1, // Behind text/icons
    },
    iconContainer: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionLabel: {
        fontFamily: fonts.medium,
        fontSize: 10,
        color: '#878787',
    },
    optionLabelActive: {
        color: '#000000', // Inverse text for white bg
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
});
