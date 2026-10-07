import { useEffect, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Tracé exact calqué sur le modèle dessiné :
 * - Boucle / oreille à gauche
 * - Descente en U large vers la pointe basse
 * - Grande boucle supérieure centrale / droite
 * - Sortie élancée vers le haut à droite
 * viewBox 0 0 460 400
 */
const V_EXACT_PATH =
  // Entrée / Boucle gauche
  'M 120 160 ' +
  'C 90 160, 75 100, 115 90 ' +
  'C 135 85, 145 120, 130 150 ' +
  // Descente vers la pointe du V
  'C 120 175, 115 250, 170 310 ' +
  'C 215 360, 275 360, 310 300 ' +
  // Remontée et boucle supérieure (œil du V)
  'C 350 230, 350 140, 280 130 ' +
  'C 220 120, 190 180, 240 210 ' +
  'C 280 235, 340 180, 420 60';

const PATH_LENGTH = 1150;
const VIEWBOX_WIDTH = 460;
const VIEWBOX_HEIGHT = 400;

/** Inline default. The map overlay and the OTA row pass their own height. */
const DEFAULT_MARK_HEIGHT = 88;

/**
 * Ink for a caption sitting on the liberty basemap (`BASEMAP_CANVAS`, a warm off-white).
 * White at 45% on that ground measured as invisible; this is the dark end of the chrome.
 */
const MAP_HINT_INK = '#1c1917';

type VRouteMarkProps = Readonly<{
  /** Rendered height in px. Width follows the 460×400 viewBox. */
  height?: number;
  /** Omitted by default so an inline slot does not grow by a caption line. */
  hint?: string;
  /**
   * 0 while a dark veil still covers the basemap, 1 once that ground is what the caption
   * sits on. The ink stays dark either way — fading the caption in is what keeps it off
   * the veil, where dark type would disappear.
   */
  captionReveal?: SharedValue<number>;
}>;

/**
 * Compact road-shaped V. No fill, no overlay: drop it into any loading slot.
 * Stroke widths stay in viewBox units, so they scale with `height`.
 */
export function VRouteMark({
  height = DEFAULT_MARK_HEIGHT,
  hint,
  captionReveal,
}: VRouteMarkProps) {
  const gradientSuffix = useId().replace(/[^a-zA-Z0-9]/g, '');
  const glowId = `roadGlow-${gradientSuffix}`;
  const edgeId = `roadEdge-${gradientSuffix}`;
  const dashOffset = useSharedValue(PATH_LENGTH);
  const laneDash = useSharedValue(0);

  useEffect(() => {
    dashOffset.value = PATH_LENGTH;
    dashOffset.value = withRepeat(
      withSequence(
        withTiming(0, {
          duration: 3800,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        }),
        withTiming(0, { duration: 800 }),
        withTiming(PATH_LENGTH, { duration: 0 }),
      ),
      -1,
      false,
    );

    laneDash.value = withRepeat(
      withTiming(-40, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(dashOffset);
      cancelAnimation(laneDash);
    };
  }, [dashOffset, laneDash]);

  const drawProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const laneProps = useAnimatedProps(() => ({
    strokeDashoffset: laneDash.value,
  }));

  const width = height * (VIEWBOX_WIDTH / VIEWBOX_HEIGHT);
  const revealFallback = useSharedValue(1);
  const reveal = captionReveal ?? revealFallback;
  const captionStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    color: MAP_HINT_INK,
  }));

  return (
    <View style={styles.mark} accessibilityLabel="Chargement">
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <LinearGradient id={glowId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
            <Stop offset="50%" stopColor="#2563eb" stopOpacity="1" />
            <Stop offset="100%" stopColor="#1d4ed8" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id={edgeId} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#0f172a" stopOpacity="1" />
            <Stop offset="100%" stopColor="#1e293b" stopOpacity="1" />
          </LinearGradient>
        </Defs>

        <Path
          d={V_EXACT_PATH}
          stroke="#1e3a8a"
          strokeWidth={24}
          strokeOpacity={0.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <Path
          d={V_EXACT_PATH}
          stroke={`url(#${edgeId})`}
          strokeWidth={16}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <AnimatedPath
          d={V_EXACT_PATH}
          stroke={`url(#${glowId})`}
          strokeWidth={11}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[PATH_LENGTH, PATH_LENGTH]}
          animatedProps={drawProps}
        />

        <AnimatedPath
          d={V_EXACT_PATH}
          stroke="#ffffff"
          strokeWidth={2}
          strokeOpacity={0.9}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[10, 14]}
          animatedProps={laneProps}
        />
      </Svg>
      {hint ? (
        <Animated.Text style={[styles.caption, captionStyle]}>{hint}</Animated.Text>
      ) : null}
    </View>
  );
}

type VGpsLoaderProps = Readonly<{
  visible: boolean;
  hint?: string;
  captionReveal?: SharedValue<number>;
}>;

/**
 * The overlay used to be opaque, so it was replaced by the map in a single frame — the one hard
 * cut left in the wake sequence, and it landed exactly when the map's first frames arrive.
 * Fading it out lets the map settle underneath instead of being switched on. The fill is gone:
 * only the compact mark sits on top of the canvas.
 */
const FADE_MS = 220;
const MAP_MARK_HEIGHT = 120;

export function VGpsLoader({ visible, hint, captionReveal }: VGpsLoaderProps) {
  const fade = useSharedValue(visible ? 1 : 0);
  // Stays mounted for the length of the fade-out, then unmounts: an invisible overlay would
  // otherwise keep the SVG paths and an elevation layer alive for the whole trip.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      fade.value = withTiming(1, {
        duration: FADE_MS,
        easing: Easing.out(Easing.ease),
      });
      return;
    }

    fade.value = withTiming(
      0,
      { duration: FADE_MS, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) scheduleOnRN(setMounted, false);
      },
    );
  }, [visible, fade]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!mounted) return null;

  return (
    <Animated.View
      style={[styles.overlay, overlayStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityLabel="Chargement"
    >
      <VRouteMark height={MAP_MARK_HEIGHT} hint={hint} captionReveal={captionReveal} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 24,
    elevation: 24,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  mark: {
    alignItems: 'center',
    gap: 12,
  },
  caption: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
