import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ElegantButton } from './ElegantButton';
import {
  runOtaCheck,
  runOtaFetch,
  runOtaReload,
} from '../lib/updates/otaUpdateActions';
import {
  deriveOtaUiPhase,
  formatUpdateId,
  type OtaUiPhase,
} from '../lib/updates/otaUpdateStatus';

const CHROME_CARD: ViewStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.05)',
};

function phaseMessageKey(phase: OtaUiPhase): string {
  return `profile.updates.phase.${phase}`;
}

function phaseIcon(phase: OtaUiPhase): keyof typeof Feather.glyphMap {
  switch (phase) {
    case 'checking':
    case 'downloading':
      return 'refresh-cw';
    case 'available':
      return 'download-cloud';
    case 'pending':
      return 'check-circle';
    case 'error':
      return 'alert-circle';
    case 'disabled':
      return 'slash';
    default:
      return 'cloud';
  }
}

export function useOtaMenuDetail(): string | undefined {
  const { t } = useTranslation();
  const { isUpdatePending } = Updates.useUpdates();
  if (!Updates.isEnabled) return undefined;
  if (isUpdatePending) return t('profile.updates.menuReady');
  return undefined;
}

/**
 * Profile modal: live OTA status from `useUpdates()` plus manual check / download / reload.
 */
export function OtaUpdatePanel() {
  const { t } = useTranslation();
  const {
    currentlyRunning,
    isUpdateAvailable,
    isUpdatePending,
    isChecking,
    isDownloading,
    isRestarting,
    checkError,
    downloadError,
    downloadProgress,
    lastCheckForUpdateTimeSinceRestart,
  } = Updates.useUpdates();

  const [upToDateAfterCheck, setUpToDateAfterCheck] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isEnabled = Updates.isEnabled;

  const phase = deriveOtaUiPhase({
    isEnabled,
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
    checkError,
    downloadError,
  });

  const appVersion = Constants.expoConfig?.version ?? '—';
  const versionCode =
    Constants.expoConfig?.android?.versionCode?.toString() ?? '—';

  const bundleLabel = currentlyRunning.isEmbeddedLaunch
    ? t('profile.updates.bundleEmbedded')
    : t('profile.updates.bundleOta');

  const lastCheckLabel = useMemo(() => {
    if (!lastCheckForUpdateTimeSinceRestart) {
      return t('profile.updates.lastCheckNever');
    }
    return lastCheckForUpdateTimeSinceRestart.toLocaleString();
  }, [lastCheckForUpdateTimeSinceRestart, t]);

  const showUpToDate =
    upToDateAfterCheck && phase === 'idle' && !isUpdateAvailable;

  const statusMessage = showUpToDate
    ? t('profile.updates.phase.upToDate')
    : t(phaseMessageKey(phase));

  const errorText =
    actionError ?? checkError?.message ?? downloadError?.message ?? null;

  const handleCheck = useCallback(async () => {
    setActionError(null);
    setUpToDateAfterCheck(false);
    const result = await runOtaCheck();
    if (!result.ok) {
      setActionError(
        result.message === 'OTA_DISABLED'
          ? t('profile.updates.errors.disabled')
          : result.message,
      );
      return;
    }
    if (!result.isAvailable) {
      setUpToDateAfterCheck(true);
    }
  }, [t]);

  const handleDownload = useCallback(async () => {
    setActionError(null);
    const result = await runOtaFetch();
    if (!result.ok) {
      setActionError(
        result.message === 'OTA_DISABLED'
          ? t('profile.updates.errors.disabled')
          : result.message === 'NO_UPDATE_FETCHED'
            ? t('profile.updates.errors.nothingFetched')
            : result.message,
      );
    }
  }, [t]);

  const handleReloadPress = useCallback(() => {
    Alert.alert(
      t('profile.updates.reloadTitle'),
      t('profile.updates.reloadMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.updates.reloadConfirm'),
          onPress: () => {
            void (async () => {
              setActionError(null);
              const result = await runOtaReload();
              if (!result.ok) {
                setActionError(result.message);
              }
            })();
          },
        },
      ],
    );
  }, [t]);

  const busy = isChecking || isDownloading || isRestarting;
  const iconName = showUpToDate ? 'check-circle' : phaseIcon(phase);
  const iconColor =
    phase === 'error' ? '#f87171' : showUpToDate ? '#34d399' : '#94a3b8';

  return (
    <View className="gap-6">
      <View className="overflow-hidden rounded-2xl" style={CHROME_CARD}>
        <View className="p-6">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('profile.updates.statusHeading')}
            </Text>
            {busy ? (
              <ActivityIndicator color="#10b981" size="small" />
            ) : (
              <Feather name={iconName} size={18} color={iconColor} />
            )}
          </View>
          <Text className="text-base font-semibold leading-snug text-white">
            {statusMessage}
          </Text>
          {phase === 'downloading' && typeof downloadProgress === 'number' ? (
            <View className="mt-4">
              <View className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <View
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                />
              </View>
              <Text className="mt-2 text-xs font-medium text-slate-500">
                {t('profile.updates.downloadProgress', {
                  percent: Math.round(downloadProgress * 100),
                })}
              </Text>
            </View>
          ) : null}
          {errorText ? (
            <Text className="mt-3 text-xs font-medium text-red-400">{errorText}</Text>
          ) : null}
        </View>
      </View>

      <View className="overflow-hidden rounded-2xl" style={CHROME_CARD}>
        <View className="p-6">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('profile.updates.buildHeading')}
            </Text>
            <Feather name="cpu" size={16} color="#94a3b8" />
          </View>
          <InfoRow
            label={t('profile.updates.channel')}
            value={currentlyRunning.channel ?? '—'}
          />
          <InfoRow
            label={t('profile.updates.updateId')}
            value={formatUpdateId(currentlyRunning.updateId)}
            mono
          />
          <InfoRow
            label={t('profile.updates.runtimeVersion')}
            value={currentlyRunning.runtimeVersion ?? '—'}
            mono
          />
          <InfoRow label={t('profile.updates.bundleType')} value={bundleLabel} />
          <InfoRow
            label={t('profile.updates.appVersion')}
            value={`${appVersion} (${versionCode})`}
          />
          <InfoRow label={t('profile.updates.lastCheck')} value={lastCheckLabel} />
        </View>
      </View>

      <View className="gap-3">
        <ElegantButton
          title={t('profile.updates.checkButton')}
          variant="outline"
          size="large"
          onPress={() => void handleCheck()}
          disabled={!isEnabled || busy}
          loading={isChecking}
          className="w-full"
        />
        {isUpdateAvailable && !isUpdatePending ? (
          <ElegantButton
            title={t('profile.updates.downloadButton')}
            variant="primary"
            size="large"
            onPress={() => void handleDownload()}
            disabled={!isEnabled || busy}
            loading={isDownloading}
            className="w-full"
          />
        ) : null}
        {isUpdatePending ? (
          <ElegantButton
            title={t('profile.updates.reloadButton')}
            variant="primary"
            size="large"
            onPress={handleReloadPress}
            disabled={!isEnabled || busy}
            loading={isRestarting}
            className="w-full"
          />
        ) : null}
      </View>

      {!isEnabled ? (
        <Text className="text-center text-xs leading-relaxed text-slate-500 px-1">
          {t('profile.updates.devHint')}
        </Text>
      ) : null}
    </View>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <View className="flex-row justify-between gap-4 border-b border-white/5 py-3 last:border-b-0 last:pb-0">
      <Text className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </Text>
      <Text
        className={`flex-1 text-right text-sm font-semibold text-white ${mono ? 'font-mono text-xs' : ''}`}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}
