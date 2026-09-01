import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { CropRect } from '../lib/visibleImageCrop';

type DocumentCropFrameProps = {
  cropWindow: CropRect;
  onCropWindowLayout?: (window: CropRect) => void;
};

/**
 * Dark overlay with a transparent crop window; reports window position in parent coords.
 */
export function DocumentCropFrame({
  cropWindow,
  onCropWindowLayout,
}: Readonly<DocumentCropFrameProps>) {
  const { originX, originY, width, height } = cropWindow;

  const reportLayout = (event: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = event.nativeEvent.layout;
    onCropWindowLayout?.({
      originX: x,
      originY: y,
      width: w,
      height: h,
    });
  };

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: originY,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: originY + height,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: originY,
          left: 0,
          width: originX,
          height,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: originY,
          left: originX + width,
          right: 0,
          height,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}
      />
      <View
        onLayout={reportLayout}
        style={{
          position: 'absolute',
          top: originY,
          left: originX,
          width,
          height,
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.9)',
          borderRadius: 8,
        }}
      />
    </View>
  );
}
