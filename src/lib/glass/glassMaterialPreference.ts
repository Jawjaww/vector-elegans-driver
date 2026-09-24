import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_GLASS_MATERIAL,
  GLASS_MATERIALS,
  type GlassMaterial,
  type GlassMaterialName,
} from '../theme';

/**
 * Which glass the panels above the map are made of.
 *
 * The two materials exist so the choice can be made on a phone rather than in a review — a
 * reflection over a live map is not something a screenshot settles. This module is the switch
 * and nothing else: once the choice is made the losing material is deleted, and this file goes
 * with it.
 */
const STORAGE_KEY = 've.glassMaterial.v1';

/**
 * A persisted name, or the default. Never throws, never returns an unknown name.
 *
 * Read through a guard rather than trusted: `zustand`'s persist rehydrates whatever string was
 * last written, and a name that no longer exists in `GLASS_MATERIALS` would index to
 * `undefined` inside `GlassPanel` and blank every overlay at once. A stale key from a rename is
 * exactly the kind of thing that survives an OTA, since storage is not cleared by one.
 */
export function resolveGlassMaterialName(name: unknown): GlassMaterialName {
  return typeof name === 'string' && name in GLASS_MATERIALS
    ? (name as GlassMaterialName)
    : DEFAULT_GLASS_MATERIAL;
}

type GlassMaterialState = {
  material: GlassMaterialName;
  setMaterial: (material: GlassMaterialName) => void;
};

export const useGlassMaterialStore = create<GlassMaterialState>()(
  persist(
    (set) => ({
      material: DEFAULT_GLASS_MATERIAL,
      setMaterial: (material) =>
        set({ material: resolveGlassMaterialName(material) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Only the choice is persisted; the setter is rebuilt on every boot.
      partialize: (state) => ({ material: state.material }),
      // A corrupt or renamed value falls back to the default instead of leaving the store on a
      // material that does not exist.
      merge: (persisted, current) => ({
        ...current,
        material: resolveGlassMaterialName(
          (persisted as Partial<GlassMaterialState> | undefined)?.material,
        ),
      }),
    },
  ),
);

/** The material every overlay is drawn on, resolved from the driver's choice. */
export function useGlassMaterial(): GlassMaterial {
  const material = useGlassMaterialStore((state) =>
    resolveGlassMaterialName(state.material),
  );
  return GLASS_MATERIALS[material];
}

/** i18n key of a material's label, for the switch row. */
export function glassMaterialLabelKey(name: GlassMaterialName): string {
  return `profile.overlayStyle.${name}`;
}

/**
 * The material a tap on the row moves to.
 *
 * Toggling rather than opening a picker: there are exactly two, the row exists for one
 * comparison, and a picker for two options costs a modal and a decision where the driver wants
 * to be looking at the map. Returns the *other* name, so the row cannot land on the one already
 * showing and read as a dead control.
 */
export function nextGlassMaterialName(
  name: GlassMaterialName,
): GlassMaterialName {
  return name === 'dark' ? 'light' : 'dark';
}
