import React, { useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/theme";

export interface InputProps extends TextInputProps {
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  leftIcon,
  rightSlot,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrapper,
        {
          height: 48, // h-12 matching src/components/ui/input.tsx
          borderRadius: theme.radii.xl, // rounded-xl (12px)
          borderColor: focused ? theme.colors.ring : theme.colors.input,
          borderWidth: focused ? 1.5 : 1,
          backgroundColor: theme.colors.card,
          paddingHorizontal: theme.spacing.md + 2,
          gap: theme.spacing.sm,
        },
        containerStyle,
      ]}
    >
      {leftIcon}
      <TextInput
        placeholderTextColor={theme.colors.mutedForeground}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          theme.typography.body,
          { color: theme.colors.foreground },
          style,
        ]}
        {...rest}
      />
      {rightSlot}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  input: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
  },
});
