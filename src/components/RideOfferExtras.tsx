import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  formatOptionPriceLabel,
  listOptionsCatalog,
  lookupOptionPrice,
  normalizeSelectedOptions,
  optionFeatherIcon,
  vehicleTypeIconName,
  vehicleTypeLabel,
  type CatalogOptionPrice,
} from "../lib/services/optionsCatalog";
import { VE_BLUE } from "../lib/theme";
import { AccentOutline } from "./AccentOutline";

type Props = {
  options?: string[] | null;
  vehicleType?: string | null;
  /** Compact row — smaller icons */
  compact?: boolean;
  /** When false, icons are display-only (no press / no label expand) */
  interactive?: boolean;
  /** Only vehicle + selected options (hide grayed catalog) */
  selectedOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The chips a ride's options sit in, on the one surface that has them: the dark offer card.
 *
 * There used to be a `variant` prop with a light palette for a `modal` overlay, and no caller
 * ever asked for it — both call sites, the full-screen offer card and the home sheet's deferred
 * card, pass the dark one. Two palettes for one surface is also how "which green?" becomes a
 * question, so the light set is gone rather than left for a caller that does not exist.
 *
 * The accent is the app's blue and not `theme.colors.accent`, because on an offer card the
 * emerald already means *money* — the fare, the bonus. An option chip in the same green reads as
 * a price, and the two kinds of statement would be indistinguishable at a glance.
 */
const SELECTED_BG = `${VE_BLUE.base}${VE_BLUE.tintAlpha}`;
/** On a dark tinted chip a glyph has to come *up* in value to be seen, so it takes the light stop. */
const SELECTED_ICON = VE_BLUE.glyphGradient[0];
const MUTED_ICON = "rgba(148,163,184,0.45)";
const MUTED_BG = "rgba(15, 23, 42, 0.35)";
const MUTED_BORDER = "rgba(255,255,255,0.06)";
/**
 * The gradient contour of a selected chip is stroked by `AccentOutline`, so the border this style
 * used to colour is left in place at zero alpha: it is what gives the chip its size, and dropping
 * it would resize every selected chip by two points.
 */
const OUTLINED_BORDER = "transparent";
/** `borderRadius` of the box styles below, which is also the outline's corner radius. */
const CHIP_RADIUS = 7;
const CHIP_RADIUS_COMPACT = 5;

export function RideOfferExtras({
  options,
  vehicleType,
  compact = false,
  interactive = true,
  selectedOnly = false,
  style,
}: Readonly<Props>) {
  const [catalog, setCatalog] = useState<CatalogOptionPrice[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const selected = new Set(normalizeSelectedOptions(options));
  const vehicle = vehicleTypeLabel(vehicleType);

  useEffect(() => {
    let mounted = true;
    listOptionsCatalog()
      .then((rows) => {
        if (mounted) setCatalog(rows.filter((r) => r.available !== false));
      })
      .catch(() => {
        if (mounted) setCatalog([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const catalogItems = (() => {
    if (selectedOnly) {
      return [...selected].map((name) => ({
        name,
        price: lookupOptionPrice(catalog, name) ?? 0,
        available: true,
      }));
    }
    if (catalog.length > 0) return catalog;
    return [...selected].map((name) => ({
      name,
      price: 0,
      available: true,
    }));
  })();

  if (!vehicle && catalogItems.length === 0) return null;

  const iconSize = compact ? 12 : 15;
  const btnStyle = compact ? styles.iconBtnCompact : styles.iconBtn;
  const pillStyle = compact ? styles.expandPillCompact : styles.expandPill;
  const chipRadius = compact ? CHIP_RADIUS_COMPACT : CHIP_RADIUS;
  /**
   * The accent contour of a selected chip, stroked over its face.
   *
   * A hairline on the compact chips: they are 22 points tall, and the weight that reads as an edge
   * on a button reads as a frame on something that size. Non-compact keeps a full point.
   */
  const outline = (
    <AccentOutline radius={chipRadius} thickness={compact ? 0.75 : 1} />
  );

  const toggleLabel = (key: string) => {
    if (!interactive) return;
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const labelForKey = (key: string): string => {
    if (key === "vehicle") return vehicle;
    const price = lookupOptionPrice(catalog, key);
    const priceLabel = formatOptionPriceLabel(price);
    const base = priceLabel ? `${key} · ${priceLabel}` : key;
    if (!selected.has(key)) return `${base} · non demandé`;
    return base;
  };

  const renderVehicle = () => {
    if (!vehicle) return null;
    const body = (
      <>
        <MaterialCommunityIcons
          name={vehicleTypeIconName(vehicleType)}
          size={iconSize}
          color={SELECTED_ICON}
        />
        {interactive && expandedKey === "vehicle" ? (
          <Text
            style={[
              styles.inlineLabel,
              compact && styles.inlineLabelCompact,
            ]}
            numberOfLines={1}
          >
            {labelForKey("vehicle")}
          </Text>
        ) : null}
      </>
    );
    const boxStyle = [
      interactive && expandedKey === "vehicle" ? pillStyle : btnStyle,
      { backgroundColor: SELECTED_BG, borderColor: OUTLINED_BORDER },
    ];
    if (!interactive) {
      return (
        <View key="vehicle" style={boxStyle} pointerEvents="none">
          {outline}
          {body}
        </View>
      );
    }
    return (
      <Pressable
        key="vehicle"
        onPress={() => toggleLabel("vehicle")}
        style={boxStyle}
        accessibilityRole="button"
        accessibilityLabel={vehicle}
      >
        {outline}
        {body}
      </Pressable>
    );
  };

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact, style]}
      pointerEvents={interactive ? "auto" : "none"}
    >
      <View
        style={[
          styles.iconRow,
          !compact && styles.iconRowSingleLine,
          compact && styles.iconRowCompact,
        ]}
      >
        {renderVehicle()}

        {catalogItems.map((item) => {
          const isSelected = selected.has(item.name);
          const isExpanded = interactive && expandedKey === item.name;
          const body = (
            <>
              <Feather
                name={optionFeatherIcon(item.name)}
                size={iconSize}
                color={isSelected ? SELECTED_ICON : MUTED_ICON}
              />
              {isExpanded ? (
                <Text
                  style={[
                    styles.inlineLabel,
                    compact && styles.inlineLabelCompact,
                    !isSelected && styles.labelMuted,
                  ]}
                  numberOfLines={1}
                >
                  {labelForKey(item.name)}
                </Text>
              ) : null}
            </>
          );
          const boxStyle = [
            isExpanded ? pillStyle : btnStyle,
            {
              backgroundColor: isSelected ? SELECTED_BG : MUTED_BG,
              // A selected chip is outlined by the stroke instead — see `OUTLINED_BORDER`. An
              // unselected one keeps the neutral hairline, because the gradient is what says
              // "this ride has it" and must not appear on a chip that does not.
              borderColor: isSelected ? OUTLINED_BORDER : MUTED_BORDER,
              opacity: isSelected || isExpanded ? 1 : 0.5,
            },
          ];
          if (!interactive) {
            return (
              <View key={item.name} style={boxStyle} pointerEvents="none">
                {isSelected ? outline : null}
                {body}
              </View>
            );
          }
          return (
            <Pressable
              key={item.name}
              onPress={() => toggleLabel(item.name)}
              style={boxStyle}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityState={{ selected: isSelected }}
            >
              {isSelected ? outline : null}
              {body}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  wrapCompact: {
    alignSelf: "flex-start",
  },
  iconRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  iconRowSingleLine: {
    flexWrap: "nowrap",
    gap: 5,
  },
  iconRowCompact: {
    gap: 3,
    flexWrap: "nowrap",
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: CHIP_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  iconBtnCompact: {
    width: 22,
    height: 22,
    borderRadius: CHIP_RADIUS_COMPACT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  expandPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 28,
    paddingHorizontal: 8,
    borderRadius: CHIP_RADIUS,
    borderWidth: 1,
    gap: 5,
    maxWidth: 160,
  },
  expandPillCompact: {
    flexDirection: "row",
    alignItems: "center",
    height: 22,
    paddingHorizontal: 6,
    borderRadius: CHIP_RADIUS_COMPACT,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    maxWidth: 140,
  },
  inlineLabel: {
    fontSize: 11,
    color: "#e2e8f0",
    fontWeight: "600",
    flexShrink: 1,
  },
  inlineLabelCompact: {
    fontSize: 10,
  },
  labelMuted: {
    opacity: 0.7,
    fontWeight: "500",
  },
});
