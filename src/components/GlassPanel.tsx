import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GLASS_OVERLAY } from '../lib/theme';

type GlassPanelProps = Readonly<{
  children?: React.ReactNode;
  /**
   * Corner radius.
   *
   * Required rather than defaulted, and handed to the rim as well as the body: the specular
   * arc has to follow the exact curve it is highlighting, and a panel that rounds its corners
   * by one amount while its highlight rounds them by another reads as two overlapping plates.
   */
  radius: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * The frosted panel every overlay above the map is drawn on.
 *
 * Three layers, all static — nothing here animates, so the cost is a one-off paint rather than
 * something paid on each frame the map moves:
 *
 * 1. the body, a translucent charcoal, plus an outer shadow in a second wrapper;
 * 2. a diagonal sheen, brightest top-left, which is what separates "glass" from "grey box";
 * 3. the specular rim, lit on the top-left and bottom-right arcs and dimmed on the other two.
 *
 * The shadow lives on a wrapper rather than on the panel because iOS drops a shadow wherever
 * `overflow: 'hidden'` is set, and the sheen needs that clipping to stay inside the corners.
 * Splitting the two costs one view and keeps both effects working on both platforms.
 *
 * `expo-blur` is deliberately absent — see `GLASS_OVERLAY` for why a backdrop blur is the
 * wrong tool over a live map.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  return (
    <View style={[styles.shadow, { borderRadius: radius }, style]}>
      <View style={[styles.clip, { borderRadius: radius }]}>
        <LinearGradient
          colors={[...GLASS_OVERLAY.sheen]}
          start={GLASS_OVERLAY.sheenStart}
          end={GLASS_OVERLAY.sheenEnd}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.rim,
            {
              borderRadius: radius,
              // The whole effect, in four lines: two opposite arcs catch the light and the
              // other two fall away from it. Colours come from the palette so a call site
              // cannot light the wrong pair.
              borderTopColor: GLASS_OVERLAY.edgeLit,
              borderLeftColor: GLASS_OVERLAY.edgeLit,
              borderBottomColor: GLASS_OVERLAY.edgeDim,
              borderRightColor: GLASS_OVERLAY.edgeDim,
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
    // Present only so Android can derive the elevation outline from the corner radius; the
    // visible fill is the inner layer's.
    backgroundColor: GLASS_OVERLAY.body,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 16,
    elevation: 6,
  },
  clip: {
    backgroundColor: GLASS_OVERLAY.body,
    overflow: 'hidden',
  },
  rim: {
    borderWidth: 1,
  },
});
