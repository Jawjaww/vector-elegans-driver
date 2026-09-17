import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppChromeBackground } from "../src/components/AppChromeBackground";
import "../global.css"; // ← OK, utilisé par NativeWind
import "../src/i18n";
import { DocumentPreviewModalHost } from "../src/lib/documentPreview";
import { AppDialogProvider } from "../src/components/AppDialog";
import "../src/lib/location/driverLocationTask";
import { startOverlayLifecycle } from "../src/lib/overlay/overlayService";

export default function RootLayout() {
  // Mounted at the root so the Android online pill follows the driver's state
  // even when the dashboard is not on screen.
  useEffect(() => {
    startOverlayLifecycle();
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />

        <AppChromeBackground style={{ zIndex: -10 }} />

        <AppDialogProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <DocumentPreviewModalHost />
        </AppDialogProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
