import { fonts } from '@/hooks/useFonts';
import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

type Props = TextInputProps & {
  label?: string;
  containerStyle?: ViewStyle;
  right?: React.ReactNode;
};

export function Input({ label, containerStyle, right, style, ...props }: Props) {
  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.shell}>
        <TextInput
          {...props}
          placeholderTextColor={props.placeholderTextColor ?? '#878787'}
          style={[styles.input, style]}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 14,
  },
  shell: {
    backgroundColor: '#1b1b1c',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#313135',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: '#FFFFFF',
    padding: 0,
  },
  right: {
    marginLeft: 12,
  },
});

