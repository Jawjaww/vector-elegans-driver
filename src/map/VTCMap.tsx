import React from 'react';
import type { MapProps } from './types';
import { WebViewMap } from './WebViewMap';

/** Driver map: MapLibre inside WebView (no Google Maps). */
export function VTCMap(props: Readonly<MapProps>) {
  return <WebViewMap {...props} />;
}

export default VTCMap;
