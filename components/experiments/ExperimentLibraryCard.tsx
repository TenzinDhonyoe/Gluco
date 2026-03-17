import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { ExperimentTemplate } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ExperimentLibraryCardProps {
    template: ExperimentTemplate;
    onPress: (template: ExperimentTemplate) => void;
    reason?: string;
}

const DIFFICULTY_CONFIG = {
    easy: { label: 'EASY', color: Colors.success },
    medium: { label: 'MED', color: Colors.warning },
    hard: { label: 'HARD', color: Colors.error },
} as const;

const IMPACT_CONFIG = {
    high: { label: 'High Impact', color: Colors.primary },
    medium: { label: 'Med Impact', color: Colors.warning },
    low: { label: 'Low Impact', color: Colors.textSecondary },
} as const;

export function ExperimentLibraryCard({ template, onPress, reason }: ExperimentLibraryCardProps) {
    const difficulty = template.difficulty ? DIFFICULTY_CONFIG[template.difficulty] : null;
    const impact = template.impact ? IMPACT_CONFIG[template.impact] : null;
    const iconBgColor = template.icon_color
        ? `${template.icon_color}26` // 15% opacity hex suffix
        : 'rgba(45, 212, 191, 0.15)';

    return (
        <TouchableOpacity style={styles.card} onPress={() => { triggerHaptic(); onPress(template); }} activeOpacity={0.7}>
            <View style={styles.topRow}>
                <View style={[styles.iconCircle, { backgroundColor: iconBgColor }]}>
                    <Text style={styles.iconEmoji}>{template.icon || '🧪'}</Text>
                </View>
                {difficulty && (
                    <View style={[styles.difficultyPill, { backgroundColor: `${difficulty.color}18` }]}>
                        <Text style={[styles.difficultyText, { color: difficulty.color }]}>{difficulty.label}</Text>
                    </View>
                )}
            </View>
            <Text style={styles.title} numberOfLines={1}>{template.title}</Text>
            <Text style={styles.description} numberOfLines={2}>
                {template.short_description || template.subtitle || ''}
            </Text>
            {reason ? (
                <View style={styles.reasonRow}>
                    <Ionicons name="sparkles" size={11} color="rgba(45, 212, 191, 1)" />
                    <Text style={styles.reasonText} numberOfLines={2}>{reason}</Text>
                </View>
            ) : impact ? (
                <View style={styles.impactRow}>
                    <Ionicons name="flash" size={13} color={impact.color} />
                    <Text style={[styles.impactText, { color: impact.color }]}>{impact.label}</Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        flex: 1,
        backgroundColor: Colors.backgroundCard,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: Colors.borderCard,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
        gap: 6,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconEmoji: {
        fontSize: 20,
    },
    difficultyPill: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
    },
    difficultyText: {
        fontFamily: fonts.bold,
        fontSize: 10,
        letterSpacing: 0.5,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 15,
        color: Colors.textPrimary,
        marginTop: 2,
    },
    description: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 16,
    },
    impactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    impactText: {
        fontFamily: fonts.semiBold,
        fontSize: 12,
    },
    reasonRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 4,
        marginTop: 2,
    },
    reasonText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: 11,
        color: 'rgba(45, 212, 191, 1)',
        lineHeight: 15,
    },
});
