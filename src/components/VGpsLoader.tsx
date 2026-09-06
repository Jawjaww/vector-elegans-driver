import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

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

type VGpsLoaderProps = Readonly<{
  visible: boolean;
  hint?: string;
}>;

export function VGpsLoader({ visible, hint }: VGpsLoaderProps) {
  const dashOffset = useSharedValue(PATH_LENGTH);
  const laneDash = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;

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
  }, [visible, dashOffset, laneDash]);

  const drawProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const laneProps = useAnimatedProps(() => ({
    strokeDashoffset: laneDash.value,
  }));

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto" accessibilityLabel="Chargement">
      <View style={styles.mark}>
        <Svg
          width="100%"
          height={260}
          viewBox="0 0 460 400"
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            <LinearGradient id="roadGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
              <Stop offset="50%" stopColor="#2563eb" stopOpacity="1" />
              <Stop offset="100%" stopColor="#1d4ed8" stopOpacity="1" />
            </LinearGradient>
            <LinearGradient id="roadEdge" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#0f172a" stopOpacity="1" />
              <Stop offset="100%" stopColor="#1e293b" stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {/* Contour / Bordure de route sombre */}
          <Path
            d={V_EXACT_PATH}
            stroke="#1e3a8a"
            strokeWidth={24}
            strokeOpacity={0.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Asphalte de la route */}
          <Path
            d={V_EXACT_PATH}
            stroke="url(#roadEdge)"
            strokeWidth={16}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Animation du tracé GPS néon */}
          <AnimatedPath
            d={V_EXACT_PATH}
            stroke="url(#roadGlow)"
            strokeWidth={11}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[PATH_LENGTH, PATH_LENGTH]}
            animatedProps={drawProps}
          />

          {/* Marquage central en pointillés */}
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
        <Text style={styles.caption}>{hint ?? 'Chargement en cours…'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  mark: {
    alignItems: 'center',
    gap: 20,
    width: '100%',
    maxWidth: 340,
  },
  caption: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});