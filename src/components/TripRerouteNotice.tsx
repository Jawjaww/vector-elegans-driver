import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from './GlassPanel';
import { GLASS_MATERIAL } from '../lib/theme';
import { OVERLAY_CARD_RADIUS } from '../lib/utils/overlayLane';

/**
 * Occupies the maneuver card's slot while a reroute is in flight.
 *
 * The stale turn instruction would otherwise keep naming a road the driver has left. Same glass,
 * same top anchor, same z-index: swapping the card rather than stacking a second one is what
 * keeps the windscreen to one sentence.
 */
export function TripRerouteNotice() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const material = GLASS_MATERIAL;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 12,
        right: 12,
        zIndex: 50,
        elevation: 50,
      }}
    >
      <GlassPanel
        radius={OVERLAY_CARD_RADIUS}
        style={{ backgroundColor: material.fillTop }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Feather name="refresh-cw" size={30} color={material.accentStrong} />
          <Text
            numberOfLines={2}
            style={{
              color: material.text,
              fontSize: 18,
              lineHeight: 24,
              fontWeight: '600',
              flexShrink: 1,
            }}
          >
            {t('nav.reroute')}
          </Text>
        </View>
      </GlassPanel>
    </View>
  );
}
