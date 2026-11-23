import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

function canTriggerHaptics(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

export async function hapticSuccess(): Promise<void> {
  if (!canTriggerHaptics()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Ignore unsupported hardware or simulator haptic errors
  }
}

export async function hapticWarning(): Promise<void> {
  if (!canTriggerHaptics()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Ignore unsupported hardware or simulator haptic errors
  }
}

export async function hapticError(): Promise<void> {
  if (!canTriggerHaptics()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Ignore unsupported hardware or simulator haptic errors
  }
}

export async function hapticLight(): Promise<void> {
  if (!canTriggerHaptics()) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Ignore unsupported hardware or simulator haptic errors
  }
}

export async function hapticMedium(): Promise<void> {
  if (!canTriggerHaptics()) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Ignore unsupported hardware or simulator haptic errors
  }
}
