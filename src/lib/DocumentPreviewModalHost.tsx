import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { PinchZoomImage } from '../components/PinchZoomImage';

type PreviewModalState = {
  visible: boolean;
  url: string | null;
};

let setPreviewModalState: ((s: PreviewModalState) => void) | null = null;

export function showDocumentImageModal(url: string): boolean {
  if (setPreviewModalState) {
    setPreviewModalState({ visible: true, url });
    return true;
  }
  return false;
}

/** Mount once near app root for in-app image preview. */
export function DocumentPreviewModalHost() {
  const [state, setState] = useState<PreviewModalState>({
    visible: false,
    url: null,
  });
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setPreviewModalState = setState;
    return () => {
      setPreviewModalState = null;
    };
  }, []);

  if (!state.visible || !state.url) return null;

  const close = () => setState({ visible: false, url: null });

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.scrim}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={close}
              hitSlop={12}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('documents.closePreview')}
            >
              <Feather name="x" color="#f8fafc" size={22} />
            </Pressable>
          </View>

          <View style={styles.viewport}>
            <PinchZoomImage
              uri={state.url}
              mode="preview"
              onPreviewBackgroundTap={close}
            />
          </View>

          <Pressable
            onPress={close}
            style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}
            accessibilityRole="button"
          >
            <Text style={styles.hint}>{t('documents.previewHint')}</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
  },
  header: {
    zIndex: 2,
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  viewport: {
    flex: 1,
    overflow: 'visible',
  },
  footer: {
    zIndex: 2,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  hint: {
    textAlign: 'center',
    color: 'rgba(148, 163, 184, 0.95)',
    fontSize: 12,
  },
});
