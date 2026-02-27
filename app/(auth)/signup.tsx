import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert, Dimensions } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: 'app_driver',
          },
        },
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (data.user) {
        Alert.alert(
          'Success',
          'Account created! Please check your email to verify.',
          [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-transparent relative">
      <KeyboardAvoidingView 
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          className="px-6"
        >
          {/* Header */}
          <View className="items-center mb-10">
            <View className="w-20 h-20 rounded-full items-center justify-center border border-white/10 mb-6 shadow-lg">
              <Feather name="user-plus" size={32} color="#cbd5e1" />
            </View>
            <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-2">
              Join Vector
            </Text>
            <Text className="text-slate-400 font-medium tracking-wide">
              Start your journey as a driver
            </Text>
          </View>

          {/* Glass Card Form */}
          <View 
            className="overflow-hidden rounded-3xl p-6"
            style={{
              // backgroundColor: 'transparent',
              // borderColor: 'transparent',
            }}
          >
            {/* Email Input */}
            <View className="mb-5">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">Email</Text>
              <View 
                className="rounded-xl h-14 justify-center overflow-hidden border shadow-sm relative"
                style={{
                  borderColor: 'rgba(255,255,255,0.1)',
                  backgroundColor: 'transparent',
                }}
              >
                <LinearGradient
                  colors={['rgba(16, 185, 129, 0.15)', 'rgba(255, 255, 255, 0.2)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' }}
                />
                <View className="flex-row items-center px-4 relative z-10">
                  <Feather name="mail" size={18} color="#10b981" />
                  <TextInput
                    className="flex-1 text-emerald-400 text-base px-3 h-full font-medium"
                    placeholder="driver@email.com"
                    placeholderTextColor="#065f46"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                </View>
              </View>
            </View>

            {/* Password Input */}
            <View className="mb-5">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">Password</Text>
              <View 
                className="rounded-xl h-14 justify-center overflow-hidden border shadow-sm relative"
                style={{
                  borderColor: 'rgba(255,255,255,0.1)',
                  backgroundColor: 'transparent',
                }}
              >
                <LinearGradient
                  colors={['rgba(16, 185, 129, 0.15)', 'rgba(255, 255, 255, 0.2)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' }}
                />
                <View className="flex-row items-center px-4 relative z-10">
                  <Feather name="lock" size={18} color="#10b981" />
                  <TextInput
                    className="flex-1 text-emerald-400 text-base px-3 h-full font-medium"
                    placeholder="••••••••"
                    placeholderTextColor="#065f46"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="new-password"
                  />
                </View>
              </View>
            </View>

            {/* Confirm Password Input */}
            <View className="mb-8">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">Confirm Password</Text>
              <View 
                className="rounded-xl h-14 justify-center overflow-hidden border shadow-sm relative"
                style={{
                  borderColor: 'rgba(255,255,255,0.1)',
                  backgroundColor: 'transparent',
                }}
              >
                <LinearGradient
                  colors={['rgba(16, 185, 129, 0.15)', 'rgba(255, 255, 255, 0.2)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' }}
                />
                <View className="flex-row items-center px-4 relative z-10">
                  <Feather name="check-circle" size={18} color="#10b981" />
                  <TextInput
                    className="flex-1 text-emerald-400 text-base px-3 h-full font-medium"
                    placeholder="••••••••"
                    placeholderTextColor="#065f46"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoComplete="new-password"
                  />
                </View>
              </View>
            </View>

            {/* Neon Sign Up Button */}
            <Pressable
              onPress={handleSignup}
              disabled={loading}
              className={`rounded-xl h-14 items-center justify-center shadow-lg overflow-hidden relative ${loading ? 'opacity-70' : ''}`}
              style={{
                shadowColor: '#10b981',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 15,
                elevation: 5,
              }}
            >
              <LinearGradient
                colors={['#10b981', '#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
              
              {/* Inner white gradient overlay for glass effect */}
              <LinearGradient
                 colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0)']}
                 start={{ x: 0, y: 0 }}
                 end={{ x: 1, y: 0 }}
                 style={{ 
                   position: 'absolute', 
                   left: 2, 
                   right: '40%', 
                   top: 2, 
                   bottom: 2, 
                   borderRadius: 10 
                 }}
              />

              <Text className="text-white text-base font-black uppercase tracking-widest drop-shadow-md">
                {loading ? 'Creating...' : 'Sign Up'}
              </Text>
            </Pressable>
          </View>

          {/* Footer */}
          <View className="flex-row justify-center mt-10">
            <Text className="text-slate-400 font-medium">Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text className="font-bold text-emerald-400 underline decoration-emerald-500/30">Sign In</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
