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

type Props = {
  options?: string[] | null;
  vehicleType?: string | null;
  /** modal = light overlay; dark = dashboard bottomsheet */
  variant?: "modal" | "dark";
  /** Compact row — smaller icons */
  compact?: boolean;
  /** When false, icons are display-only (no press / no label expand) */
  interactive?: boolean;
  /** Only vehicle + selected options (hide grayed catalog) */
  selectedOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

function optionBorderColor(isSelected: boolean, isDark: boolean): string {
  if (isSelected) {
    return isDark ? "rgba(52,211,153,0.35)" : "rgba(5,150,105,0.35)";
  }
  return isDark ? "rgba(255,255,255,0.06)" : "rgba(148,163,184,0.35)";
}

export function RideOfferExtras({
  options,
  vehicleType,
  variant = "modal",
  compact = false,
  interactive = true,
  selectedOnly = false,
  style,
}: Readonly<Props>) {
  const [catalog, setCatalog] = useState<CatalogOptionPrice[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const selected = new Set(normalizeSelectedOptions(options));
  const vehicle = vehicleTypeLabel(vehicleType);
  const isDark = variant === "dark";

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

  const activeColor = isDark ? "#34d399" : "#059669";
  const mutedColor = isDark
    ? "rgba(148,163,184,0.45)"
    : "rgba(100,116,139,0.45)";
  const activeBg = isDark
    ? "rgba(16, 185, 129, 0.18)"
    : "rgba(255,255,255,0.92)";
  const mutedBg = isDark
    ? "rgba(15, 23, 42, 0.35)"
    : "rgba(255,255,255,0.55)";
  const iconSize = compact ? 12 : 15;
  const btnStyle = compact ? styles.iconBtnCompact : styles.iconBtn;
  const pillStyle = compact ? styles.expandPillCompact : styles.expandPill;

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
          color={activeColor}
        />
        {interactive && expandedKey === "vehicle" ? (
          <Text
            style={[
              styles.inlineLabel,
              isDark && styles.inlineLabelDark,
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
      {
        backgroundColor: activeBg,
        borderColor: optionBorderColor(true, isDark),
      },
    ];
    if (!interactive) {
      return (
        <View key="vehicle" style={boxStyle} pointerEvents="none">
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
                color={isSelected ? activeColor : mutedColor}
              />
              {isExpanded ? (
                <Text
                  style={[
                    styles.inlineLabel,
                    isDark && styles.inlineLabelDark,
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
              backgroundColor: isSelected ? activeBg : mutedBg,
              borderColor: optionBorderColor(isSelected, isDark),
              opacity: isSelected || isExpanded ? 1 : 0.5,
            },
          ];
          if (!interactive) {
            return (
              <View key={item.name} style={boxStyle} pointerEvents="none">
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
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  iconBtnCompact: {
    width: 22,
    height: 22,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  expandPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    gap: 5,
    maxWidth: 160,
  },
  expandPillCompact: {
    flexDirection: "row",
    alignItems: "center",
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    maxWidth: 140,
  },
  inlineLabel: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "600",
    flexShrink: 1,
  },
  inlineLabelCompact: {
    fontSize: 10,
  },
  inlineLabelDark: {
    color: "#e2e8f0",
  },
  labelMuted: {
    opacity: 0.7,
    fontWeight: "500",
  },
});
