import re

with open('app/(tabs)/index.tsx', 'r') as f:
    code = f.read()

# 1. Styles replacements
code = code.replace("""    behaviorPrimaryCard: {
        borderRadius: 24, // Modern large radius
        padding: 14,
        marginBottom: CARD_SPACING,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.70)', // Translucent base
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)', // Subtle glass edge
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 3,
    },
    behaviorNextActionCard: {
        borderRadius: 24, // Matches primary card styling
        padding: 14,
        marginBottom: CARD_SPACING,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 2,
    },""", """    behaviorHeroGlassWrapper: {
        marginBottom: CARD_SPACING,
        borderRadius: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.1,
        shadowRadius: 32,
        elevation: 8,
        backgroundColor: 'transparent',
    },
    behaviorHeroGlassInner: {
        borderRadius: 32,
        padding: 18,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    behaviorHeroGlassHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 2,
        borderLeftWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 32,
    },
    behaviorSecondaryGlassWrapper: {
        marginBottom: CARD_SPACING,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 4,
        backgroundColor: 'transparent',
    },
    behaviorSecondaryGlassInner: {
        borderRadius: 24,
        padding: 16,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    behaviorSecondaryGlassHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 24,
    },""")

code = code.replace("""    checkinPromptCard: {
        borderRadius: 24, // Match Liquid Glass overarching style
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 14,
        marginBottom: CARD_SPACING,
        overflow: 'hidden',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.70)', // Light glass base (although uses custom gradient inside component, good fallback)
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 3,
    },""", """    checkinPromptCard: {
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 14,
        overflow: 'hidden',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },""")

code = code.replace("""    behaviorMomentumCard: {
        flex: 1,
        minHeight: 120,
        borderRadius: 20, // Match soft UI
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        padding: 12,
        paddingBottom: 10,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.70)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 2,
    },""", """    behaviorSmallGlassWrapper: {
        flex: 1,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
        backgroundColor: 'transparent',
    },
    behaviorMomentumCard: {
        flex: 1,
        minHeight: 120,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        padding: 12,
        paddingBottom: 10,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    behaviorSmallGlassHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1.5,
        borderLeftWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 20,
    },""")

# JSX Replace 1: BehaviorMetabolicHeroCard
code = code.replace("""    return (
        <BlurView intensity={60} tint="light" style={styles.behaviorPrimaryCard}>
            <View style={styles.behaviorPrimaryTopRow}>""", """    return (
        <View style={styles.behaviorHeroGlassWrapper}>
            <BlurView intensity={80} tint="light" style={styles.behaviorHeroGlassInner}>
                <LinearGradient
                    colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.7)']}
                    locations={[0, 0.4, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.behaviorHeroGlassHighlight} />
                
                <View style={styles.behaviorPrimaryTopRow}>""")
code = code.replace("""                    ))}
                </View>
            )}

        </BlurView>
    );
}""", """                    ))}
                </View>
            )}

            </BlurView>
        </View>
    );
}""")

# JSX Replace 2: BehaviorCheckinPromptCard
code = code.replace("""    return (
        <BlurView intensity={60} tint="light" style={styles.checkinPromptCard}>
            <LinearGradient
                colors={['rgba(52, 211, 153, 0.8)', 'rgba(45, 212, 191, 0.8)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.checkinPromptEmojiRow}>""", """    return (
        <View style={styles.behaviorSecondaryGlassWrapper}>
            <BlurView intensity={80} tint="light" style={styles.checkinPromptCard}>
                <LinearGradient
                    colors={['rgba(52, 211, 153, 0.9)', 'rgba(45, 212, 191, 0.7)', 'rgba(52, 211, 153, 0.8)']}
                    locations={[0, 0.4, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={[styles.behaviorSecondaryGlassHighlight, { borderColor: 'rgba(255,255,255,0.6)' }]} />
                <View style={styles.checkinPromptEmojiRow}>""")
code = code.replace("""            <TouchableOpacity style={styles.checkinPromptDismiss} onPress={onDismiss} activeOpacity={0.7}>
                <Text style={styles.checkinPromptDismissText}>Remind me later</Text>
            </TouchableOpacity>
        </BlurView>
    );
}""", """            <TouchableOpacity style={styles.checkinPromptDismiss} onPress={onDismiss} activeOpacity={0.7}>
                <Text style={styles.checkinPromptDismissText}>Remind me later</Text>
            </TouchableOpacity>
            </BlurView>
        </View>
    );
}""")

# JSX Replace 3: BehaviorNextActionCard
code = code.replace("""    return (
        <BlurView intensity={60} tint="light" style={styles.behaviorNextActionCard}>
            <Text style={styles.behaviorActionStripLabel}>NEXT BEST ACTION</Text>""", """    return (
        <View style={styles.behaviorSecondaryGlassWrapper}>
            <BlurView intensity={80} tint="light" style={styles.behaviorSecondaryGlassInner}>
                <LinearGradient
                    colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.6)']}
                    locations={[0, 0.4, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.behaviorSecondaryGlassHighlight} />
                <Text style={styles.behaviorActionStripLabel}>NEXT BEST ACTION</Text>""")
code = code.replace("""                <Text style={styles.behaviorPrimaryLinkText}>See more steps in Daily Focus</Text>
                <Ionicons name="arrow-forward" size={12} color={behaviorV1Theme.sageMid} />
            </AnimatedPressable>
        </BlurView>
    );
}""", """                <Text style={styles.behaviorPrimaryLinkText}>See more steps in Daily Focus</Text>
                <Ionicons name="arrow-forward" size={12} color={behaviorV1Theme.sageMid} />
            </AnimatedPressable>
            </BlurView>
        </View>
    );
}""")

# JSX Replace 4: BehaviorMomentumCard
code = code.replace("""    // Invite state — centered layout matching reference
    if (state === 'invite') {
        return (
            <AnimatedPressable
                style={[
                    styles.behaviorMomentumCard,
                    styles.behaviorMomentumCardInvite,
                    { borderColor: accentBorder, backgroundColor: 'transparent' },
                ]}
                onPress={onPress}
                disabled={!onPress}
            >
                <BlurView intensity={60} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: accentSurface }]} />
                <View style={styles.momentumInviteCentered}>""", """    // Invite state — centered layout matching reference
    if (state === 'invite') {
        return (
            <View style={styles.behaviorSmallGlassWrapper}>
                <AnimatedPressable
                    style={[
                        styles.behaviorMomentumCard,
                        styles.behaviorMomentumCardInvite,
                        { borderColor: accentBorder, backgroundColor: 'transparent' },
                    ]}
                    onPress={onPress}
                    disabled={!onPress}
                >
                    <BlurView intensity={80} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: accentSurface }]}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.4)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.behaviorSmallGlassHighlight} />
                    </BlurView>
                    <View style={styles.momentumInviteCentered}>""")

code = code.replace("""                    {inviteCtaLabel ? (
                        <View style={[styles.momentumInviteCta, { borderColor: accentColor }]}>
                            <Text style={[styles.momentumInviteCtaText, { color: accentColor }]}>{inviteCtaLabel}</Text>
                        </View>
                    ) : null}
                </View>
            </AnimatedPressable>
        );
    }""", """                    {inviteCtaLabel ? (
                        <View style={[styles.momentumInviteCta, { borderColor: accentColor }]}>
                            <Text style={[styles.momentumInviteCtaText, { color: accentColor }]}>{inviteCtaLabel}</Text>
                        </View>
                    ) : null}
                </View>
                </AnimatedPressable>
            </View>
        );
    }""")

code = code.replace("""    // Data state — icon+label → value → chart → subtitle
    return (
        <AnimatedPressable
            style={[
                styles.behaviorMomentumCard,
                { borderColor: accentBorder, backgroundColor: 'transparent' },
            ]}
            onPress={onPress}
            disabled={!onPress}
        >
            <BlurView intensity={60} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: accentSurface }]} />
            <View style={styles.behaviorMomentumLabelRow}>""", """    // Data state — icon+label → value → chart → subtitle
    return (
        <View style={styles.behaviorSmallGlassWrapper}>
            <AnimatedPressable
                style={[
                    styles.behaviorMomentumCard,
                    { borderColor: accentBorder, backgroundColor: 'transparent' },
                ]}
                onPress={onPress}
                disabled={!onPress}
            >
                <BlurView intensity={80} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: accentSurface }]}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.4)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.behaviorSmallGlassHighlight} />
                </BlurView>
                <View style={styles.behaviorMomentumLabelRow}>""")

code = code.replace("""            <Text style={styles.behaviorMomentumSubtitle}>
                {subtitle}
            </Text>
        </AnimatedPressable>
    );
}""", """            <Text style={styles.behaviorMomentumSubtitle}>
                {subtitle}
            </Text>
            </AnimatedPressable>
        </View>
    );
}""")

with open('app/(tabs)/index.tsx', 'w') as f:
    f.write(code)

