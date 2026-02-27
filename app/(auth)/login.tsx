import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert, Dimensions } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { isUserDriver } from '../../src/lib/utils/auth-helpers';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    console.log('Attempting login with:', email);
    console.log('Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL);
    
    try {
      // Add a timeout to prevent infinite loading state
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timed out. Please check your network.')), 10000)
      );

      const loginPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });

      const result = await Promise.race([loginPromise, timeoutPromise]) as any;
      const { data, error } = result;

      if (error) {
        console.error('Login error:', error);
        Alert.alert('Error', error.message);
        return;
      }

      if (data.user) {
        console.log('User authenticated, checking role...');
        if (!isUserDriver(data.user)) {
          console.log('User is not a driver');
          await supabase.auth.signOut();
          Alert.alert('Access Denied', 'This app is for drivers only');
          return;
        }

        console.log('Fetching driver profile...');
        const { data: driver, error: driverError } = await supabase
          .from('drivers')
          .select('status')
          .eq('user_id', data.user.id)
          .single();
        
        if (driverError) {
           console.error('Driver fetch error:', driverError);
           // Allow login even if driver profile fetch fails, but redirect to setup
           router.replace('/(auth)/profile-setup');
           return;
        }

        if (!driver) {
          router.replace('/(auth)/profile-setup');
        } else if (['active', 'incomplete', 'pending_validation'].includes(driver.status)) {
          router.replace('/(tabs)');
        } else {
          // For other statuses (suspended, rejected, etc.), maybe show an alert or redirect to a status page
          // For now, let's redirect to tabs but they will see the status there if we handle it
          console.log('Driver status:', driver.status);
          router.replace('/(tabs)');
        }
      }
    } catch (error: any) {
      console.error('Login exception:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  };

  // Add mounted ref to prevent state updates on unmounted component
  const mounted = React.useRef(true);
  React.useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <View className="flex-1 bg-transparent">
      <KeyboardAvoidingView 
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        >
          {/* Main Card Container - FullscreenRideModal Style */}
          <View 
            className="overflow-hidden rounded-xl"
            style={{
              // backgroundColor: 'transparent',
              // borderColor: 'transparent',
              // shadowColor: 'transparent',
              // shadowOffset: { width: 0, height: 0 },
              // shadowOpacity: 0,
              // shadowRadius: 0,
              // elevation: 0,
            }}
          >
            {/* Header */}
            <View className="items-center mb-10 mt-12">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4 border border-white/10">
                <Text className="text-4xl">🚗</Text>
              </View>
              <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">Vector Elegans</Text>
              <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">Driver Portal</Text>
            </View>

            {/* Form Container */}
            <View className="mx-6 pb-10">
              {/* Email Input - Styled like "Prix" badge */}
              <View className="mb-5">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">Email</Text>
                <View 
                  className="rounded-lg h-14 justify-center overflow-hidden border shadow-sm relative"
                  style={{
                    borderColor: 'rgba(255,255,255,0.1)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                  }}
                >
                  <LinearGradient
                    colors={['rgba(16, 185, 129, 0.15)', 'rgba(255, 255, 255, 0.2)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' }}
                  />
                  <View className="flex-row items-center px-4 relative z-10">
                    <Feather name="mail" size={20} color="#10b981" />
                    <TextInput
                      className="flex-1 text-emerald-400 text-lg px-3 h-full font-bold"
                      placeholder="driver@email.com"
                      placeholderTextColor="#065f46"
                      style={{ opacity: 1 }}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                  </View>
                </View>
              </View>

              {/* Password Input - Styled like "Prix" badge */}
              <View className="mb-8">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">Password</Text>
                <View 
                  className="rounded-lg h-14 justify-center overflow-hidden border shadow-sm relative"
                  style={{
                    borderColor: 'rgba(255,255,255,0.1)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                  }}
                >
                  <LinearGradient
                    colors={['rgba(16, 185, 129, 0.15)', 'rgba(255, 255, 255, 0.2)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' }}
                  />
                  <View className="flex-row items-center px-4 relative z-10">
                    <Feather name="lock" size={20} color="#10b981" />
                    <TextInput
                      className="flex-1 text-emerald-400 text-lg px-3 h-full font-bold"
                      placeholder="••••••••"
                      placeholderTextColor="#065f46"
                      style={{ opacity: 1 }}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete="password"
                    />
                  </View>
                </View>
              </View>

              {/* Neon Sign In Button - Matches NeonSwipeButton style */}
              <Pressable
                onPress={handleLogin}
                disabled={loading}
                className={`rounded-full py-4 items-center shadow-lg overflow-hidden relative ${loading ? 'opacity-70' : 'opacity-100'}`}
                style={{
                  shadowColor: '#22c55e', // green-500
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 20,
                  elevation: 10,
                }}
              >
                <LinearGradient
                  colors={['#10b981', '#4ade80', '#2dd4bf']} // emerald-500, green-400, teal-400
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                />
                
                {/* Inner white gradient overlay */}
                <LinearGradient
                   colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0)']}
                   start={{ x: 0, y: 0 }}
                   end={{ x: 1, y: 0 }}
                   style={{ 
                     position: 'absolute', 
                     left: 4, 
                     right: '30%', 
                     top: 4, 
                     bottom: 4, 
                     borderRadius: 9999 
                   }}
                />

                <Text className="text-white text-base font-black uppercase tracking-tighter drop-shadow-md">
                  {loading ? 'Signing in...' : 'Sign In'}
                </Text>
              </Pressable>

              {/* Forgot Password Link */}
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable className="mt-6 items-center">
                  <Text className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Forgot Password?</Text>
                </Pressable>
              </Link>
            </View>
          </View>

          {/* Footer */}
          <View className="flex-row justify-center mt-10">
            <Text className="text-slate-500 text-sm font-medium">Don't have an account? </Text>
            <Link href="/(auth)/signup" asChild>
              <Pressable>
                <Text className="font-bold text-emerald-400 text-sm ml-1 uppercase tracking-wide">Sign Up</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}