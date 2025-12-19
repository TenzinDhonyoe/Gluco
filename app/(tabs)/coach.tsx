import { AnimatedScreen } from '@/components/animated-screen';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CoachScreen() {
    return (
        <AnimatedScreen>
            <View style={styles.container}>
                <SafeAreaView edges={['top']} style={styles.safeArea}>
                    <View style={styles.content}>
                        <Text style={styles.title}>Coach</Text>
                        <Text style={styles.subtitle}>Coming soon...</Text>
                    </View>
                </SafeAreaView>
            </View>
        </AnimatedScreen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111111',
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: '#878787',
    },
});
