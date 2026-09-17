import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { OFFER_NOTICE_COPY } from '../lib/offerNoticeCopy';
import type { OfferNotice } from '../lib/utils/offerOpenOutcome';

/**
 * Bottomsheet notice explaining why a ride opened from a notification cannot be
 * offered. Shown in the `notices` palier, next to the dossier banners, with a
 * redirect only when the driver can actually act on the reason.
 */
export function OfferNoticeCard({
  notice,
  onDismiss,
  onOpenProfile,
  onOpenRides,
}: Readonly<{
  notice: OfferNotice;
  onDismiss: () => void;
  onOpenProfile: () => void;
  onOpenRides: () => void;
}>) {
  const { t } = useTranslation();
  const copy = OFFER_NOTICE_COPY[notice.reason];
  const cta = copy.cta;
  const onCtaPress = cta?.target === 'profile' ? onOpenProfile : onOpenRides;

  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ paddingVertical: 10, paddingHorizontal: 4 }}>
        <View className="flex-row items-center gap-2.5">
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: copy.accentBackground,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={copy.icon} size={14} color={copy.accent} />
          </View>
          <View className="flex-1">
            <Text
              className="text-sm font-bold mb-0.5"
              style={{ color: copy.accent }}
            >
              {t(copy.titleKey)}
            </Text>
            <Text
              className="text-xs font-medium"
              numberOfLines={3}
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              {t(copy.bodyKey)}
            </Text>
          </View>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('ride.offerNotice.dismiss')}
            hitSlop={12}
          >
            <Feather name="x" size={18} color={copy.accent} style={{ opacity: 0.8 }} />
          </Pressable>
        </View>
        {cta ? (
          <Pressable
            onPress={onCtaPress}
            accessibilityRole="button"
            style={{ marginTop: 8, marginLeft: 38 }}
          >
            <Text className="text-xs font-bold" style={{ color: copy.accent }}>
              {t(cta.labelKey)}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
