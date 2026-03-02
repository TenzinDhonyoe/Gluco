/**
 * Scan Nutrition Label Screen
 * Camera-based nutrition label scanning with Gemini Vision parsing
 */

import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import {
    LabelScanResult,
    parseLabelFromImage
} from '@/lib/labelScan';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnalysisResultsView from './components/scanner/AnalysisResultsView';
import { SelectedItem } from './components/scanner/FoodSearchResultsView';

type ScanState = 'ready' | 'capturing' | 'analyzing' | 'results' | 'error';

export default function ScanLabelScreen() {
    const params = useLocalSearchParams();
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [scanState, setScanState] = useState<ScanState>('ready');
    const [scanResult, setScanResult] = useState<LabelScanResult | null>(null);
    const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [errorDetail, setErrorDetail] = useState<string>('');

    // Request camera permission
    if (!permission) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.permissionContainer}>
                        <Ionicons name="camera-outline" size={64} color={Colors.textTertiary} />
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

            setCapturedImageUri(photo.uri || null);
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
        setCapturedImageUri(null);
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
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.stateTitle}>Analyzing Label...</Text>
            <Text style={styles.stateSubtitle}>
                Extracting nutrition information
            </Text>
        </View>
    );

    // Render error state
    const renderError = () => (
        <View style={styles.stateContainer}>
            <Ionicons name="warning-outline" size={64} color={Colors.error} />
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
        if (!scanResult?.parsed || !capturedImageUri || !scanResult.food) return null;

        const items: SelectedItem[] = [
            {
                ...scanResult.food,
                quantity: 1,
                source: 'manual',
            },
        ];

        return (
            <AnalysisResultsView
                imageUri={capturedImageUri}
                items={items}
                onReview={handleRetry}
                onSave={handleConfirm}
                onClose={handleCancel}
                headerTitle="LABEL REVIEW"
                primaryActionLabel="Add to meal"
                reviewIcon="camera-outline"
            />
        );
    };

    return (
        <View style={styles.container}>
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
            {scanState === 'results' && renderResults()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
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
        color: Colors.textTertiary,
        textAlign: 'center',
        marginTop: 8,
    },
    permissionButton: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 24,
    },
    permissionButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
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
        borderColor: Colors.primary,
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
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingVertical: 32,
        paddingBottom: 48,
        backgroundColor: Colors.background,
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
        borderColor: Colors.background,
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
        color: Colors.primary,
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
        borderRadius: 20,
        gap: 8,
    },
    confirmButtonDisabled: {
        backgroundColor: '#3F4243',
    },
    confirmButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    retakeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.primary,
        gap: 8,
    },
    retakeButtonText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: Colors.primary,
    },
});
