import { fonts } from '@/hooks/useFonts';
import { triggerHaptic } from '@/lib/utils/haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type DropdownMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
};

export function DropdownMenu({
  open,
  onOpenChange,
  trigger,
  children,
  align = 'start',
  sideOffset = 0,
}: DropdownMenuProps) {
  const triggerRef = useRef<View>(null);
  const [triggerLayout, setTriggerLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const measureTrigger = () => {
    if (triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, width, height) => {
        setTriggerLayout({ x, y, width, height });
      });
    }
  };

  useEffect(() => {
    if (open) {
      // Multiple attempts to measure, as layout might not be ready immediately
      measureTrigger();
      const t1 = setTimeout(measureTrigger, 50);
      const t2 = setTimeout(measureTrigger, 100);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [open]);

  return (
    <>
      <View
        ref={triggerRef}
        collapsable={false}
        onLayout={measureTrigger}
      >
        {trigger}
      </View>

      <DropdownContent
        open={open}
        onOpenChange={onOpenChange}
        triggerLayout={triggerLayout}
        align={align}
        sideOffset={sideOffset}
      >
        {children}
      </DropdownContent>
    </>
  );
}

type DropdownContentProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLayout: { x: number; y: number; width: number; height: number };
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  children: React.ReactNode;
};

function DropdownContent({
  open,
  onOpenChange,
  triggerLayout,
  align = 'start',
  sideOffset = 0,
  children,
}: DropdownContentProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-8);

  useEffect(() => {
    if (open) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 200 });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(-8, { duration: 150 });
    }
  }, [open, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!open || (triggerLayout.width === 0 && triggerLayout.height === 0)) return null;

  // Calculate position based on trigger layout
  const dropdownWidth = Math.max(triggerLayout.width || 200, 200);
  const top = triggerLayout.y + triggerLayout.height + (sideOffset || 4);
  let left = triggerLayout.x;
  
  if (align === 'center') {
    left = triggerLayout.x + triggerLayout.width / 2 - dropdownWidth / 2;
  } else if (align === 'end') {
    left = triggerLayout.x + triggerLayout.width - dropdownWidth;
  }

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={() => onOpenChange(false)}>
      <Pressable 
      style={StyleSheet.absoluteFill} 
      onPress={() => onOpenChange(false)}
    >
        <Animated.View
          style={[
            styles.content,
            animatedStyle,
            {
              top: Math.max(16, top), // Ensure it's not off-screen at top
              left: Math.max(16, Math.min(left, SCREEN_WIDTH - 216)), // Keep within screen bounds
              width: Math.max(200, Math.min(triggerLayout.width || 300, SCREEN_WIDTH - 32)),
            },
          ]}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

type DropdownMenuItemProps = {
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
};

export function DropdownMenuItem({ children, onSelect, disabled = false }: DropdownMenuItemProps) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled && onSelect) {
          triggerHaptic();
          onSelect();
        }
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.item,
        pressed && !disabled && styles.itemPressed,
        disabled && styles.itemDisabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

type DropdownMenuLabelProps = {
  children: React.ReactNode;
};

export function DropdownMenuLabel({ children }: DropdownMenuLabelProps) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: {
    position: 'absolute',
    minWidth: 200,
    backgroundColor: 'rgba(240, 248, 249, 0.97)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.12)',
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 1000,
  },
  item: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemPressed: {
    backgroundColor: 'rgba(45, 212, 191, 0.08)',
  },
  itemDisabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#8E8E93',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
