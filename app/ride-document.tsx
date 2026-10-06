import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { supabase } from '../src/lib/supabase';
import {
  documentErrorMessageKey,
  toRideDocument,
  RIDE_DOCUMENT_LABEL_KEYS,
  type RideDocument,
} from '../src/lib/utils/rideDocument';
import {
  isSpecimen,
  SPECIMEN_DOCUMENT,
  SPECIMEN_MARKER,
} from '../src/lib/utils/documentSpecimen';

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
  const { t } = useTranslation();
  const router = useRouter();

  const [document, setDocument] = useState<RideDocument | null>(null);
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
  // Le spécimen n'existe que dans l'affichage : aucune requête, et rien en base.
  const shown = document ?? SPECIMEN_DOCUMENT;

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
            <ActivityIndicator color="#34d399" />
          </View>
        ) : document || showSpecimen ? (
          <View
            className="rounded-2xl p-5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.05)',
            }}
          >
            {isSpecimen(shown) ? (
              <View className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 self-start">
                <Text className="text-amber-300 text-xs font-black tracking-wider">
                  {SPECIMEN_MARKER}
                </Text>
              </View>
            ) : null}
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
              {t(RIDE_DOCUMENT_LABEL_KEYS[shown.kind])}
            </Text>
            <Text className="text-white text-2xl font-black tracking-tight mt-1">
              {shown.number}
            </Text>
            {isSpecimen(shown) ? (
              <Text className="text-amber-200/80 text-xs mt-2">
                {t('rideDocuments.specimenNotice')}
              </Text>
            ) : null}
            {shown.issuedAt ? (
              <Text className="text-slate-500 text-xs mt-1">
                {new Date(shown.issuedAt).toLocaleString()}
              </Text>
            ) : null}

            <View className="mt-4 pt-4 border-t border-white/10">
              <Row label={t('rideDocuments.issuer')} value={shown.issuer.name} />
              {shown.issuer.siret ? (
                <Row label={t('rideDocuments.siret')} value={shown.issuer.siret} />
              ) : null}
              {shown.clientName ? (
                <Row label={t('rideDocuments.client')} value={shown.clientName} />
              ) : null}
              {shown.ridePickup ? (
                <Row label={t('rideDocuments.ride')} value={shown.ridePickup} />
              ) : null}
            </View>

            <View className="mt-4 pt-4 border-t border-white/10">
              <Row
                label={t('rideDocuments.total')}
                value={`€${shown.totalAmount.toFixed(2)}`}
                strong
              />
              {shown.driverEarning !== null ? (
                <Row
                  label={t('rideDocuments.driverEarning')}
                  value={`€${shown.driverEarning.toFixed(2)}`}
                />
              ) : null}
              {shown.paymentMethod ? (
                <Row
                  label={t('rideDocuments.method')}
                  value={
                    shown.paymentMethod === 'cash'
                      ? t('rideDocuments.cash')
                      : t('rideDocuments.card')
                  }
                />
              ) : null}
            </View>
          </View>
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

function Row({
  label,
  value,
  strong,
}: Readonly<{ label: string; value: string; strong?: boolean }>) {
  return (
    <View className="flex-row justify-between items-center mb-2">
      <Text className="text-slate-400 text-xs">{label}</Text>
      <Text
        className={strong ? 'text-white font-black text-base' : 'text-slate-200 text-sm'}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
