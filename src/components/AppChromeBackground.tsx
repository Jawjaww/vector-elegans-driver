import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { APP_CHROME } from '../lib/theme';

type AppChromeBackgroundProps = Readonly<{
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Subtle charcoal chrome used behind tabs, the GPS loader, and the home sheet.
 */
export function AppChromeBackground({ style }: AppChromeBackgroundProps) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient
        colors={[...APP_CHROME.base]}
        start={APP_CHROME.start}
        end={APP_CHROME.end}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[...APP_CHROME.veil]}
        start={APP_CHROME.start}
        end={APP_CHROME.end}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
