import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  right?: React.ReactNode;
};

export function SheetItem({ title, subtitle, icon, onPress, right }: Props) {
  return (
    <Pressable onPress={() => { triggerHaptic(); onPress(); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {icon && <Ionicons name={icon} size={20} color="#1C1C1E" style={{ marginRight: 12 }} />}
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={16} color="#8E8E93" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  left: { flex: 1, paddingRight: 10 },
  title: { fontFamily: fonts.medium, fontSize: 15, color: '#1C1C1E' },
  subtitle: { marginTop: 4, fontFamily: fonts.regular, fontSize: 12, color: '#8E8E93' },
});

