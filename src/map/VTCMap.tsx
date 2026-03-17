import React from 'react';
import { Platform } from 'react-native';
import type { MapProps } from './types';
import { WebViewMap } from './WebViewMap';

const USE_WEBVIEW = true;

export function VTCMap(props: MapProps) {
  if (USE_WEBVIEW) {
    return <WebViewMap {...props} />;
  }
  
  return <WebViewMap {...props} />;
}

export default VTCMap;
