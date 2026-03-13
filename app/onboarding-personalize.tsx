import { PAYWALL_ENABLED } from '@/app/index';
import { FadeText } from '@/components/reacticx/organisms/fade-text';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fonts } from '@/hooks/useFonts';
import { invokeOnboardingPlan } from '@/lib/supabase';
import { triggerHaptic } from '@/lib/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CoachingStyle, OnboardingPlanResult, TrackingMode } from '@/lib/supabase';

// ── Timing constants ──

const STEP_INTERVAL = 700;
const STEP_COMPLETE_DELAY = 600;
const GREETING_DURATION = 1200;
/** Time at which steps are done and phase 2 can begin */
const STEPS_DONE_TIME = 6500;
/** Hard safety cap — navigate no matter what */
const SAFETY_TIMEOUT = 30000;

// ── Label maps ──

const TRACKING_LABELS: Record<TrackingMode, string> = {
    meals_wearables: 'meal & health tracking',
    meals_only: 'meal tracking',
    manual_glucose_optional: 'meal & glucose tracking',
    wearables_only: 'health data tracking',
    glucose_tracking: 'glucose tracking',
};

const COACHING_LABELS: Record<CoachingStyle, string> = {
    light: 'gentle nudges',
    balanced: 'balanced coaching',
    structured: 'structured guidance',
};

// ── Steps (7 total) ──

function getSteps(profile: {
    goals?: string[] | null;
    tracking_mode?: TrackingMode;
    coaching_style?: CoachingStyle | null;
    dietary_preferences?: string[];
    ai_enabled?: boolean;
}) {
    const goalText = profile.goals?.length ? profile.goals[0].toLowerCase().replace(/_/g, ' ') : null;
    const trackingLabel = profile.tracking_mode ? TRACKING_LABELS[profile.tracking_mode] : null;
    const coachingLabel = profile.coaching_style ? COACHING_LABELS[profile.coaching_style] : null;
    const hasDietary = profile.dietary_preferences && profile.dietary_preferences.length > 0;

    return [
        goalText ? `Reviewing your ${goalText} goal` : 'Reviewing your goals',
        trackingLabel ? `Setting up ${trackingLabel}` : 'Setting up your tracking',
        coachingLabel ? `Personalizing ${coachingLabel}` : 'Personalizing your coaching',
        hasDietary ? 'Applying dietary preferences' : 'Analyzing your preferences',
        profile.ai_enabled ? 'Enabling AI insights' : 'Finalizing preferences',
        'Generating your plan with AI',
        'Building your dashboard',
    ];
}

// ── Client-side fallback (mirrors server logic) ──

function getLocalFallback(profile: {
    first_name?: string | null;
    goals?: string[] | null;
    tracking_mode?: TrackingMode;
    coaching_style?: CoachingStyle | null;
}): OnboardingPlanResult {
    const goalKey = profile.goals?.[0] || 'eat_healthier';
    const goalLabel = goalKey.replace(/_/g, ' ');
    const firstName = profile.first_name?.trim() || '';
    const nameClause = firstName ? `, ${firstName}` : '';
    const trackingLabel = profile.tracking_mode ? (TRACKING_LABELS[profile.tracking_mode] || 'meal tracking') : 'meal tracking';
    const coachingLabel = profile.coaching_style ? (COACHING_LABELS[profile.coaching_style] || 'balanced') : 'balanced';

    return {
        plan_title: 'Your Wellness Plan',
        plan_sentences: [
            `Your goal of ${goalLabel} is a great place to start${nameClause} — we'll build a plan around what matters most to you.`,
            `This week, try logging your meals consistently using ${trackingLabel} to see how your choices connect to how you feel.`,
            `We'll use ${coachingLabel} coaching to share observations and small suggestions that fit your routine.`,
            `Each day brings a chance to notice something new about your patterns — you're already on the right path.`,
        ],
        source: 'fallback',
    };
}

// ── Step item component ──

function StepItem({ text, index, startTime }: { text: string; index: number; startTime: number }) {
    const opacity = useSharedValue(0);
    const translateX = useSharedValue(-12);
    const checkScale = useSharedValue(0);
    const fillProgress = useSharedValue(0);

    useEffect(() => {
        const appearDelay = startTime + index * STEP_INTERVAL;
        const completeDelay = appearDelay + STEP_COMPLETE_DELAY;

        opacity.value = withDelay(appearDelay, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
        translateX.value = withDelay(appearDelay, withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }));
        fillProgress.value = withDelay(completeDelay, withTiming(1, { duration: 300 }));
        checkScale.value = withDelay(completeDelay, withSpring(1, { damping: 12, stiffness: 200 }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: translateX.value }],
    }));

    const fillStyle = useAnimatedStyle(() => ({
        opacity: fillProgress.value,
    }));

    const checkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkScale.value }],
    }));

    return (
        <Animated.View style={[styles.stepRow, containerStyle]}>
            <View style={styles.circle}>
                <Animated.View style={[styles.circleFill, fillStyle]} />
                <Animated.View style={[styles.checkContainer, checkStyle]}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                </Animated.View>
            </View>
            <Text style={styles.stepText}>{text}</Text>
        </Animated.View>
    );
}

// ── Main screen ──

export default function OnboardingPersonalizeScreen() {
    const { profile } = useAuth();
    const navigated = useRef(false);
    const progressWidth = useSharedValue(0);

    // Phase state
    const [phase, setPhase] = useState<'steps' | 'teaser'>('steps');
    const [planResult, setPlanResult] = useState<OnboardingPlanResult | null>(null);
    const stepsAnimDone = useRef(false);
    const aiDone = useRef(false);

    const firstName = profile?.first_name?.trim() || null;
    const greeting = firstName ? `Creating your plan, ${firstName}...` : 'Creating your plan...';
    const steps = getSteps({
        goals: profile?.goals,
        tracking_mode: profile?.tracking_mode,
        coaching_style: profile?.coaching_style,
        dietary_preferences: profile?.dietary_preferences,
        ai_enabled: profile?.ai_enabled,
    });

    const navigate = () => {
        if (navigated.current) return;
        navigated.current = true;
        if (PAYWALL_ENABLED) {
            router.replace('/paywall' as never);
        } else {
            router.replace('/(tabs)' as never);
        }
    };

    // Try to transition to phase 2 when both conditions are met
    const tryTransition = () => {
        if (stepsAnimDone.current && aiDone.current && phase === 'steps') {
            setPhase('teaser');
            triggerHaptic('medium');
        }
    };

    // Fire AI call on mount
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const userId = profile?.id;
                if (!userId) {
                    // No user ID — use local fallback
                    if (!cancelled) {
                        setPlanResult(getLocalFallback(profile || {}));
                        aiDone.current = true;
                        tryTransition();
                    }
                    return;
                }

                const result = await invokeOnboardingPlan(userId);
                if (!cancelled) {
                    setPlanResult(result || getLocalFallback(profile || {}));
                    aiDone.current = true;
                    tryTransition();
                }
            } catch {
                if (!cancelled) {
                    setPlanResult(getLocalFallback(profile || {}));
                    aiDone.current = true;
                    tryTransition();
                }
            }
        })();

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Steps animation timer
    useEffect(() => {
        const timer = setTimeout(() => {
            stepsAnimDone.current = true;
            tryTransition();
        }, STEPS_DONE_TIME);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Progress bar: fills to ~70% during steps, then to 100% during teaser
    useEffect(() => {
        progressWidth.value = withTiming(0.7, { duration: STEPS_DONE_TIME, easing: Easing.linear });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (phase === 'teaser') {
            progressWidth.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // Safety timeout — navigate no matter what
    useEffect(() => {
        const safety = setTimeout(() => {
            // If still in steps phase, force the fallback
            if (!aiDone.current) {
                setPlanResult(getLocalFallback(profile || {}));
            }
            navigate();
        }, SAFETY_TIMEOUT);
        return () => clearTimeout(safety);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Haptic on each step completion
    useEffect(() => {
        const timers = steps.map((_, i) => {
            const delay = GREETING_DURATION + i * STEP_INTERVAL + STEP_COMPLETE_DELAY;
            return setTimeout(() => triggerHaptic('light'), delay);
        });
        return () => timers.forEach(clearTimeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Block back navigation
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => sub.remove();
    }, []);

    const progressStyle = useAnimatedStyle(() => ({
        width: `${progressWidth.value * 100}%` as `${number}%`,
    }));

    const plan = planResult;

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.content}>
                    {phase === 'steps' && (
                        <Animated.View exiting={FadeOut.duration(400)} style={styles.stepsPhase}>
                            <FadeText
                                inputs={[greeting]}
                                wordDelay={200}
                                duration={600}
                                fontSize={28}
                                fontWeight="600"
                                color={Colors.textPrimary}
                                style={{ fontFamily: fonts.semiBold }}
                            />

                            <View style={styles.stepsContainer}>
                                {steps.map((text, i) => (
                                    <StepItem key={i} text={text} index={i} startTime={GREETING_DURATION} />
                                ))}
                            </View>
                        </Animated.View>
                    )}

                    {phase === 'teaser' && plan && (
                        <Animated.View entering={FadeIn.duration(500).delay(200)} style={styles.teaserPhase}>
                            <Text style={styles.teaserTitle}>{plan.plan_title}</Text>

                            <View style={styles.teaserCard}>
                                {/* First sentence — fully visible */}
                                <Text style={styles.teaserSentenceVisible}>
                                    {plan.plan_sentences[0]}
                                </Text>

                                {/* Remaining sentences — blurred behind gradient */}
                                <View style={styles.blurredSection}>
                                    <View style={styles.blurredTextContainer}>
                                        {plan.plan_sentences.slice(1).map((sentence, i) => (
                                            <Text key={i} style={styles.teaserSentenceBlurred}>
                                                {sentence}
                                            </Text>
                                        ))}
                                    </View>

                                    <LinearGradient
                                        colors={[
                                            'rgba(255, 255, 255, 0)',
                                            'rgba(255, 255, 255, 0.7)',
                                            'rgba(255, 255, 255, 0.95)',
                                        ]}
                                        locations={[0, 0.4, 1]}
                                        style={styles.gradientOverlay}
                                    />
                                </View>

                                {/* Unlock hint */}
                                <View style={styles.unlockRow}>
                                    <Ionicons name="lock-closed" size={16} color={Colors.primary} />
                                    <Text style={styles.unlockText}>Unlock your full plan</Text>
                                </View>
                            </View>

                            <Pressable
                                style={styles.continueButton}
                                onPress={() => {
                                    triggerHaptic('medium');
                                    navigate();
                                }}
                            >
                                <Text style={styles.continueButtonText}>See Your Full Plan</Text>
                            </Pressable>
                        </Animated.View>
                    )}
                </View>

                <View style={styles.progressContainer}>
                    <View style={styles.progressTrack}>
                        <Animated.View style={[styles.progressFill, progressStyle]} />
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
}

// ── Styles ──

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    safeArea: {
        flex: 1,
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },

    // Phase 1: Steps
    stepsPhase: {
        flex: 1,
        justifyContent: 'center',
    },
    stepsContainer: {
        marginTop: 40,
        gap: 20,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    circle: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2,
        borderColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    circleFill: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 13,
        backgroundColor: Colors.primary,
    },
    checkContainer: {
        position: 'absolute',
    },
    stepText: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: Colors.textPrimary,
    },

    // Phase 2: Teaser
    teaserPhase: {
        flex: 1,
        justifyContent: 'center',
    },
    teaserTitle: {
        fontFamily: fonts.semiBold,
        fontSize: 28,
        color: Colors.textPrimary,
        marginBottom: 20,
    },
    teaserCard: {
        backgroundColor: Colors.backgroundCardGlass,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.borderCard,
    },
    teaserSentenceVisible: {
        fontFamily: fonts.regular,
        fontSize: 16,
        lineHeight: 24,
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    blurredSection: {
        position: 'relative',
        overflow: 'hidden',
    },
    blurredTextContainer: {
        gap: 10,
    },
    teaserSentenceBlurred: {
        fontFamily: fonts.regular,
        fontSize: 16,
        lineHeight: 24,
        color: Colors.textPrimary,
    },
    gradientOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    unlockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
        justifyContent: 'center',
    },
    unlockText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: Colors.primary,
    },
    continueButton: {
        backgroundColor: Colors.primary,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
    },
    continueButtonText: {
        fontFamily: fonts.semiBold,
        fontSize: 17,
        color: '#fff',
    },

    // Progress bar
    progressContainer: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    progressTrack: {
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.borderCard,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
        backgroundColor: Colors.primary,
    },
});
