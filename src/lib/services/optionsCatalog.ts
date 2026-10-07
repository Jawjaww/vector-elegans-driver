import { supabase } from "../supabase";

export type CatalogOptionPrice = {
  name: string;
  price: number;
  available: boolean;
};

const LEGACY_OPTION_ALIASES: Record<string, string> = {
  childSeat: "Siège enfant",
  child_seat: "Siège enfant",
  "Siège bébé": "Siège enfant",
  petFriendly: "Animaux domestiques",
  pet_friendly: "Animaux domestiques",
  pets: "Animaux domestiques",
  boissons: "Boissons premium",
  accueil: "Accueil personnalisé",
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  STANDARD: "Berline Standard",
  PREMIUM: "Berline Premium",
  VAN: "Van",
  ELECTRIC: "Électrique",
};

let catalogCache: CatalogOptionPrice[] | null = null;
let catalogPromise: Promise<CatalogOptionPrice[]> | null = null;

export function normalizeOptionName(key: string): string {
  return LEGACY_OPTION_ALIASES[key] ?? key;
}

export function normalizeSelectedOptions(
  selected: string[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const raw of selected ?? []) {
    const name = normalizeOptionName(raw);
    if (name) seen.add(name);
  }
  return [...seen];
}

export function vehicleTypeLabel(vehicleType: string | null | undefined): string {
  if (!vehicleType) return "";
  return VEHICLE_TYPE_LABELS[vehicleType] ?? vehicleType;
}

/** MaterialCommunityIcons — car / limo / van / electric (not Feather truck) */
export function vehicleTypeIconName(
  vehicleType: string | null | undefined,
): "car" | "car-limousine" | "van-passenger" | "car-electric" {
  switch ((vehicleType ?? "").toUpperCase()) {
    case "PREMIUM":
      return "car-limousine";
    case "VAN":
      return "van-passenger";
    case "ELECTRIC":
      return "car-electric";
    case "STANDARD":
    default:
      return "car";
  }
}

/** Feather icon name for a catalog option (read-only UI) */
export function optionFeatherIcon(
  optionName: string,
):
  | "user"
  | "heart"
  | "clock"
  | "coffee"
  | "wifi"
  | "smile"
  | "package" {
  const name = normalizeOptionName(optionName);
  switch (name) {
    case "Siège enfant":
      return "user";
    case "Animaux domestiques":
      return "heart";
    case "Attente aéroport":
      return "clock";
    case "Boissons premium":
      return "coffee";
    case "WiFi à bord":
      return "wifi";
    case "Accueil personnalisé":
      return "smile";
    default:
      return "package";
  }
}

export function formatOptionPriceLabel(price: number | undefined): string {
  if (price == null) return "";
  if (price <= 0) return "Inclus";
  return `+${price.toFixed(0)} €`;
}

/**
 * Le libelle d'une pastille d'option sur la carte de course : le nom et, quand le catalogue le
 * connait, son prix — le meme format que la carte chauffeur Next.js (`RideOfferExtras` :
 * `` `${name} · ${price}` ``). Le nom seul n'est pas un echec : le catalogue cloud porte encore
 * des cles historiques, et un nom qui ne s'y resout pas ne doit pas se voir inventer un « +0 € ».
 */
export function optionChipLabel(name: string, price: number | undefined): string {
  const priceLabel = formatOptionPriceLabel(price);
  return priceLabel ? `${name} · ${priceLabel}` : name;
}

export async function listOptionsCatalog(
  forceRefresh = false,
): Promise<CatalogOptionPrice[]> {
  if (!forceRefresh && catalogCache !== null) return catalogCache;
  if (!forceRefresh && catalogPromise !== null) return catalogPromise;

  catalogPromise = (async () => {
    const { data, error } = await supabase
      .from("options")
      .select("name, price, available");

    if (error) {
      catalogPromise = null;
      throw new Error(error.message);
    }

    catalogCache = (data ?? []).map((row) => ({
      name: row.name,
      price: Number(row.price),
      available: Boolean(row.available),
    }));
    catalogPromise = null;
    return catalogCache;
  })();

  return catalogPromise;
}

export function lookupOptionPrice(
  catalog: CatalogOptionPrice[],
  optionName: string,
): number | undefined {
  const normalized = normalizeOptionName(optionName);
  const hit = catalog.find((o) => o.name === normalized);
  return hit?.price;
}
