import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { APP_CHROME } from '../lib/theme';

type AppChromeBackgroundProps = Readonly<{
  style?: StyleProp<ViewStyle>;
}>;

/** Flat fill behind the home sheet, the tab floor, and the GPS loader. */
export function AppChromeBackground({ style }: AppChromeBackgroundProps) {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: APP_CHROME.surface }, style]}
    />
  );
}
