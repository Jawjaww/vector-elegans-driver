import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useState } from 'react';
import { DossierSystemTestRunner } from '../../src/components/DossierSystemTestRunner';

export default function ProfileScreen() {
  const router = useRouter();
  const [showTestRunner, setShowTestRunner] = useState(false);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  const menuItems = [
    { 
      icon: 'file-text', 
      label: 'Documents', 
      action: () => Alert.alert('Coming Soon', 'Document management will be available shortly.') 
    },
    { 
      icon: 'truck', 
      label: 'Vehicle', 
      action: () => Alert.alert('Coming Soon', 'Vehicle management will be available shortly.') 
    },
    { icon: 'settings', label: 'Settings', action: () => {} },
    { icon: 'help-circle', label: 'Help', action: () => {} },
    { icon: 'tool', label: 'Test Runner', action: () => setShowTestRunner(true) },
  ];

  return (
    <View className="flex-1 bg-transparent">
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}>
        <View className="pt-16 pb-6">
          <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">Profile</Text>
          <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">Driver Account</Text>
        </View>

        {/* Profile Card */}
        <View 
          className="overflow-hidden rounded-2xl mb-6"
          style={{
            // backgroundColor: 'transparent',
            // borderColor: 'transparent',
          }}
        >
          <View className="p-6 flex-row items-center">
            <View className="w-20 h-20 rounded-full items-center justify-center border border-white/10 mr-5">
              <Text className="text-4xl">👤</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-white mb-1">Driver</Text>
              <Text className="text-slate-400 font-medium text-sm mb-3">driver@email.com</Text>
              
              <Pressable 
                className="self-start px-4 py-2 rounded-full border border-white/20 bg-white/5"
                onPress={() => router.push('/(auth)/profile-setup')}
              >
                <Text className="text-white text-xs font-bold uppercase tracking-wider">Edit Profile</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Menu Items */}
        <View 
          className="overflow-hidden rounded-2xl mb-8"
          style={{
            // backgroundColor: 'transparent',
            // borderColor: 'transparent',
          }}
        >
          {menuItems.map((item, index) => (
            <Pressable 
              key={index}
              className={`p-5 flex-row items-center active:bg-white/5 ${index !== menuItems.length - 1 ? 'border-b border-white/5' : ''}`}
              onPress={item.action}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-4">
                <Feather name={item.icon as any} size={20} color="#94a3b8" />
              </View>
              <Text className="flex-1 text-white font-semibold text-base">{item.label}</Text>
              <Feather name="chevron-right" size={20} color="#475569" />
            </Pressable>
          ))}
        </View>

        {/* Sign Out Button - Red Neon Style */}
        <Pressable
          onPress={handleSignOut}
          className="rounded-full py-4 items-center shadow-lg overflow-hidden relative"
          style={{
            shadowColor: '#ef4444', // red-500
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          <LinearGradient
            colors={['#ef4444', '#f87171', '#fca5a5']} // red-500, red-400, red-300
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
            Sign Out
          </Text>
        </Pressable>
      </ScrollView>
      
      {/* Test Runner Modal */}
      {showTestRunner && (
        <View className="absolute inset-0 bg-black/80 z-50">
          <View className="flex-1 bg-gray-900/95 m-4 rounded-2xl overflow-hidden">
            <View className="flex-row items-center justify-between p-4 border-b border-white/10">
              <Text className="text-white text-lg font-bold">Test Runner - Système de Dossiers</Text>
              <Pressable onPress={() => setShowTestRunner(false)}>
                <Feather name="x" size={24} color="white" />
              </Pressable>
            </View>
            <ScrollView className="flex-1">
              <DossierSystemTestRunner />
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
