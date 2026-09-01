import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassModal } from './GlassModal';

export type AppDialogButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AppDialogButton {
  text: string;
  style?: AppDialogButtonStyle;
  onPress?: () => void;
}

interface AppDialogState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppDialogButton[];
}

interface AppDialogContextValue {
  showAlert: (
    title: string,
    message?: string,
    buttons?: AppDialogButton[],
  ) => void;
}

const defaultState: AppDialogState = {
  visible: false,
  title: '',
  message: undefined,
  buttons: [],
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

let externalShowAlert:
  | ((title: string, message?: string, buttons?: AppDialogButton[]) => void)
  | null = null;

/** Imperative API — drop-in for Alert.alert in dossier flows. */
export function showAppAlert(
  title: string,
  message?: string,
  buttons?: AppDialogButton[],
): void {
  if (externalShowAlert) {
    externalShowAlert(title, message, buttons);
    return;
  }
  console.warn('[AppDialog] Host not mounted:', title, message);
}

function buttonColors(style: AppDialogButtonStyle | undefined): [string, string] {
  if (style === 'destructive') return ['#ef4444', '#dc2626'];
  if (style === 'cancel') return ['#374151', '#4b5563'];
  return ['#10b981', '#059669'];
}

export function AppDialogProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [state, setState] = useState<AppDialogState>(defaultState);

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const showAlert = useCallback(
    (title: string, message?: string, buttons?: AppDialogButton[]) => {
      const resolved =
        buttons && buttons.length > 0
          ? buttons
          : [{ text: 'OK', style: 'default' as const }];
      setState({
        visible: true,
        title,
        message,
        buttons: resolved,
      });
    },
    [],
  );

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  externalShowAlert = showAlert;

  const handlePress = (button: AppDialogButton) => {
    hide();
    button.onPress?.();
  };

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <GlassModal visible={state.visible} onClose={hide}>
        <View className="px-5 py-5">
          <Text className="text-lg font-bold text-white text-center mb-2">
            {state.title}
          </Text>
          {state.message ? (
            <Text className="text-sm text-slate-300 text-center leading-5 mb-5">
              {state.message}
            </Text>
          ) : (
            <View className="mb-3" />
          )}
          <View className="gap-2">
            {state.buttons.map((button) => (
              <Pressable
                key={`${button.text}-${button.style ?? 'default'}`}
                onPress={() => handlePress(button)}
                className="overflow-hidden rounded-xl"
              >
                <LinearGradient
                  colors={buttonColors(button.style)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  className="py-3 px-4 items-center"
                >
                  <Text className="text-white text-sm font-semibold">
                    {button.text}
                  </Text>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        </View>
      </GlassModal>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog(): AppDialogContextValue {
  const ctx = useContext(AppDialogContext);
  if (!ctx) {
    throw new Error('useAppDialog must be used within AppDialogProvider');
  }
  return ctx;
}
