import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { offerPaymentBadge } from '../lib/utils/offerPayment';

/**
 * L'icône de paiement de la carte d'offre, et son libellé au tap (F-01).
 *
 * Le chauffeur décide d'accepter en connaissance de cause : réclamer 30 € en liquide à l'arrivée
 * n'est pas le même métier que déposer un client qui a déjà payé. La règle qui choisit l'icône vit
 * dans `lib/utils/offerPayment.ts` (pure, testée) ; ici il n'y a que le rendu et l'interaction.
 *
 * Rien n'est affiché quand le mode est inconnu : inventer une icône ferait croire au chauffeur
 * qu'il sait.
 */

const AUTO_HIDE_MS = 5000;

/** Ambre = il y a de l'argent à réclamer, vert = c'est réglé, gris = rien à encaisser. */
const TONES = {
  cash: '#fbbf24',
  due: '#cbd5e1',
  paid: '#4ade80',
} as const;

export interface OfferPaymentBadgeProps {
  method?: string | null;
  status?: string | null;
}

export function OfferPaymentBadge({
  method,
  status,
}: Readonly<OfferPaymentBadgeProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const badge = offerPaymentBadge(method, status);

  // Le libellé se referme tout seul : la carte vit 20 s, un libellé ouvert ne doit pas rester
  // devant le prix pendant que le chauffeur conduit.
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => setOpen(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!badge) return null;

  const tint = TONES[badge.tone];

  return (
    <Pressable
      onPress={() => setOpen((value) => !value)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t(badge.labelKey)}
      testID="offer-payment-badge"
      style={styles.wrap}
    >
      <View style={styles.glyphs}>
        <Feather
          name={badge.icon === 'cash' ? 'dollar-sign' : 'credit-card'}
          size={14}
          color={tint}
        />
        {badge.settled ? (
          <Feather name="check" size={10} color={tint} style={styles.check} />
        ) : null}
      </View>
      {open ? (
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
          {t(badge.labelKey)}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  glyphs: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  check: {
    marginLeft: -3,
    marginTop: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
