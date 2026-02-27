import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert, Dimensions } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'vector-elegans://(auth)/reset-password',
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setSent(true);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View className="flex-1 bg-neutral-950 relative">
        <LinearGradient
          colors={['#171717', '#262626', '#404040']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        
        <View className="flex-1 justify-center items-center px-6">
          <View className="w-24 h-24 bg-white/5 rounded-full items-center justify-center border border-white/10 mb-8 shadow-lg">
            <Feather name="mail" size={40} color="#cbd5e1" />
          </View>
          
          <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-4 text-center">Check Your Email</Text>
          <Text className="text-slate-400 text-center mb-10 text-base leading-6 px-4">
            We've sent a password reset link to{'\n'}
            <Text className="text-white font-bold">{email}</Text>
          </Text>
          
          <Link href="/(auth)/login" asChild>
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              className="w-full rounded-xl h-14 items-center justify-center shadow-lg overflow-hidden relative"
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
              <Text className="text-white text-base font-black uppercase tracking-widest drop-shadow-md">
                Back to Login
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-950 relative">
      {/* Background Gradients - Grey/Dark Grey */}
      <LinearGradient
        colors={['#171717', '#262626', '#404040']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      
      {/* Accent Glows - Neutral/Grey */}
      <View className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <View className="absolute -top-[10%] -left-[10%] w-[50%] h-[40%] bg-neutral-500/10 rounded-full blur-3xl" />
        <View className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-zinc-500/10 rounded-full blur-3xl" />
        <View className="absolute -bottom-[10%] left-[20%] w-[60%] h-[40%] bg-stone-600/10 rounded-full blur-3xl" />
      </View>

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
            <View className="w-20 h-20 bg-white/5 rounded-full items-center justify-center border border-white/10 mb-6 shadow-lg">
              <Feather name="key" size={32} color="#cbd5e1" />
            </View>
            <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-2">
              Reset Password
            </Text>
            <Text className="text-slate-400 font-medium tracking-wide text-center px-4">
              Enter your email and we'll send you a reset link
            </Text>
          </View>

          {/* Glass Card Form */}
          <View 
            className="overflow-hidden rounded-3xl border border-white/10 shadow-2xl p-6"
            style={{
              backgroundColor: 'rgba(23, 23, 23, 0.85)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            {/* Email Input */}
            <View className="mb-8">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">Email</Text>
              <View 
                className="rounded-xl h-14 justify-center overflow-hidden border shadow-sm relative"
                style={{
                  borderColor: 'rgba(255,255,255,0.15)',
                  backgroundColor: 'transparent',
                }}
              >
                <LinearGradient
                  colors={['rgba(216, 251, 233, 0.15)', 'rgba(242, 251, 247, 0.05)']}
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

            {/* Neon Send Button */}
            <Pressable
              onPress={handleReset}
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
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Text>
            </Pressable>
          </View>

          {/* Footer */}
          <View className="flex-row justify-center mt-10">
            <Link href="/(auth)/login" asChild>
              <Pressable className="flex-row items-center">
                <Text className="text-slate-400 font-medium">Remember your password? </Text>
                <Text className="font-bold text-emerald-400 underline decoration-emerald-500/30">Sign In</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
