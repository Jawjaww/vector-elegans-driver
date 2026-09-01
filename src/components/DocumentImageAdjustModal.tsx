import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { cropVisibleRegion } from '../lib/cropVisibleRegion';
import {
  defaultDocumentCropWindow,
  type CropRect,
} from '../lib/visibleImageCrop';
import { DocumentCropFrame } from './DocumentCropFrame';
import {
  PinchZoomImage,
  type PinchZoomImageHandle,
} from './PinchZoomImage';

type DocumentImageAdjustModalProps = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onConfirm: (uri: string) => void;
};

function minScaleToCoverCropWindow(
  viewport: { width: number; height: number },
  image: { width: number; height: number },
  cropWindow: CropRect,
): number {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return 1;
  }
  const fit = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  const displayedW = image.width * fit;
  const displayedH = image.height * fit;
  if (displayedW <= 0 || displayedH <= 0) return 1;
  return Math.max(
    1,
    cropWindow.width / displayedW,
    cropWindow.height / displayedH,
  );
}

export function DocumentImageAdjustModal({
  visible,
  uri,
  onCancel,
  onConfirm,
}: Readonly<DocumentImageAdjustModalProps>) {
  const { t } = useTranslation();
  const zoomRef = useRef<PinchZoomImageHandle>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [cropWindow, setCropWindow] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);

  const layoutCropWindow = useMemo(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return null;
    return defaultDocumentCropWindow(viewport);
  }, [viewport]);

  const minScale = useMemo(() => {
    if (!layoutCropWindow || imageSize.width <= 0) return 1;
    return minScaleToCoverCropWindow(viewport, imageSize, layoutCropWindow);
  }, [layoutCropWindow, imageSize, viewport]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport({ width, height });
  };

  const handleImageSize = (width: number, height: number) => {
    setImageSize({ width, height });
  };

  React.useEffect(() => {
    if (imageSize.width > 0 && minScale > 1) {
      zoomRef.current?.setMinScale(minScale);
    }
  }, [imageSize.width, minScale]);

  const handleConfirm = async () => {
    if (!uri) return;
    setBusy(true);
    try {
      const transform = zoomRef.current?.getTransform() ?? {
        scale: 1,
        translateX: 0,
        translateY: 0,
      };
      const effectiveCropWindow =
        cropWindow ?? layoutCropWindow ?? undefined;
      const cropped = await cropVisibleRegion(
        uri,
        viewport,
        imageSize,
        transform,
        effectiveCropWindow,
      );
      onConfirm(cropped);
    } finally {
      setBusy(false);
    }
  };

  if (!visible || !uri) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black">
          <View className="flex-1" onLayout={onLayout}>
            <PinchZoomImage
              ref={zoomRef}
              uri={uri}
              minScale={minScale}
              onImageSize={handleImageSize}
            />
            {layoutCropWindow ? (
              <DocumentCropFrame
                cropWindow={layoutCropWindow}
                onCropWindowLayout={setCropWindow}
              />
            ) : null}
          </View>
          <Text className="text-center text-slate-300 text-xs px-6 pb-3">
            {t('documents.pinchToZoom')}
          </Text>
          <View className="flex-row gap-3 px-5 pb-10">
            <Pressable
              onPress={onCancel}
              disabled={busy}
              className="flex-1 py-3 rounded-xl bg-white/15 items-center"
            >
              <Text className="text-white font-semibold">
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleConfirm();
              }}
              disabled={busy}
              className="flex-1 py-3 rounded-xl bg-emerald-600 items-center"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">
                  {t('documents.usePhoto')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
