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
 * Highway “V” road:
 * left hairpin → left freeway leg → deep apex → right freeway leg →
 * one interchange on-ramp loop (bretelle) → merge exit onto the other highway.
 * viewBox 0 0 460 400 — room for wide road stroke.
 */
const V_GPS_PATH =
  // Bretelle / virage d’entrée (haut gauche)
  'M 82 82 ' +
  'C 58 82 48 60 58 40 ' +
  'C 68 20 96 18 110 38 ' +
  'C 120 52 116 72 100 82 ' +
  'C 92 88 86 86 82 82 ' +
  // Autoroute — jambe gauche du V
  'C 102 120 126 170 148 224 ' +
  'C 166 268 180 316 190 354 ' +
  // Virage en fond de vallée
  'C 198 376 218 390 242 390 ' +
  'C 266 390 286 374 298 346 ' +
  // Autoroute — jambe droite (ligne principale)
  'C 316 306 330 258 344 210 ' +
  'C 354 176 364 142 372 118 ' +
  // Bretelle de raccordement (UNE boucle d’échangeur, pas des tours)
  // sortie de la voie → arc large → croise / rejoint l’autre axe
  'C 386 88 418 78 432 108 ' +
  'C 444 132 430 158 402 162 ' +
  'C 384 164 372 152 370 136 ' +
  // Fusion sur l’autre autoroute (sortie nette, direction changée)
  'C 368 122 382 114 400 116 ' +
  'L 428 124';

const PATH_LENGTH = 1020;

type VGpsLoaderProps = Readonly<{
  visible: boolean;
  hint?: string;
}>;

/** Full-bleed map overlay: progressive blue GPS highway “V”. */
export function VGpsLoader({ visible, hint }: VGpsLoaderProps) {
  const dashOffset = useSharedValue(PATH_LENGTH);
  const laneDash = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;

    dashOffset.value = PATH_LENGTH;
    dashOffset.value = withRepeat(
      withSequence(
        withTiming(0, {
          duration: 3600,
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
    <View
      style={styles.overlay}
      pointerEvents="auto"
      accessibilityLabel="Chargement de la carte"
    >
      <View style={styles.mark}>
        <Svg
          width="100%"
          height={240}
          viewBox="0 0 460 400"
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            <LinearGradient id="veGpsBlue" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#93c5fd" stopOpacity="1" />
              <Stop offset="40%" stopColor="#3b82f6" stopOpacity="1" />
              <Stop offset="100%" stopColor="#1e3a8a" stopOpacity="1" />
            </LinearGradient>
            <LinearGradient id="veGpsEdge" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#1e40af" stopOpacity="0.9" />
              <Stop offset="100%" stopColor="#172554" stopOpacity="0.95" />
            </LinearGradient>
          </Defs>

          <Path
            d={V_GPS_PATH}
            stroke="url(#veGpsEdge)"
            strokeWidth={28}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <Path
            d={V_GPS_PATH}
            stroke="rgba(30, 58, 138, 0.45)"
            strokeWidth={22}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <AnimatedPath
            d={V_GPS_PATH}
            stroke="url(#veGpsBlue)"
            strokeWidth={18}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[PATH_LENGTH, PATH_LENGTH]}
            animatedProps={drawProps}
          />

          <AnimatedPath
            d={V_GPS_PATH}
            stroke="rgba(226, 232, 240, 0.92)"
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="butt"
            strokeLinejoin="round"
            strokeDasharray={[14, 14]}
            animatedProps={laneProps}
          />
        </Svg>
        <Text style={styles.caption}>{hint ?? 'Localisation…'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
    backgroundColor: 'rgba(232, 238, 244, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  mark: {
    alignItems: 'center',
    gap: 20,
    width: '100%',
    maxWidth: 320,
  },
  caption: {
    color: 'rgba(30, 64, 175, 0.7)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
});
