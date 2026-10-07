import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { APP_CHROME } from '../lib/theme';
import { VGpsLoader } from './VGpsLoader';

/**
 * How long the dark chrome takes to give way to the basemap.
 * A WebView does not fade with its parent on Android — it punches through at full opacity —
 * so the transition is this opaque view leaving, not the map arriving.
 */
const WAKE_FADE_MS = 640;
const WAKE_FADE_INSTANT_MS = 420;

type MapWakeProps = Readonly<{
  /** Dashboard boot: the veil is fully up and the mark sits on the dark chrome. */
  booting: boolean;
  /** Notification arrival shortens the fade; it does not skip the veil's first opaque frame. */
  instant: boolean;
  /** Map still preparing after the veil has gone. The mark stays, the caption is on the basemap. */
  showLoader: boolean;
  hint?: string;
  children: ReactNode;
}>;

/**
 * Keeps the map mounted under a dark veil, then fades the veil out onto the beige canvas.
 * The caption fades in with the veil's departure: dark ink, only once the light ground is
 * what it will be read against.
 */
export function MapWake({
  booting,
  instant,
  showLoader,
  hint,
  children,
}: MapWakeProps) {
  const cover = useSharedValue(booting ? 1 : 0);
  const [coverMounted, setCoverMounted] = useState(booting);
  const captionReveal = useDerivedValue(() => 1 - cover.value);

  useEffect(() => {
    if (booting) {
      setCoverMounted(true);
      cover.value = 1;
      return;
    }

    cover.value = withTiming(
      0,
      {
        duration: instant ? WAKE_FADE_INSTANT_MS : WAKE_FADE_MS,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) scheduleOnRN(setCoverMounted, false);
      },
    );
  }, [booting, instant, cover]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));

  return (
    <View style={styles.host}>
      {children}
      {coverMounted ? (
        <Animated.View
          pointerEvents={booting ? 'auto' : 'none'}
          style={[styles.cover, coverStyle]}
        />
      ) : null}
      <VGpsLoader
        visible={booting || showLoader}
        hint={hint}
        captionReveal={captionReveal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    backgroundColor: APP_CHROME.surface,
  },
});
