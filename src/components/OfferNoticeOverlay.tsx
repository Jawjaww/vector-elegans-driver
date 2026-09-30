import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { OFFER_NOTICE_COPY } from "../lib/offerNoticeCopy";
import type { OfferNotice } from "../lib/utils/offerOpenOutcome";
import { GLASS_MATERIAL } from "../lib/theme";
import {
  LANE_BASE_OFFSET,
  OVERLAY_CARD_RADIUS,
} from "../lib/utils/overlayLane";
import { GlassPanel } from "./GlassPanel";

/** How far the card rises as it fades in. A hint of arrival, not a slide. */
const NOTICE_RISE_PX = 10;

/** Entry duration. The offer card leaves instantly; the notice takes this long to follow it. */
const NOTICE_ENTER_MS = 220;

type OfferNoticeOverlayProps = Readonly<{
  notice: OfferNotice;
  /** Visible height of the bottom sheet the lane must clear (settled palier, not a boolean). */
  sheetVisibleH: number;
  onDismiss: () => void;
  onOpenProfile: () => void;
  onOpenHome: () => void;
}>;

/**
 * Why a ride opened from a notification cannot be offered, told over the map.
 *
 * It used to be a child of the `BottomSheet`, which meant its mere existence counted as a notice
 * and pulled the sheet up to the `notices` palier. Two consequences, both wrong: the sheet opened
 * for a message the driver had not asked for, and the message arrived *inside* the panel that was
 * simultaneously moving under it. Why a card could not be shown is map news — the same lane as
 * the instruction bar and the arrival chip — so it lives there now, and the sheet is left alone
 * (`noticeCount` no longer counts it).
 *
 * Distinct from the trip HUDs in one way that matters: those are read and never pressed, so they
 * are wholly transparent to touch. This card carries a dismiss control and, for the reasons the
 * driver can act on, a call to action, so the anchor is `box-none` and only the card itself
 * swallows a touch.
 *
 * Outside the map group, as a sibling between the offer stack and the sheet: that group is a
 * sealed stacking context, so an overlay inside it could not be lifted above the offer stack it
 * replaces. Below the sheet on purpose — a sheet the driver pulled up must win.
 *
 * Sitting outside the group has a second consequence, one that cost this card its face: the panel
 * measures itself against the map scene, and `measureLayout` only answers for a descendant. See
 * `GlassPanel` — the rect is rebased from window space instead, so the card is frosted and rimmed
 * like the instruction bar it shares the lane with.
 */
export function OfferNoticeOverlay({
  notice,
  sheetVisibleH,
  onDismiss,
  onOpenProfile,
  onOpenHome,
}: OfferNoticeOverlayProps) {
  const { t } = useTranslation();
  const material = GLASS_MATERIAL;
  const copy = OFFER_NOTICE_COPY[notice.reason];
  const cta = copy.cta;
  const onCtaPress = cta?.target === "profile" ? onOpenProfile : onOpenHome;

  const laneBottom = sheetVisibleH + LANE_BASE_OFFSET;

  // Mounted only while there is a notice (`app/(tabs)/index.tsx`), so the entry runs once and
  // there is nothing to animate out: the notice is dismissed or expires, and it is gone.
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(shown, {
      toValue: 1,
      duration: NOTICE_ENTER_MS,
      easing: Easing.out(Easing.cubic),
      // Layout `bottom`, so map frost and the card's published rect share one frame — the same
      // reason the guidance bar animates `bottom` rather than a native `translateY`.
      useNativeDriver: false,
    }).start();
  }, [shown]);

  const bottom = shown.interpolate({
    inputRange: [0, 1],
    outputRange: [laneBottom - NOTICE_RISE_PX, laneBottom],
  });

  return (
    <Animated.View
      // The anchor spans the lane; only the card is touchable, and the map underneath
      // stays pannable around it.
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom,
        // Layer scale on the home scene: map 0 → trip HUDs 15 → offer stack 30 → this card 34 →
        // sheet 40/41. Above the offer stack it replaces, below the sheet the driver raised.
        // Both fields: Android sorts siblings by elevation, iOS by zIndex.
        zIndex: 34,
        elevation: 34,
        opacity: shown,
      }}
    >
      <GlassPanel radius={OVERLAY_CARD_RADIUS}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Feather name={copy.icon} size={20} color={copy.ink} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  // The scale of the card this one stands in for: the guidance bar reads its
                  // sentence at 16 on 22 in the same lane, and the next-turn HUD sets its
                  // supporting street line at 15 on 20. A notice at 15 on 20 with a 13 pt body was
                  // a size below both, on the same pale face — which is a message read at a
                  // glance, from a phone on a mount, by someone who is not stopped.
                  color: copy.ink,
                  fontSize: 16,
                  lineHeight: 22,
                  fontWeight: "700",
                }}
              >
                {t(copy.titleKey)}
              </Text>
              <Text
                // Three lines carry every locale at this size on a 390 pt screen; the fourth is
                // the margin a 360 pt one needs for the longest body (`fr`, 85 characters), whose
                // last words are the instruction. Truncating them would be cutting the message.
                numberOfLines={4}
                style={{
                  color: material.textDim,
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: "500",
                }}
              >
                {t(copy.bodyKey)}
              </Text>
            </View>
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={t("ride.offerNotice.dismiss")}
              hitSlop={12}
            >
              <Feather name="x" size={18} color={material.textDim} />
            </Pressable>
          </View>
          {cta ? (
            <Pressable
              onPress={onCtaPress}
              accessibilityRole="button"
              style={{ marginLeft: 32 }}
            >
              <Text
                style={{ color: copy.ink, fontSize: 15, fontWeight: "700" }}
              >
                {t(cta.labelKey)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </GlassPanel>
    </Animated.View>
  );
}
