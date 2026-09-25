import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';

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

function phaseMessageKey(phase: OtaUiPhase): string {
  return `profile.updates.phase.${phase}`;
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
    if (!lastCheckForUpdateTimeSinceRestart) return t('profile.updates.lastCheckNever');
    return lastCheckForUpdateTimeSinceRestart.toLocaleString();
  }, [lastCheckForUpdateTimeSinceRestart, t]);

  const showUpToDate =
    upToDateAfterCheck && phase === 'idle' && !isUpdateAvailable;

  const errorText =
    actionError ??
    checkError?.message ??
    downloadError?.message ??
    null;

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

  return (
    <View className="p-4 gap-5">
      <View className="rounded-2xl border border-white/10 bg-white/5 p-4 gap-3">
        <Text className="text-white font-semibold text-base">
          {t('profile.updates.statusHeading')}
        </Text>
        <View className="flex-row items-center gap-2">
          {busy ? <ActivityIndicator color="#94a3b8" /> : null}
          <Text className="text-slate-300 text-sm flex-1">
            {showUpToDate
              ? t('profile.updates.phase.upToDate')
              : t(phaseMessageKey(phase))}
          </Text>
        </View>
        {phase === 'downloading' &&
        typeof downloadProgress === 'number' ? (
          <Text className="text-slate-500 text-xs">
            {t('profile.updates.downloadProgress', {
              percent: Math.round(downloadProgress * 100),
            })}
          </Text>
        ) : null}
        {errorText && phase === 'error' ? (
          <Text className="text-red-400 text-xs">{errorText}</Text>
        ) : null}
        {actionError && phase !== 'error' ? (
          <Text className="text-red-400 text-xs">{actionError}</Text>
        ) : null}
      </View>

      <View className="rounded-2xl border border-white/10 bg-white/5 p-4 gap-2">
        <Text className="text-white font-semibold text-base mb-1">
          {t('profile.updates.buildHeading')}
        </Text>
        <InfoRow label={t('profile.updates.channel')} value={currentlyRunning.channel ?? '—'} />
        <InfoRow
          label={t('profile.updates.updateId')}
          value={formatUpdateId(currentlyRunning.updateId)}
        />
        <InfoRow
          label={t('profile.updates.runtimeVersion')}
          value={currentlyRunning.runtimeVersion ?? '—'}
        />
        <InfoRow label={t('profile.updates.bundleType')} value={bundleLabel} />
        <InfoRow
          label={t('profile.updates.appVersion')}
          value={`${appVersion} (${versionCode})`}
        />
        <InfoRow label={t('profile.updates.lastCheck')} value={lastCheckLabel} />
      </View>

      <View className="gap-3">
        <ActionButton
          label={t('profile.updates.checkButton')}
          onPress={() => void handleCheck()}
          disabled={!isEnabled || busy}
        />
        {isUpdateAvailable && !isUpdatePending ? (
          <ActionButton
            label={t('profile.updates.downloadButton')}
            onPress={() => void handleDownload()}
            disabled={!isEnabled || busy}
            primary
          />
        ) : null}
        {isUpdatePending ? (
          <ActionButton
            label={t('profile.updates.reloadButton')}
            onPress={handleReloadPress}
            disabled={!isEnabled || busy}
            primary
          />
        ) : null}
      </View>

      {!isEnabled ? (
        <Text className="text-slate-500 text-xs text-center px-2">
          {t('profile.updates.devHint')}
        </Text>
      ) : null}
    </View>
  );
}

function InfoRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <View className="flex-row justify-between gap-4 py-1">
      <Text className="text-slate-500 text-sm shrink-0">{label}</Text>
      <Text
        className="text-slate-200 text-sm font-medium text-right flex-1"
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
}: Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-xl py-3.5 items-center border ${
        primary
          ? 'bg-blue-600 border-blue-500'
          : 'bg-white/10 border-white/15'
      } ${disabled ? 'opacity-40' : 'active:opacity-80'}`}
    >
      <Text className="text-white font-bold text-sm">{label}</Text>
    </Pressable>
  );
}
