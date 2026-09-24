import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GLASS_MATERIAL } from '../lib/theme';

type GlassPanelProps = Readonly<{
  children?: React.ReactNode;
  /**
   * Corner radius.
   *
   * Required rather than defaulted, and handed to every layer: a highlight has to follow the
   * exact curve it is outlining, and a panel that rounds its corners by one amount while its
   * outline rounds them by another reads as two plates sliding against each other. A prop rather
   * than a utility class, because the callers pass 16, 18, 24 and 999 and a static class cannot
   * express a value the caller chooses.
   */
  radius: number;
  style?: StyleProp<ViewStyle>;
}>;

/** The band the rim and the edge glows live in. */
const EDGE_PX = 1;

/** Two stops: the glow at its origin, gone by `edgeFade`. */
const EDGE_COLORS = [GLASS_MATERIAL.edgeGlow, 'transparent'] as const;
const EDGE_LOCATIONS = [0, GLASS_MATERIAL.edgeFade] as const;

/**
 * The glass panel every overlay above the map is drawn on.
 *
 * The material is described layer by layer in `GLASS_MATERIAL`, including why the edge treatment
 * is two thin directional bars rather than lit corners and why the rim is dark. This component is
 * only the painting order, and the order is load-bearing: the glows go over the body so they read
 * as light landing on the surface, and the children go last so no layer covers them.
 *
 * **Layout is NativeWind; the material cannot be.** The structural classes (`absolute inset-0`,
 * `m-px`, `overflow-hidden`) live here as `className`, following the rest of the app. The
 * material stays in the theme, and the reason is mechanical rather than stylistic:
 * `LinearGradient` takes its stops as a JS array, and `borderRadius` and `borderColor` are values
 * the caller chooses at runtime. A utility class is static, so expressing them as one would mean
 * a class per radius — and moving the palette into `tailwind.config.js` would duplicate it in a
 * second place while still not reaching the gradient stops.
 *
 * The body is inset by `EDGE_PX` so the rim has a band of its own to occupy — with the body and
 * the rim on the same pixels the outline would tint the body's own first row instead of sitting
 * around it. The glows are inside the body, so the body's `overflow: 'hidden'` clips them to the
 * corner curve rather than letting a straight bar poke past it.
 *
 * **Nothing here animates and nothing blurs**, so the whole thing costs one paint: a handful of
 * views and three static gradients. That is the entire reason a reflection this elaborate is
 * affordable over a map that never stops moving. `expo-blur` is deliberately absent, and not only
 * for cost — on Android it defaults to `BlurMethod.NONE` and paints a flat tint, so it would buy
 * nothing even where the frame budget allowed it.
 *
 * The shadow lives on the wrapper rather than the body because iOS drops a shadow wherever
 * `overflow: 'hidden'` is set, and the glows need that clipping. Splitting the two costs one view
 * and keeps both effects working on both platforms.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  const material = GLASS_MATERIAL;
  // The rim is the outermost ring, so the body sits one point inside its radius.
  const bodyRadius = radius - EDGE_PX;

  return (
    <View
      style={[
        {
          borderRadius: radius,
          // What Android derives the elevation outline from. Translucent on purpose: an opaque
          // base here would hide the map behind the gradient and turn the pane back into a
          // painted slab, which is what the face was rejected for twice.
          backgroundColor: material.bodyBase,
          shadowColor: material.shadow.color,
          shadowOffset: { width: 0, height: material.shadow.offsetY },
          shadowOpacity: material.shadow.opacity,
          shadowRadius: material.shadow.radius,
          elevation: 6,
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        className="absolute inset-0 border"
        style={{ borderRadius: radius, borderColor: material.rim }}
      />
      <View className="overflow-hidden m-px" style={{ borderRadius: bodyRadius }}>
        <LinearGradient
          colors={material.body}
          start={material.bodyStart}
          end={material.bodyEnd}
          // Rounded *and* clipped. The wrapper's `overflow: hidden` is meant to cut this to the
          // corner curve, and on Android that clip does not reliably reach a native gradient
          // view: an uncut body paints its own square corners over the map, which is the lighter
          // rectangle the driver reported. Carrying the radius on the layer itself costs nothing
          // and does not depend on the clip being honoured.
          style={[StyleSheet.absoluteFill, { borderRadius: bodyRadius }]}
          pointerEvents="none"
        />
        {/* The whole border treatment: two hairlines leaving one corner, each fading out. Only
            the top and left edges are lit, because a fourth bar on the bottom or right would
            turn the glow back into an outline. */}
        <LinearGradient
          colors={EDGE_COLORS}
          locations={EDGE_LOCATIONS}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.edgeTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={EDGE_COLORS}
          locations={EDGE_LOCATIONS}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.edgeLeft}
          pointerEvents="none"
        />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  edgeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: GLASS_MATERIAL.edgeThickness,
  },
  edgeLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: GLASS_MATERIAL.edgeThickness,
  },
});
