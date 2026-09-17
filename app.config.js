/**
 * Expo config. google-services.json is injected on EAS via GOOGLE_SERVICES_JSON
 * (environment File var). Local Metro/builds fall back to ./google-services.json.
 */
module.exports = {
  expo: {
    name: 'Vector Elegans Driver',
    slug: 'vector-elegans-driver',
    version: '1.0.1',
    runtimeVersion: '1.0.1',
    updates: {
      url: 'https://u.expo.dev/d9eee7f2-f575-4bc6-ba03-87c1292daa75',
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    scheme: 'vector-elegans',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#171717',
    },
    assetBundlePatterns: ['**/*'],
    platforms: ['ios', 'android'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.vectorelegans.driver',
      infoPlist: {
        UIBackgroundModes: ['location'],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#171717',
      },
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON || './google-services.json',
      package: 'com.vectorelegans.driver',
      permissions: [
        'android.permission.INTERNET',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_LOCATION',
        'android.permission.POST_NOTIFICATIONS',
        // Special app access, granted by the user from Settings. Required to
        // draw the online pill over other apps — the visible overlay window is
        // what lets an incoming offer bring the app back to the foreground
        // (background activity launches are blocked since Android 10).
        // On refusal the app keeps the notification path, so it stays usable.
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
    },
    plugins: [
      'expo-router',
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#3b82f6',
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow Vector Elegans to use your location in the background to receive nearby ride offers while you are online.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      'expo-task-manager',
      [
        'expo-image-picker',
        {
          photosPermission:
            'Allow Vector Elegans to access your photos for profile and document uploads.',
        },
      ],
      '@react-native-community/datetimepicker',
    ],
    extra: {
      eas: {
        projectId: 'd9eee7f2-f575-4bc6-ba03-87c1292daa75',
      },
      router: {},
    },
    experiments: {},
    owner: 'jawjaww',
  },
};
