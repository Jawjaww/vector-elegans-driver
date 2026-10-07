import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { VRouteMark } from '../src/components/VGpsLoader';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { supabase } from '../src/lib/supabase';
import {
  documentErrorMessageKey,
  toRideDocument,
  type RideDocument,
} from '../src/lib/utils/rideDocument';
import {
  SPECIMEN_DOCUMENT,
  SPECIMEN_MARKER,
} from '../src/lib/utils/documentSpecimen';
import {
  BOOKING_ORDER_SPECIMEN,
  bookingOrderRows,
  toBookingOrder,
  type BookingOrder,
} from '../src/lib/utils/bookingOrder';

/**
 * La facture ou le reçu d'une course (F-02), ouverte depuis l'historique.
 *
 * Trois états, et le troisième est le plus important : le document existe et s'affiche ; il
 * n'existe pas encore et le chauffeur peut le demander ; il ne peut pas être émis, et **on lui dit
 * pourquoi** — « la plateforme n'a pas encore renseigné son identité légale » n'est pas une panne,
 * c'est une information, et il n'y peut rien.
 */
export default function RideDocumentScreen() {
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [document, setDocument] = useState<RideDocument | null>(null);
  // Le BON DE COMMANDE est le document du chauffeur (D-25) : ce qui se presente au controle
  // routier, c'est la preuve d'une reservation prealable, pas une facture.
  const [bookingOrder, setBookingOrder] = useState<BookingOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showSpecimen, setShowSpecimen] = useState(false);

  const load = useCallback(async () => {
    if (!rideId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // UNE requête tant qu'il y a quelque chose à montrer. Le mode de paiement ne sert qu'à
      // choisir QUEL document demander : il ne se lit donc que s'il n'y a rien à afficher. Une
      // lecture à deux branches coûtait une requête sur chaque ouverture d'écran pour rien.
      // Le bon de commande d'abord : c'est le document que le chauffeur doit pouvoir montrer.
      // S'il existe, il n'y a rien d'autre a lire — une requete, pas trois.
      const orderResult = await supabase.rpc('get_ride_booking_order', {
        p_ride_id: rideId,
      });
      const order = toBookingOrder(orderResult.data);
      setBookingOrder(order);
      if (order) return;

      const docResult = await supabase
        .from('ride_documents')
        .select('*')
        .eq('ride_id', rideId)
        .limit(1)
        .maybeSingle();

      const parsed = docResult.data ? toRideDocument(docResult.data) : null;
      setDocument(parsed);

      if (!parsed) {
        const rideResult = await supabase
          .from('rides')
          .select('payment_method')
          .eq('id', rideId)
          .maybeSingle();
        setPaymentMethod(rideResult.data?.payment_method ?? null);
      }
    } catch {
      setMessage(t('rideDocuments.unknownError'));
    } finally {
      setLoading(false);
    }
  }, [rideId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Le bon document pour le bon encaissement : la plateforme facture ce qu'elle a encaissé, le
  // chauffeur reçoit un reçu pour ce qu'il a encaissé lui-même.
  const kind = paymentMethod === 'card' ? 'invoice' : 'receipt';
  // Le bon de commande du chauffeur, ou son spécimen. La facture reste le document COMPTABLE de la
  // plateforme (D-25) : elle garde son propre chemin, plus bas.
  const order = bookingOrder ?? BOOKING_ORDER_SPECIMEN;

  const issue = useCallback(async () => {
    if (!rideId) return;

    setIssuing(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('issue_ride_document', {
        p_ride_id: rideId,
        p_kind: kind,
      });

      if (error) {
        setMessage(t('rideDocuments.unknownError'));
        return;
      }

      const outcome = data as { success?: boolean; error?: string } | null;
      if (!outcome?.success) {
        setMessage(t(documentErrorMessageKey(outcome?.error)));
        return;
      }

      await load();
    } finally {
      setIssuing(false);
    }
  }, [rideId, kind, load, t]);

  return (
    // Le fond n'est PAS peint ici. Le layout racine monte AppChromeBackground et laisse le Stack
    // transparent ; cette vue peignait `bg-slate-950` (#020617, un gris BLEUTE), seul ecran de
    // l'app a le faire — c'est le « fond bleu bizarre » signale, et c'etait un ecart au design
    // system, pas un mystere de theme.
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}>
        <View className="pt-14 pb-6 flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="mr-3 p-1"
          >
            <Feather name="arrow-left" size={20} color="#e2e8f0" />
          </Pressable>
          <Text className="text-xl font-black text-white tracking-tight">
            {t('rideDocuments.title')}
          </Text>
        </View>

        {loading ? (
          <View className="py-10 items-center">
            <VRouteMark />
          </View>
        ) : bookingOrder || showSpecimen ? (
          <>
            <View
              className="rounded-xl px-3.5 py-3"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.05)',
              }}
            >
              {/*
                Le titre et la marque sur UNE ligne, la marque a droite : deux lignes pour un titre
                et un badge, c'est de la place perdue sur un document qu'on lit dans une voiture.
                Et les phrases qui n'apprennent rien sont parties — « justificatif de réservation
                préalable » (le titre le dit) et l'avertissement du spécimen (la marque suffit).
              */}
              <View className="flex-row items-center justify-between">
                <Text className="text-white text-base font-black tracking-tight">
                  {t('bookingOrder.title')}
                </Text>
                {order.specimen ? (
                  <View className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5">
                    <Text className="text-amber-300 text-[10px] font-black tracking-wider">
                      {SPECIMEN_MARKER}
                    </Text>
                  </View>
                ) : null}
              </View>
              {order.number ? (
                <Text className="text-slate-500 text-[11px] mt-0.5">
                  {t('bookingOrder.number')} {order.number}
                </Text>
              ) : null}
            </View>

            {/*
              Les sections suivent l'ordre de la loi : exploitant, chauffeur, client, course. Les
              lignes viennent du module pur, qui porte les mentions obligatoires — l'ecran ne
              decide ni de leur contenu ni de leur ordre.
            */}
            {(['operator', 'driver', 'client', 'ride'] as const).map((section) => {
              const rows = bookingOrderRows(order, i18n.language).filter(
                (row) => row.section === section,
              );
              if (rows.length === 0) return null;

              return (
                <View
                  key={section}
                  className="rounded-xl px-3.5 py-3 mt-2"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                    {t(`bookingOrder.section.${section}`)}
                  </Text>
                  {rows.map((row) => (
                    <Row
                      key={row.labelKey}
                      label={t(row.labelKey)}
                      value={row.value}
                      tone={row.tone}
                      stacked={STACKED_ROW_KEYS.includes(row.labelKey)}
                    />
                  ))}
                </View>
              );
            })}
          </>
        ) : (
          <View
            className="rounded-2xl p-5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.05)',
            }}
          >
            <Text className="text-slate-300 text-sm">
              {t(kind === 'invoice' ? 'rideDocuments.noInvoice' : 'rideDocuments.noReceipt')}
            </Text>
            <View className="flex-row gap-3 mt-4">
            <Pressable
              onPress={() => void issue()}
              disabled={issuing}
              accessibilityRole="button"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5"
            >
              <Text className="text-emerald-300 text-sm font-bold">
                {issuing
                  ? t('rideDocuments.issuing')
                  : t(kind === 'invoice' ? 'rideDocuments.askInvoice' : 'rideDocuments.askReceipt')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowSpecimen(true)}
              accessibilityRole="button"
              className="rounded-lg border border-white/15 px-4 py-2.5"
            >
              <Text className="text-slate-300 text-sm font-bold">
                {t('rideDocuments.seeSpecimen')}
              </Text>
            </Pressable>
            </View>
          </View>
        )}

        {message ? (
          <View className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
            <Text className="text-amber-200 text-sm">{message}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Une ligne du document.
 *
 * DEUX GABARITS, et le second repond a un defaut que j'avais introduit : en unifiant la densite, je
 * n'ai pas regarde la LONGUEUR des valeurs. Les deux lignes de trajet sont des adresses, et une
 * adresse ne tient pas sur une ligne a cote de son libelle — tronquee, elle ne dit plus ou l'on
 * prend le client, c'est-a-dire exactement la mention que le document existe pour porter. Elles
 * passent donc par le gabarit EMPILE, qui n'impose aucune limite de lignes.
 */
const STACKED_ROW_KEYS = ["bookingOrder.pickupAddress", "bookingOrder.dropoffAddress"];

function Row({
  label,
  value,
  strong,
  tone,
  stacked,
}: Readonly<{
  label: string;
  value: string;
  strong?: boolean;
  tone?: "warning";
  stacked?: boolean;
}>) {
  if (stacked) {
    // Aucun numberOfLines ici : une adresse s'ecrit en entier, sur autant de lignes qu'il faut.
    return (
      <View className="mb-1.5">
        <Text className="text-slate-400 text-[11px]">{label}</Text>
        <Text className="text-slate-200 text-[12px] mt-0.5">{value}</Text>
      </View>
    );
  }

  return (
    <View className="flex-row justify-between items-center mb-1">
      <Text className="text-slate-400 text-[11px]">{label}</Text>
      <Text
        className={
          tone === "warning"
            ? "text-amber-300 font-bold text-[12px]"
            : strong
              ? "text-white font-black text-sm"
              : "text-slate-200 text-[12px]"
        }
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
