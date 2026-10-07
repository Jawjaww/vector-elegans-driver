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

/**
 * L'icône d'une option, alignée sur celle du portail Next.js (`lib/reservation/optionGlyphs.ts`).
 *
 * La règle est **copiée** telle quelle — normalisation puis recherche de sous-chaîne sur le nom en
 * minuscules — et non transposée en table de noms exacts : un nom de catalogue personnalisé doit
 * tomber dans la même famille visuelle des deux côtés. Les glyphes MaterialCommunityIcons sont les
 * équivalents des icônes Lucide du portail :
 *
 *   Baby → `baby-face-outline` (une tête, comme Lucide ; `baby` est un bébé qui rampe) ·
 *   PawPrint → `paw` · Plane → `airplane` · GlassWater → `cup-water` ·
 *   Wifi → `wifi` · Sparkles → `star-four-points` (le repli du portail est Sparkles, pas un colis).
 */
export type OptionIconName =
  | "baby-face-outline"
  | "paw"
  | "airplane"
  | "cup-water"
  | "wifi"
  | "star-four-points";

export function optionIcon(optionName: string): OptionIconName {
  const label = normalizeOptionName(optionName).toLowerCase();
  if (
    label.includes("siège") ||
    label.includes("enfant") ||
    label.includes("bébé")
  ) {
    return "baby-face-outline";
  }
  // Le pluriel compte : « animaux » ne contient pas « animal » (il finit en -aux, pas en -al), et
  // tester le singulier seul laissait « Animaux domestiques » sans règle — d'où le cœur générique.
  if (label.includes("animal") || label.includes("animaux")) return "paw";
  if (label.includes("aéroport") || label.includes("attente")) return "airplane";
  if (label.includes("boisson")) return "cup-water";
  if (label.includes("wifi")) return "wifi";
  if (label.includes("accueil")) return "star-four-points";
  return "star-four-points";
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
