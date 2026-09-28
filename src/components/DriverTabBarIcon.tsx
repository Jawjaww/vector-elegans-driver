import React from 'react';
import { FeatherGlyph } from './FeatherGlyph';
import type { FeatherGlyphName } from '../lib/featherGlyphs';

const INACTIVE = 'rgba(255, 255, 255, 0.38)';

type DriverTabBarIconProps = Readonly<{
  name: FeatherGlyphName;
  focused: boolean;
  size?: number;
}>;

/**
 * A tab glyph: painted with the accent gradient while its tab is the selected one, dim otherwise.
 *
 * The label beside it stays white on purpose. Blue at 11 px sits under 4.5:1 on the chrome, so the
 * *colour* is carried by the glyph — large enough to take it — and the *legibility* by the text.
 */
export function DriverTabBarIcon({
  name,
  focused,
  size = 22,
}: DriverTabBarIconProps) {
  return (
    <FeatherGlyph name={name} size={size} color={focused ? undefined : INACTIVE} />
  );
}
