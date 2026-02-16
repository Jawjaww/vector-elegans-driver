import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import './src/i18n';
import { theme, glassStyle } from './src/lib/theme';

const Stack = createStackNavigator();

function HomeScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vector Elegans</Text>
        <Text style={styles.subtitle}>Driver Portal</Text>
      </View>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Welcome</Text>
        <Text style={styles.cardText}>Sign in to continue</Text>
        <Pressable 
          style={styles.button}
          onPress={() => navigation.navigate('Auth')}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subtitle}>Driver Portal</Text>
      </View>
      
      <View style={styles.card}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.input}>{email || 'driver@email.com'}</Text>
          </View>
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.input}>••••••••</Text>
          </View>
        </View>
        
        <Pressable style={styles.buttonPrimary}>
          <Text style={styles.buttonPrimaryText}>Sign In</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTimeout(() => setReady(true), 300);
  }, []);

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingSpinner} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator 
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: theme.colors.background },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Auth" component={AuthScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.1)',
    borderTopColor: theme.colors.accent,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  card: {
    ...glassStyle,
    margin: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  cardText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  inputGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  inputContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 4,
  },
  input: {
    fontSize: 16,
    color: theme.colors.text,
  },
  button: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
