import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGlassMaterial } from '../lib/glass/glassMaterialPreference';

type GlassPanelProps = Readonly<{
  children?: React.ReactNode;
  /**
   * Corner radius.
   *
   * Required rather than defaulted, and handed to every layer: the highlight has to follow the
   * exact curve it is outlining, and a panel that rounds its corners by one amount while its rim
   * rounds them by another reads as two overlapping plates.
   */
  radius: number;
  style?: StyleProp<ViewStyle>;
}>;

/** The 1px band the outer ring and the inner bevel live in. */
const EDGE_PX = 1;

/**
 * The glass panel every overlay above the map is drawn on.
 *
 * The look is a stack of layers, and the stack is the point — see `GlassMaterial` for what each
 * one contributes and why a single fill cannot stand in for them. Painted in this order:
 *
 * 1. the ring on the wrapper, which is why the body is inset by `EDGE_PX`: the glow sits in the
 *    band the body leaves free, so it is a ring around the panel rather than a brighter seam on
 *    top of it;
 * 2. the body gradient;
 * 3. the sheen;
 * 4. the inner bevel, inset again — it says the panel has thickness where the rim only says it
 *    has an edge;
 * 5. the specular rim, on the body's own edge.
 *
 * **Nothing here animates and nothing blurs**, so the whole thing costs one paint: a handful of
 * views and two static gradients. That is the entire reason a reflection this elaborate is
 * affordable over a map that never stops moving. `expo-blur` is deliberately absent, and not
 * only for cost — on Android it defaults to `BlurMethod.NONE` and paints a flat tint, so it
 * would buy nothing even where the frame budget allowed it.
 *
 * The shadow lives on the wrapper rather than the body because iOS drops a shadow wherever
 * `overflow: 'hidden'` is set, and the sheen needs that clipping to stay inside the corners.
 * Splitting the two costs one view and keeps both effects working on both platforms.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  const material = useGlassMaterial();
  // Each ring is inset one pixel inside the one above it, and its radius has to shrink with it
  // or the curves cross.
  const bodyRadius = radius - EDGE_PX;
  const bevelRadius = radius - 2 * EDGE_PX;

  return (
    <View
      style={[
        styles.shadow,
        {
          borderRadius: radius,
          // Opaque, and the only opaque thing here: Android derives the elevation outline from
          // it, and a shadow cast by a translucent view has no outline to project.
          backgroundColor: material.bodyBase,
          shadowOffset: { width: 0, height: material.shadow.offsetY },
          shadowOpacity: material.shadow.opacity,
          shadowRadius: material.shadow.radius,
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.ring,
          { borderRadius: radius, borderColor: material.halo },
        ]}
      />
      <View
        style={[
          styles.body,
          { borderRadius: bodyRadius, backgroundColor: material.bodyBase },
        ]}
      >
        <LinearGradient
          colors={material.body}
          start={material.bodyStart}
          end={material.bodyEnd}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <LinearGradient
          colors={material.sheen}
          locations={material.sheenLocations}
          start={material.sheenStart}
          end={material.sheenEnd}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          pointerEvents="none"
          style={[
            styles.bevel,
            {
              borderRadius: bevelRadius,
              // Only the top and bottom edges: the sides are the rim's to light, and a bevel on
              // all four would flatten the contrast the reflection depends on.
              borderTopColor: material.bevelTop,
              borderBottomColor: material.bevelBottom,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              borderRadius: bodyRadius,
              // The whole reflection, in four lines: two opposite arcs catch the light and the
              // other two fall away from it. Colours come from the material so a call site
              // cannot light the wrong pair.
              borderTopColor: material.edgeLit,
              borderLeftColor: material.edgeLit,
              borderBottomColor: material.edgeDim,
              borderRightColor: material.edgeDim,
            },
          ]}
        />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    elevation: 6,
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: EDGE_PX,
  },
  body: {
    // Inset by one pixel, not absolutely positioned: the wrapper has to keep sizing itself from
    // its children, and an absolutely positioned body would collapse it to nothing.
    margin: EDGE_PX,
    overflow: 'hidden',
  },
  bevel: {
    position: 'absolute',
    top: EDGE_PX,
    left: EDGE_PX,
    right: EDGE_PX,
    bottom: EDGE_PX,
    borderWidth: EDGE_PX,
  },
});
