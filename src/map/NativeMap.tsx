import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import type { MapProps } from './types';
import { getRouteOSRM } from '../services/routing';

export function NativeMap(props: MapProps) {
  const mapRef = useRef<any>(null);

  useEffect(() => {
    console.log('NativeMap initialized with props:', props);
  }, [props]);

  useEffect(() => {
    if (props.start && props.end) {
      getRouteOSRM(props.start, props.end).then((route) => {
        if (route && props.onRouteReady) {
          props.onRouteReady(route.distance, route.duration);
        }
      });
    }
  }, [props.start, props.end, props.onRouteReady]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Native MapLibre - Coming Soon</Text>
      <Text style={styles.subtext}>
        Switch USE_WEBVIEW to false in VTCMap.tsx after installing @maplibre/maplibre-react-native
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
