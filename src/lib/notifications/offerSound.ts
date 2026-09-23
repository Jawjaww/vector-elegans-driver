/**
 * The offer ringtone the driver chose, and how that choice reaches the two things that can
 * make a sound.
 *
 * There are two independent players, and they must agree or the sound depends on which path the
 * offer took: the native ring on the silent-wake path, and the Android `rides` notification
 * channel on the tap path. The channel is the awkward one — Android gives an app no way to change
 * a channel's sound in place.
 *
 * `default` means the driver never chose: the system notification sound is used, which is what
 * the app did before the picker existed. `silent` is a real answer, not a missing one, and is
 * preserved as such — a driver who picks "None" must not be handed the default back.
 */

export type OfferSoundState =
  | { kind: 'default' }
  | { kind: 'silent' }
  | { kind: 'custom'; uri: string };

/**
 * Read the native module's answer.
 *
 * Three states have to survive the round trip, so `configured` is carried separately from
 * `uri`: "never chosen" and "chose None" both have no URI, and collapsing them is precisely how
 * a driver's silence would be turned back into a ring.
 */
export function offerSoundStateFromNative(
  raw: Record<string, unknown> | null,
): OfferSoundState {
  if (!raw || raw.configured !== true) return { kind: 'default' };
  if (raw.silent === true) return { kind: 'silent' };
  const uri = typeof raw.uri === 'string' ? raw.uri : '';
  return uri.length > 0 ? { kind: 'custom', uri } : { kind: 'silent' };
}

/**
 * The `sound` value for the Android `rides` channel.
 *
 * `null` is expo-notifications' way of saying "this channel is silent", and `'default'` means the
 * system notification sound — the two are different requests, which is why this cannot be
 * expressed as a plain optional string on the state itself.
 */
export function rideChannelSound(state: OfferSoundState): string | null {
  if (state.kind === 'silent') return null;
  if (state.kind === 'custom') return state.uri;
  return 'default';
}

/** The choice as an operator would read it back, for the profile row and the alerts. */
export function offerSoundLabel(state: OfferSoundState): string {
  if (state.kind === 'silent') return 'Aucun son';
  if (state.kind === 'custom') return 'Sonnerie choisie';
  return 'Sonnerie par défaut du téléphone';
}

export type OfferSoundPickResult =
  | { outcome: 'picked' }
  | { outcome: 'cancelled' }
  | { outcome: 'unavailable' };

/**
 * Classify the picker's return value.
 *
 * `unavailable` is not a failure: `ACTION_RINGTONE_PICKER` is absent on some ROMs, and the
 * contract reports that as a refusal. Treating it as an error would either crash or silently
 * drop the row, when what the driver needs is to be told the choice is not offered on their
 * phone and that the system sound stays in place.
 */
export function classifyOfferSoundPick(
  raw: Record<string, unknown> | null,
): OfferSoundPickResult {
  if (!raw) return { outcome: 'unavailable' };
  if (raw.picked === true) return { outcome: 'picked' };
  if (raw.reason === 'unavailable') return { outcome: 'unavailable' };
  return { outcome: 'cancelled' };
}
