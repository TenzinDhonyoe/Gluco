import { PropsWithChildren, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { fonts } from '@/hooks/useFonts';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const colorScheme = useColorScheme();
  const theme = colorScheme ?? 'light';
  const iconColor = theme === 'light' ? '#000000' : '#FFFFFF';
  const textColor = theme === 'light' ? '#000000' : '#FFFFFF';

  return (
    <View>
      <TouchableOpacity
        style={styles.heading}
        onPress={() => setIsOpen((value) => !value)}
        activeOpacity={0.8}>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={iconColor}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />

        <Text style={[styles.title, { color: textColor }]}>{title}</Text>
      </TouchableOpacity>
      {isOpen && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
  },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});
