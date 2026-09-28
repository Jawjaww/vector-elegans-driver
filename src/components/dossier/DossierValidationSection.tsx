import React, { type ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInRight, FadeInUp, FadeOutLeft } from 'react-native-reanimated';
import { DossierValidationChecklist } from '../DossierValidationChecklist';
import type { DossierChecklistInput } from '../../lib/dossierChecklist';
import { DossierProgressFill } from './DossierProgressFill';

export function DossierValidationSection({
  animatedContentStyle,
  animatedCompletionStyle,
  completionPercentage,
  checklistInput,
  status,
  opsStatusReason,
  dossierUpdateRequested,
  actions,
}: Readonly<{
  animatedContentStyle: StyleProp<ViewStyle>;
  animatedCompletionStyle: StyleProp<ViewStyle>;
  completionPercentage: number;
  checklistInput: DossierChecklistInput;
  status: string;
  opsStatusReason: string | null | undefined;
  dossierUpdateRequested: boolean;
  actions: ReactNode;
}>) {
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInRight.duration(300)}
      exiting={FadeOutLeft.duration(300)}
      style={animatedContentStyle}
      className="space-y-4"
    >
      <Animated.View
        entering={FadeIn.duration(300).delay(100)}
        className="bg-white/10 rounded-lg px-3 py-2.5 border border-white/20 mb-4"
      >
        <View className="flex-row items-center gap-3">
          <View className="flex-1 bg-white/15 rounded-full h-1.5 overflow-hidden">
            <DossierProgressFill animatedStyle={animatedCompletionStyle} height={6} />
          </View>
          <Text className="text-xs text-slate-300 font-medium min-w-[72px] text-right tabular-nums">
            {Math.round(completionPercentage)}% {t('common.complete')}
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(500).delay(500)}>
        <DossierValidationChecklist
          input={checklistInput}
          status={status}
          opsStatusReason={opsStatusReason}
          dossierUpdateRequested={dossierUpdateRequested}
        />
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(500).delay(900)} className="gap-2.5 pt-2">
        {actions}
      </Animated.View>
    </Animated.View>
  );
}
