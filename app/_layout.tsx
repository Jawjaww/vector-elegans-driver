import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import "../global.css"; // ← OK, utilisé par NativeWind
import "../src/i18n";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />

        {/* Global Background - Low Level */}
        <LinearGradient
          colors={["#171717", "#262626"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFill, { zIndex: -10 }]}
        />
        <LinearGradient
          colors={["rgba(255, 255, 255, 0.02)", "rgba(255, 255, 255, 0.13)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFill, { zIndex: -9 }]}
        />

        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
