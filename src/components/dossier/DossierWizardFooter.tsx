import React from 'react';
import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInUp, FlipInEasyX } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { canShowDossierSubmit } from '../../lib/folderStatus';
import { DossierAccentGradientFill } from './DossierProgressFill';

export function DossierWizardFooter({
  status,
  dossierUpdateRequested,
  submitting,
  isEditable,
  onSubmit,
  onConfirmCancelReview,
  onSaveProgress,
}: Readonly<{
  status: string;
  dossierUpdateRequested: boolean;
  submitting: boolean;
  isEditable: boolean;
  onSubmit: () => void;
  onConfirmCancelReview: (messageKey: string) => void;
  onSaveProgress: () => void;
}>) {
  const { t } = useTranslation();
  const isPendingReviewUi = status === 'pending_review' || status === 'submitted';

  if (dossierUpdateRequested && isPendingReviewUi) {
    return (
      <>
        <Animated.View
          entering={FadeInUp.duration(500).delay(950)}
          className="bg-sky-500/15 border border-sky-400/30 rounded-xl p-3 mb-1"
        >
          <Text className="text-sky-100 text-sm font-semibold">
            {t('profile.adminUpdateRequestedTitle')}
          </Text>
          <Text className="text-sky-100/90 text-xs mt-1">
            {t('profile.adminUpdateRequestedMessage')}
          </Text>
        </Animated.View>
        <Animated.View entering={FlipInEasyX.duration(600).delay(1000)}>
          <Pressable
            onPress={onSubmit}
            disabled={submitting || !isEditable}
            className={`overflow-hidden rounded-lg py-2.5 px-4 items-center shadow ${
              submitting || !isEditable ? 'opacity-50' : 'opacity-100'
            }`}
          >
            <DossierAccentGradientFill />
            <Animated.Text
              entering={FadeIn.duration(300).delay(1100)}
              className="text-white text-sm font-semibold"
            >
              {submitting ? t('profile.submitting') : t('profile.submitForReview')}
            </Animated.Text>
          </Pressable>
        </Animated.View>
        <Animated.View entering={FlipInEasyX.duration(600).delay(1050)}>
          <Pressable
            onPress={() => onConfirmCancelReview('profile.confirmReturnToDraft')}
            className="overflow-hidden rounded-lg py-2.5 px-4 items-center shadow mt-2"
          >
            <LinearGradient
              colors={['#374151', '#4b5563']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="absolute inset-0 rounded-lg"
            />
            <Animated.Text className="text-white text-sm font-semibold">
              {t('profile.returnToDraft')}
            </Animated.Text>
          </Pressable>
        </Animated.View>
      </>
    );
  }

  if (isPendingReviewUi) {
    return (
      <Animated.View entering={FlipInEasyX.duration(600).delay(1000)}>
        <Pressable
          onPress={() => onConfirmCancelReview('profile.confirmCancelSubmission')}
          className="overflow-hidden rounded-lg py-2.5 px-4 items-center shadow"
        >
          <LinearGradient
            colors={['#f97316', '#ef4444']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="absolute inset-0 rounded-lg"
          />
          <Animated.Text
            entering={FadeIn.duration(300).delay(1100)}
            className="text-white text-sm font-semibold"
          >
            {t('profile.cancelSubmission')}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    );
  }

  if (!canShowDossierSubmit(status, dossierUpdateRequested)) {
    return null;
  }

  return (
    <>
      <Animated.View entering={FlipInEasyX.duration(600).delay(1000)}>
        <Pressable
          onPress={onSaveProgress}
          className="overflow-hidden rounded-lg py-2.5 px-4 items-center shadow"
        >
          <LinearGradient
            colors={['#374151', '#4b5563']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="absolute inset-0 rounded-lg"
          />
          <Animated.Text
            entering={FadeIn.duration(300).delay(1100)}
            className="text-white text-sm font-semibold"
          >
            {t('profile.saveProgress')}
          </Animated.Text>
        </Pressable>
      </Animated.View>
      <Animated.View entering={FlipInEasyX.duration(600).delay(1200)}>
        <Pressable
          onPress={onSubmit}
          disabled={submitting || !isEditable}
          className={`overflow-hidden rounded-lg py-2.5 px-4 items-center shadow ${
            submitting || !isEditable ? 'opacity-50' : 'opacity-100'
          }`}
        >
          <DossierAccentGradientFill />
          <Animated.Text
            entering={FadeIn.duration(300).delay(1300)}
            className="text-white text-sm font-semibold"
          >
            {submitting ? t('profile.submitting') : t('profile.submitForReview')}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    </>
  );
}
