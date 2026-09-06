import React from 'react';
import { View, ViewProps } from 'react-native';
import { AppChromeBackground } from './AppChromeBackground';
import { APP_CHROME } from '../lib/theme';

type ElegantBackgroundProps = Readonly<
  ViewProps & {
    children: React.ReactNode;
    className?: string;
  }
>;

export function ElegantBackground({
  children,
  className = '',
  ...props
}: ElegantBackgroundProps) {
  return (
    <View
      className={`flex-1 ${className}`}
      style={{ backgroundColor: APP_CHROME.fallback }}
      {...props}
    >
      <AppChromeBackground />
      {children}
    </View>
  );
}
