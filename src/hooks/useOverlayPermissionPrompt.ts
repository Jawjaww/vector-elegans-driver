import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { showAppAlert } from '../components/AppDialog';
import {
  hasOverlayPermission,
  isOverlaySupported,
  requestOverlayPermission,
} from '../lib/overlay/overlayService';

/**
 * Explains the overlay permission the first time the driver goes online without
 * it, then offers to open the system screen.
 *
 * Google Play requires a rationale shown in-app *before* the redirect, and the
 * refusal must be honoured without nagging — hence the single prompt per session
 * and the explicit "later" option. Declining leaves the notification path
 * untouched, so the app stays fully usable.
 */
export function useOverlayPermissionPrompt(isOnline: boolean): void {
  const { t } = useTranslation();
  const prompted = useRef(false);

  useEffect(() => {
    if (!isOnline || prompted.current) return;
    if (!isOverlaySupported() || hasOverlayPermission()) return;
    prompted.current = true;

    showAppAlert(
      t('dashboard.overlayPermissionTitle'),
      t('dashboard.overlayPermissionBody'),
      [
        { text: t('dashboard.overlayPermissionLater'), style: 'cancel' },
        {
          text: t('dashboard.overlayPermissionGrant'),
          onPress: () => requestOverlayPermission(),
        },
      ],
    );
  }, [isOnline, t]);
}
