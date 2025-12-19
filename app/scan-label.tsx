/**
 * Scan Nutrition Label Screen
 * Camera-based nutrition label scanning with Gemini Vision parsing
 */

import { fonts } from '@/hooks/useFonts';
import {
    formatServingDescription,
    isValidParsedLabel,
    LabelScanResult,
    parseLabelFromImage
} from '@/lib/labelScan';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScanState = 'ready' | 'capturing' | 'analyzing' | 'results' | 'error';

export default function ScanLabelScreen() {
    const params = useLocalSearchParams();
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();

    const [scanState, setScanState] = useState<ScanState>('ready');
    const [scanResult, setScanResult] = useState<LabelScanResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [errorDetail, setErrorDetail] = useState<string>('');

    // Request camera permission
    if (!permission) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#3494D9" />
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#1E3A5F', '#111111', '#111111']}
                    style={styles.backgroundGradient}
                />
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.permissionContainer}>
                        <Ionicons name="camera-outline" size={64} color="#878787" />
                        <Text style={styles.permissionTitle}>Camera Access Required</Text>
                        <Text style={styles.permissionText}>
                            We need camera access to scan nutrition labels.
                        </Text>
                        <TouchableOpacity
                            style={styles.permissionButton}
                            onPress={requestPermission}
                        >
                            <Text style={styles.permissionButtonText}>Grant Access</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => router.back()}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    const handleCapture = async () => {
        if (!cameraRef.current || scanState !== 'ready') return;

        try {
            setScanState('capturing');

            const photo = await cameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.8,
                exif: false,
            });

            if (!photo?.base64) {
                throw new Error('Failed to capture photo');
            }

            setScanState('analyzing');

            const result = await parseLabelFromImage(photo.base64);

            if (result.success && result.parsed) {
                setScanResult(result);
                setScanState('results');
            } else {
                setErrorMessage(result.error || 'Could not read the label');
                setErrorDetail(result.errorDetail || 'Try better lighting or flatten the package');
                setScanState('error');
            }
        } catch (error) {
            console.error('Capture error:', error);
            setErrorMessage('Failed to capture photo');
            setErrorDetail('Please try again');
            setScanState('error');
        }
    };

    const handleRetry = () => {
        setScanResult(null);
        setErrorMessage('');
        setErrorDetail('');
        setScanState('ready');
    };

    const handleConfirm = () => {
        if (!scanResult?.food) return;

        // Navigate back with the scanned food item
        router.navigate({
            pathname: '/log-meal-items',
            params: {
                ...params,
                scannedFood: JSON.stringify(scanResult.food),
            },
        });
    };

    const handleCancel = () => {
        router.back();
    };

    // Render camera view
    const renderCamera = () => (
        <View style={styles.cameraContainer}>
            <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
            >
                {/* Overlay with targeting frame */}
                <View style={styles.overlay}>
                    <View style={styles.overlayTop} />
                    <View style={styles.overlayMiddle}>
                        <View style={styles.overlaySide} />
                        <View style={styles.targetFrame}>
                            <View style={[styles.corner, styles.cornerTopLeft]} />
                            <View style={[styles.corner, styles.cornerTopRight]} />
                            <View style={[styles.corner, styles.cornerBottomLeft]} />
                            <View style={[styles.corner, styles.cornerBottomRight]} />
                        </View>
                        <View style={styles.overlaySide} />
                    </View>
                    <View style={styles.overlayBottom}>
                        <Text style={styles.instructionText}>
                            Position the nutrition label within the frame
                        </Text>
                    </View>
                </View>
            </CameraView>

            {/* Controls */}
            <View style={styles.controls}>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                    <Ionicons name="close" size={28} color="#E7E8E9" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.captureButton}
                    onPress={handleCapture}
                    disabled={scanState !== 'ready'}
                >
                    <View style={styles.captureButtonInner} />
                </TouchableOpacity>

                <View style={styles.placeholder} />
            </View>
        </View>
    );

    // Render analyzing state
    const renderAnalyzing = () => (
        <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color="#3494D9" />
            <Text style={styles.stateTitle}>Analyzing Label...</Text>
            <Text style={styles.stateSubtitle}>
                Extracting nutrition information
            </Text>
        </View>
    );

    // Render error state
    const renderError = () => (
        <View style={styles.stateContainer}>
            <Ionicons name="warning-outline" size={64} color="#F44336" />
            <Text style={styles.stateTitle}>{errorMessage}</Text>
            <Text style={styles.stateSubtitle}>{errorDetail}</Text>
            <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                    <Ionicons name="refresh" size={20} color="#FFFFFF" />
                    <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={handleCancel}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // Render results
    const renderResults = () => {
        if (!scanResult?.parsed) return null;
        const { parsed } = scanResult;
        const valid = isValidParsedLabel(parsed);

        return (
            <ScrollView style={styles.resultsContainer} contentContainerStyle={styles.resultsContent}>
                {/* Header */}
                <View style={styles.resultsHeader}>
                    <Text style={styles.productName}>{parsed.display_name}</Text>
                    {parsed.brand && (
                        <Text style={styles.brandName}>{parsed.brand}</Text>
                    )}
                    <Text style={styles.servingInfo}>
                        {formatServingDescription(parsed)}
                    </Text>
                </View>

                {/* Confidence indicator */}
                <View style={styles.confidenceRow}>
                    <Text style={styles.confidenceLabel}>Confidence:</Text>
                    <View style={[
                        styles.confidenceBadge,
                        parsed.confidence >= 80 ? styles.confidenceHigh :
                            parsed.confidence >= 50 ? styles.confidenceMedium : styles.confidenceLow
                    ]}>
                        <Text style={styles.confidenceText}>{parsed.confidence}%</Text>
                    </View>
                </View>

                {/* Nutrition values */}
                <View style={styles.nutritionCard}>
                    <Text style={styles.nutritionTitle}>Nutrition Facts</Text>

                    <NutritionRow label="Calories" value={parsed.per_serving.calories} unit="kcal" />
                    <NutritionRow label="Carbohydrates" value={parsed.per_serving.carbs_g} unit="g" />
                    <NutritionRow label="Fiber" value={parsed.per_serving.fibre_g} unit="g" indent />
                    <NutritionRow label="Sugars" value={parsed.per_serving.sugars_g} unit="g" indent />
                    <NutritionRow label="Protein" value={parsed.per_serving.protein_g} unit="g" />
                    <NutritionRow label="Total Fat" value={parsed.per_serving.fat_g} unit="g" />
                    <NutritionRow label="Saturated Fat" value={parsed.per_serving.sat_fat_g} unit="g" indent />
                    <NutritionRow label="Sodium" value={parsed.per_serving.sodium_mg} unit="mg" />
                </View>

                {/* Warnings */}
                {parsed.warnings.length > 0 && (
                    <View style={styles.warningsCard}>
                        <Ionicons name="information-circle" size={20} color="#FF9800" />
                        <View style={styles.warningsList}>
                            {parsed.warnings.map((warning, i) => (
                                <Text key={i} style={styles.warningText}>• {warning}</Text>
                            ))}
                        </View>
                    </View>
                )}

                {/* Not enough data warning */}
                {!valid && (
                    <View style={styles.warningsCard}>
                        <Ionicons name="alert-circle" size={20} color="#F44336" />
                        <Text style={styles.warningText}>
                            Couldn't extract enough nutrition data. You may need to enter values manually.
                        </Text>
                    </View>
                )}

                {/* Action buttons */}
                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={[styles.confirmButton, !valid && styles.confirmButtonDisabled]}
                        onPress={handleConfirm}
                        disabled={!valid}
                    >
                        <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                        <Text style={styles.confirmButtonText}>Add to Meal</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.retakeButton} onPress={handleRetry}>
                        <Ionicons name="camera" size={20} color="#3494D9" />
                        <Text style={styles.retakeButtonText}>Retake Photo</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        );
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1E3A5F', '#111111', '#111111']}
                style={styles.backgroundGradient}
            />

            {scanState === 'ready' && renderCamera()}
            {scanState === 'capturing' && renderCamera()}
            {scanState === 'analyzing' && (
                <SafeAreaView style={styles.safeArea}>
                    {renderAnalyzing()}
                </SafeAreaView>
            )}
            {scanState === 'error' && (
                <SafeAreaView style={styles.safeArea}>
                    {renderError()}
                </SafeAreaView>
            )}
            {scanState === 'results' && (
                <SafeAreaView style={styles.safeArea}>
                    {renderResults()}
                </SafeAreaView>
            )}
        </View>
    );
}

// Nutrition row component
function NutritionRow({
    label,
    value,
    unit,
    indent = false
}: {
    label: string;
    value?: number | null;
    unit: string;
    indent?: boolean;
}) {
    return (
        <View style={[styles.nutritionRow, indent && styles.nutritionRowIndent]}>
            <Text style={[styles.nutritionLabel, indent && styles.nutritionLabelIndent]}>
                {label}
            </Text>
            <Text style={styles.nutritionValue}>
                {value !== null && value !== undefined ? `${value}${unit}` : '—'}
            </Text>
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
        height: 300,
    },
    safeArea: {
        flex: 1,
    },

    // Permission styles
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
        backgroundColor: '#3494D9',
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

    // Camera styles
    cameraContainer: {
        flex: 1,
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
    },
    overlayTop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    overlayMiddle: {
        flexDirection: 'row',
    },
    overlaySide: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    targetFrame: {
        width: 280,
        height: 200,
        position: 'relative',
    },
    corner: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderColor: '#3494D9',
        borderWidth: 3,
    },
    cornerTopLeft: {
        top: 0,
        left: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
    },
    cornerTopRight: {
        top: 0,
        right: 0,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
    },
    cornerBottomLeft: {
        bottom: 0,
        left: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
    },
    cornerBottomRight: {
        bottom: 0,
        right: 0,
        borderLeftWidth: 0,
        borderTopWidth: 0,
    },
    overlayBottom: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        paddingTop: 24,
    },
    instructionText: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: '#FFFFFF',
        textAlign: 'center',
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingVertical: 32,
        paddingBottom: 48,
        backgroundColor: '#111111',
    },
    cancelBtn: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureButtonInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FFFFFF',
        borderWidth: 3,
        borderColor: '#111111',
    },
    placeholder: {
        width: 50,
    },

    // State styles
    stateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    stateTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 20,
        color: '#E7E8E9',
        marginTop: 16,
        textAlign: 'center',
    },
    stateSubtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: '#878787',
        marginTop: 8,
        textAlign: 'center',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 24,
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#3494D9',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    retryButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    secondaryButton: {
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#3F4243',
    },
    secondaryButtonText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#878787',
    },

    // Results styles
    resultsContainer: {
        flex: 1,
    },
    resultsContent: {
        padding: 16,
        paddingBottom: 32,
    },
    resultsHeader: {
        marginBottom: 16,
    },
    productName: {
        fontFamily: fonts.semiBold,
        fontSize: 24,
        color: '#E7E8E9',
    },
    brandName: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#878787',
        marginTop: 4,
    },
    servingInfo: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#3494D9',
        marginTop: 8,
    },
    confidenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    confidenceLabel: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: '#878787',
    },
    confidenceBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    confidenceHigh: {
        backgroundColor: 'rgba(38, 168, 97, 0.2)',
    },
    confidenceMedium: {
        backgroundColor: 'rgba(255, 152, 0, 0.2)',
    },
    confidenceLow: {
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
    },
    confidenceText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        color: '#E7E8E9',
    },
    nutritionCard: {
        backgroundColor: 'rgba(63, 66, 67, 0.3)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    nutritionTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#E7E8E9',
        marginBottom: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#3F4243',
    },
    nutritionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(63, 66, 67, 0.5)',
    },
    nutritionRowIndent: {
        paddingLeft: 16,
    },
    nutritionLabel: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: '#E7E8E9',
    },
    nutritionLabelIndent: {
        color: '#A0A0A0',
    },
    nutritionValue: {
        fontFamily: fonts.semiBold,
        fontSize: 15,
        color: '#E7E8E9',
    },
    warningsCard: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 152, 0, 0.1)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        gap: 12,
    },
    warningsList: {
        flex: 1,
    },
    warningText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: '#FF9800',
    },
    actionButtons: {
        gap: 12,
        marginTop: 8,
    },
    confirmButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#26A861',
        paddingVertical: 16,
        borderRadius: 12,
        gap: 8,
    },
    confirmButtonDisabled: {
        backgroundColor: '#3F4243',
    },
    confirmButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    retakeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#3494D9',
        gap: 8,
    },
    retakeButtonText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#3494D9',
    },
});
