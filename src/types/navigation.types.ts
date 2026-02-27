// Expo Router 2026 - Navigation Types
// No more StackNavigationProp - Expo Router uses file-based routing like Next.js

export type {} // Empty - Expo Router infers types from file structure

// Route params are defined by file structure
// Example: app/(auth)/login.tsx → href="/(auth)/login"
// Example: app/(tabs)/rides/[id].tsx → href="/(tabs)/rides/123"

// Navigation is done via:
// import { useRouter } from 'expo-router'
// const router = useRouter()
// router.push('/(tabs)/rides/123')
// router.replace('/(auth)/login')
// router.back()

// Search params:
// import { useSearchParams } from 'expo-router'
// const params = useSearchParams()
// const id = params.get('id')

// Local params (like Next.js):
// import { useLocalSearchParams } from 'expo-router'
// const { id, tab } = useLocalSearchParams()