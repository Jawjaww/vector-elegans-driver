# Vector Elegans Driver App - Migration Plan

## Project Overview

- **Project**: Vector Elegans Driver Mobile Application
- **Type**: React Native Mobile App (Expo SDK 50+)
- **Source**: elegance-mobilite tmp (Web Portal)
- **Target**: Modern Expo 2026 Mobile App with Docker
- **Repository**: https://github.com/jawjaww/vector-elegans-driver (currently)
- **Target Repository**: https://github.com/Jawjaww/vector-elegans-driver (to be migrated)

---

## Architecture

### Current Stack (2026)

- **Image Docker**: `expo/eas-cli:latest` (cloud-native)
- **Framework**: Expo SDK 50 + React Native 0.73
- **State Management**: Zustand with persistence
- **Backend**: Supabase (Auth, Realtime, Storage)
- **GPS**: Expo Location with background tracking
- **Maps**: React Native Maps
- **Notifications**: Expo Notifications
- **i18n**: expo-localization + i18next + react-i18next

### GitOps Workflow

- GitHub repository initialized
- Docker-based development environment
- EAS Build for production builds

---

## Phase 1: Environment Setup

### 1.1 Pull Expo Docker Image

```bash
docker pull expo/eas-cli:latest
docker images | grep expo
```

### 1.2 Upgrade Dependencies

```bash
cd vector-elegans
npm install expo@latest
npx expo install expo-localization i18next react-i18next
npm install zustand react-native-maps
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install expo-av expo-haptics expo-keep-awake
```

### 1.3 Environment Variables (.env.local)

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY=your-storage-key
EXPO_PUBLIC_API_URL=https://your-api.com
EXPO_TOKEN=your-eas-token
```

---

## Phase 2: i18n Configuration

### 2.1 Project Structure

```
src/
├── i18n/
│   ├── index.ts           # i18n initialization
│   ├── locales/
│   │   ├── en.json       # English translations
│   │   ├── fr.json       # French translations
│   │   └── es.json       # Spanish translations
│   └── utils.ts          # Translation helpers
```

### 2.2 i18n Configuration File

**File**: `src/i18n/index.ts`

```typescript
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import { getLocales } from "expo-localization";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
};

// Get device locale
const getDeviceLanguage = (): string => {
  const locales = getLocales();
  const locale = locales[0]?.languageCode || "en";
  return ["en", "fr", "es"].includes(locale) ? locale : "en";
};

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  compatibilityJSON: "v3",
});

export default i18n;
```

### 2.3 Translation Files

**File**: `src/i18n/locales/en.json`

```json
{
  "common": {
    "loading": "Loading...",
    "error": "An error occurred",
    "retry": "Retry",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "save": "Save",
    "delete": "Delete",
    "edit": "Edit",
    "back": "Back",
    "next": "Next",
    "submit": "Submit",
    "success": "Success",
    "offline": "You are offline"
  },
  "auth": {
    "title": "Vector Elegans",
    "email": "Email",
    "password": "Password",
    "signIn": "Sign In",
    "signOut": "Sign Out",
    "forgotPassword": "Forgot Password?",
    "invalidCredentials": "Invalid email or password",
    "driverOnly": "Access reserved for drivers",
    "sessionExpired": "Session expired. Please sign in again."
  },
  "dashboard": {
    "title": "Dashboard",
    "online": "Online",
    "offline": "Offline",
    "goOnline": "Go Online",
    "goOffline": "Go Offline",
    "availableRides": "Available Rides",
    "activeRide": "Active Ride",
    "scheduledRides": "Scheduled",
    "todayEarnings": "Today's Earnings",
    "todayRides": "Today's Rides",
    "rating": "Rating",
    "noRides": "No rides available"
  },
  "ride": {
    "pickup": "Pickup",
    "dropoff": "Dropoff",
    "distance": "Distance",
    "duration": "Duration",
    "price": "Price",
    "estimate": "Estimate",
    "accept": "Accept Ride",
    "decline": "Decline",
    "arrive": "Arrived",
    "startTrip": "Start Trip",
    "completeTrip": "Complete Trip",
    "cancelRide": "Cancel Ride",
    "countdown": "Respond in {{seconds}}s",
    "newRide": "New Ride Request!",
    "rideAccepted": "Ride Accepted",
    "rideCompleted": "Ride Completed",
    "rideCancelled": "Ride Cancelled"
  },
  "profile": {
    "title": "Profile",
    "setup": "Profile Setup",
    "personalInfo": "Personal Information",
    "professionalInfo": "Professional Information",
    "documents": "Documents",
    "validation": "Validation",
    "firstName": "First Name",
    "lastName": "Last Name",
    "phone": "Phone",
    "dateOfBirth": "Date of Birth",
    "address": "Address",
    "city": "City",
    "postalCode": "Postal Code",
    "vtcCardNumber": "VTC Card Number",
    "vtcCardExpiry": "VTC Card Expiry",
    "licenseNumber": "License Number",
    "licenseExpiry": "License Expiry",
    "insuranceNumber": "Insurance Number",
    "insuranceExpiry": "Insurance Expiry",
    "emergencyContact": "Emergency Contact",
    "complete": "Profile Complete",
    "incomplete": "Profile Incomplete",
    "pendingValidation": "Pending Validation",
    "approved": "Approved",
    "rejected": "Rejected",
    "uploadDocument": "Upload Document",
    "documentTypes": {
      "drivingLicense": "Driving License",
      "vtcCard": "VTC Card",
      "insurance": "Insurance",
      "idCard": "ID Card",
      "proofOfAddress": "Proof of Address"
    }
  },
  "documents": {
    "title": "Documents",
    "upload": "Upload",
    "preview": "Preview",
    "status": {
      "pending": "Pending Review",
      "approved": "Approved",
      "rejected": "Rejected"
    },
    "uploadSuccess": "Document uploaded successfully",
    "uploadError": "Failed to upload document",
    "maxSize": "Maximum file size: 10MB",
    "formats": "Supported formats: JPG, PNG, PDF"
  },
  "navigation": {
    "home": "Home",
    "rides": "Rides",
    "earnings": "Earnings",
    "profile": "Profile",
    "settings": "Settings"
  },
  "errors": {
    "networkError": "Network error. Please check your connection.",
    "serverError": "Server error. Please try again later.",
    "locationError": "Unable to get location. Please enable GPS.",
    "permissionDenied": "Permission denied",
    "unknownError": "An unknown error occurred"
  }
}
```

**File**: `src/i18n/locales/fr.json`

```json
{
  "common": {
    "loading": "Chargement...",
    "error": "Une erreur s'est produite",
    "retry": "Réessayer",
    "cancel": "Annuler",
    "confirm": "Confirmer",
    "save": "Enregistrer",
    "delete": "Supprimer",
    "edit": "Modifier",
    "back": "Retour",
    "next": "Suivant",
    "submit": "Soumettre",
    "success": "Succès",
    "offline": "Vous êtes hors ligne"
  },
  "auth": {
    "title": "Vector Elegans",
    "email": "Email",
    "password": "Mot de passe",
    "signIn": "Se connecter",
    "signOut": "Se déconnecter",
    "forgotPassword": "Mot de passe oublié ?",
    "invalidCredentials": "Email ou mot de passe invalide",
    "driverOnly": "Accès réservé aux chauffeurs",
    "sessionExpired": "Session expirée. Veuillez vous reconnecter."
  },
  "dashboard": {
    "title": "Tableau de bord",
    "online": "En ligne",
    "offline": "Hors ligne",
    "goOnline": "Se mettre en ligne",
    "goOffline": "Se mettre hors ligne",
    "availableRides": "Courses disponibles",
    "activeRide": "Course en cours",
    "scheduledRides": "Programmées",
    "todayEarnings": "Gains du jour",
    "todayRides": "Courses du jour",
    "rating": "Note",
    "noRides": "Aucune course disponible"
  },
  "ride": {
    "pickup": "Prise en charge",
    "dropoff": "Destination",
    "distance": "Distance",
    "duration": "Durée",
    "price": "Prix",
    "estimate": "Estimé",
    "accept": "Accepter",
    "decline": "Refuser",
    "arrive": "Arrivé",
    "startTrip": "Démarrer",
    "completeTrip": "Terminer",
    "cancelRide": "Annuler",
    "countdown": "Répondre dans {{seconds}}s",
    "newRide": "Nouvelle demande de course !",
    "rideAccepted": "Course acceptée",
    "rideCompleted": "Course terminée",
    "rideCancelled": "Course annulée"
  },
  "profile": {
    "title": "Profil",
    "setup": "Configuration du profil",
    "personalInfo": "Informations personnelles",
    "professionalInfo": "Informations professionnelles",
    "documents": "Documents",
    "validation": "Validation",
    "firstName": "Prénom",
    "lastName": "Nom",
    "phone": "Téléphone",
    "dateOfBirth": "Date de naissance",
    "address": "Adresse",
    "city": "Ville",
    "postalCode": "Code postal",
    "vtcCardNumber": "Numéro carte VTC",
    "vtcCardExpiry": "Expiration carte VTC",
    "licenseNumber": "Numéro de permis",
    "licenseExpiry": "Expiration permis",
    "insuranceNumber": "Numéro d'assurance",
    "insuranceExpiry": "Expiration assurance",
    "emergencyContact": "Contact d'urgence",
    "complete": "Profil complet",
    "incomplete": "Profil incomplet",
    "pendingValidation": "En attente de validation",
    "approved": "Approuvé",
    "rejected": "Rejeté",
    "uploadDocument": "Télécharger un document",
    "documentTypes": {
      "drivingLicense": "Permis de conduire",
      "vtcCard": "Carte VTC",
      "insurance": "Assurance",
      "idCard": "Pièce d'identité",
      "proofOfAddress": "Justificatif de domicile"
    }
  },
  "documents": {
    "title": "Documents",
    "upload": "Télécharger",
    "preview": "Aperçu",
    "status": {
      "pending": "En attente",
      "approved": "Approuvé",
      "rejected": "Rejeté"
    },
    "uploadSuccess": "Document téléchargé avec succès",
    "uploadError": "Échec du téléchargement",
    "maxSize": "Taille maximale : 10 Mo",
    "formats": "Formats : JPG, PNG, PDF"
  },
  "navigation": {
    "home": "Accueil",
    "rides": "Courses",
    "earnings": "Gains",
    "profile": "Profil",
    "settings": "Paramètres"
  },
  "errors": {
    "networkError": "Erreur réseau. Vérifiez votre connexion.",
    "serverError": "Erreur serveur. Veuillez réessayer plus tard.",
    "locationError": "Impossible d'obtenir la position. Activez le GPS.",
    "permissionDenied": "Permission refusée",
    "unknownError": "Une erreur inconnue s'est produite"
  }
}
```

**File**: `src/i18n/locales/es.json`

```json
{
  "common": {
    "loading": "Cargando...",
    "error": "Ha ocurrido un error",
    "retry": "Reintentar",
    "cancel": "Cancelar",
    "confirm": "Confirmar",
    "save": "Guardar",
    "delete": "Eliminar",
    "edit": "Editar",
    "back": "Atrás",
    "next": "Siguiente",
    "submit": "Enviar",
    "success": "Éxito",
    "offline": "Estás sin conexión"
  },
  "auth": {
    "title": "Vector Elegans",
    "email": "Correo electrónico",
    "password": "Contraseña",
    "signIn": "Iniciar sesión",
    "signOut": "Cerrar sesión",
    "forgotPassword": "¿Olvidaste tu contraseña?",
    "invalidCredentials": "Email o contraseña inválidos",
    "driverOnly": "Acceso reservado para conductores",
    "sessionExpired": "Sesión expirada. Por favor, inicia sesión de nuevo."
  },
  "dashboard": {
    "title": "Panel de control",
    "online": "En línea",
    "offline": "Desconectado",
    "goOnline": "Conectarse",
    "goOffline": "Desconectarse",
    "availableRides": "Viajes disponibles",
    "activeRide": "Viaje activo",
    "scheduledRides": "Programados",
    "todayEarnings": "Ganancias de hoy",
    "todayRides": "Viajes de hoy",
    "rating": "Calificación",
    "noRides": "No hay viajes disponibles"
  },
  "ride": {
    "pickup": "Recogida",
    "dropoff": "Destino",
    "distance": "Distancia",
    "duration": "Duración",
    "price": "Precio",
    "estimate": "Estimado",
    "accept": "Aceptar",
    "decline": "Rechazar",
    "arrive": "Llegado",
    "startTrip": "Iniciar",
    "completeTrip": "Completar",
    "cancelRide": "Cancelar",
    "countdown": "Responde en {{seconds}}s",
    "newRide": "¡Nueva solicitud de viaje!",
    "rideAccepted": "Viaje aceptado",
    "rideCompleted": "Viaje completado",
    "rideCancelled": "Viaje cancelado"
  },
  "profile": {
    "title": "Perfil",
    "setup": "Configuración del perfil",
    "personalInfo": "Información personal",
    "professionalInfo": "Información profesional",
    "documents": "Documentos",
    "validation": "Validación",
    "firstName": "Nombre",
    "lastName": "Apellido",
    "phone": "Teléfono",
    "dateOfBirth": "Fecha de nacimiento",
    "address": "Dirección",
    "city": "Ciudad",
    "postalCode": "Código postal",
    "vtcCardNumber": "Número de tarjeta VTC",
    "vtcCardExpiry": "Vencimiento tarjeta VTC",
    "licenseNumber": "Número de licencia",
    "licenseExpiry": "Vencimiento licencia",
    "insuranceNumber": "Número de seguro",
    "insuranceExpiry": "Vencimiento seguro",
    "emergencyContact": "Contacto de emergencia",
    "complete": "Perfil completo",
    "incomplete": "Perfil incompleto",
    "pendingValidation": "Pendiente de validación",
    "approved": "Aprobado",
    "rejected": "Rechazado",
    "uploadDocument": "Subir documento",
    "documentTypes": {
      "drivingLicense": "Licencia de conducir",
      "vtcCard": "Tarjeta VTC",
      "insurance": "Seguro",
      "idCard": "DNI/Pasaporte",
      "proofOfAddress": "Justificante de domicilio"
    }
  },
  "documents": {
    "title": "Documentos",
    "upload": "Subir",
    "preview": "Vista previa",
    "status": {
      "pending": "Pendiente",
      "approved": "Aprobado",
      "rejected": "Rechazado"
    },
    "uploadSuccess": "Documento subido correctamente",
    "uploadError": "Error al subir el documento",
    "maxSize": "Tamaño máximo: 10 MB",
    "formats": "Formatos: JPG, PNG, PDF"
  },
  "navigation": {
    "home": "Inicio",
    "rides": "Viajes",
    "earnings": "Ganancias",
    "profile": "Perfil",
    "settings": "Ajustes"
  },
  "errors": {
    "networkError": "Error de red. Comprueba tu conexión.",
    "serverError": "Error del servidor. Por favor, inténtalo más tarde.",
    "locationError": "No se puede obtener la ubicación. Activa el GPS.",
    "permissionDenied": "Permiso denegado",
    "unknownError": "Ha ocurrido un error desconocido"
  }
}
```

### 2.4 Using Translations in Components

```typescript
import { useTranslation } from 'react-i18next';
import i18n from './src/i18n';

// In component
const { t, i18n } = useTranslation();

// Example usage
<Text>{t('dashboard.goOnline')}</Text>
<Button title={t('common.confirm')} />

// Change language
const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
};
```

---

## Phase 3: Database Types Migration

### 3.1 Copy Supabase Types

**Source**: `elegance-mobilite tmp/src/lib/types/database.types.ts`
**Destination**: `vector-elegans/src/lib/types/database.types.ts`

### 3.2 Key Tables

- `drivers`: Driver profiles
- `rides`: Ride requests
- `driver_locations`: GPS tracking
- `driver_documents`: Uploaded documents
- `vehicles`: Vehicle information

### 3.3 Key Enums

```typescript
driver_status: "pending_validation" |
  "active" |
  "inactive" |
  "on_vacation" |
  "suspended" |
  "incomplete";
ride_status: "pending" |
  "scheduled" |
  "in-progress" |
  "completed" |
  "client-canceled" |
  "driver-canceled" |
  "admin-canceled" |
  "no-show" |
  "delayed";
vehicle_type_enum: "STANDARD" | "PREMIUM" | "VAN" | "ELECTRIC";
```

### 3.4 Key RPC Functions

- `accept_ride(p_ride_id, p_driver_id)`
- `update_driver_location(lat, lng, heading, speed)`
- `can_driver_accept_rides(user_id)`
- `check_driver_profile_completeness(user_id)`

---

## Phase 4: State Management

### 4.1 Install Zustand

```bash
npm install zustand
```

### 4.2 Driver Store

**File**: `src/lib/stores/driverStore.ts`

```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Ride {
  id: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  estimatedPrice: number | null;
  finalPrice: number | null;
  estimatedDistance: number | null;
  estimatedDuration: number | null;
  status: string;
  clientId?: string;
  pickupTime: string | null;
  createdAt: string;
  vehicleType: string;
  options?: string[];
}

interface DriverStats {
  todayEarnings: number;
  todayRides: number;
  onlineTimeMinutes: number;
  rating: number;
}

interface Location {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

interface DriverState {
  isOnline: boolean;
  activeRide: Ride | null;
  availableRide: Ride | null;
  stats: DriverStats;
  currentLocation: Location | null;
  setIsOnline: (online: boolean) => void;
  setActiveRide: (ride: Ride | null) => void;
  setAvailableRide: (ride: Ride | null) => void;
  clearAvailableRide: () => void;
  updateStats: (stats: Partial<DriverStats>) => void;
  setCurrentLocation: (location: Location | null) => void;
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      isOnline: false,
      setIsOnline: (online) => set({ isOnline: online }),
      activeRide: null,
      setActiveRide: (ride) => set({ activeRide: ride }),
      availableRide: null,
      setAvailableRide: (ride) => set({ availableRide: ride }),
      clearAvailableRide: () => set({ availableRide: null }),
      stats: {
        todayEarnings: 0,
        todayRides: 0,
        onlineTimeMinutes: 0,
        rating: 0,
      },
      updateStats: (newStats) =>
        set((state) => ({
          stats: { ...state.stats, ...newStats },
        })),
      currentLocation: null,
      setCurrentLocation: (location) => set({ currentLocation: location }),
    }),
    {
      name: "driver-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        stats: state.stats,
        activeRide: state.activeRide,
      }),
    },
  ),
);
```

---

## Phase 5: Services

### 5.1 Ride Service

**File**: `src/services/rideService.ts`

Key functions:

- `subscribeToPendingRides()` - Supabase Realtime subscription
- `fetchPendingRides()` - Get pending rides
- `acceptRide(rideId)` - Accept via RPC
- `mapToPendingRide(ride)` - Map DB to frontend type

### 5.2 Auth Helpers

**File**: `src/lib/utils/auth-helpers.ts`

```typescript
import { User } from "@supabase/supabase-js";

export type AppRole =
  | "app_customer"
  | "app_driver"
  | "app_admin"
  | "app_super_admin";

export const ROLES = {
  CUSTOMER: "app_customer",
  DRIVER: "app_driver",
  ADMIN: "app_admin",
  SUPER_ADMIN: "app_super_admin",
} as const;

export function getUserRole(user: User | null): AppRole {
  if (!user) return ROLES.CUSTOMER;
  const role = user.app_metadata?.role as AppRole | undefined;
  return role || ROLES.CUSTOMER;
}

export function isUserDriver(user: User | null): boolean {
  return getUserRole(user) === ROLES.DRIVER;
}

export function isUserAdmin(user: User | null): boolean {
  const role = getUserRole(user);
  return role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
}
```

---

## Phase 6: Custom Hooks

### 6.1 useDriverLocation

**File**: `src/hooks/useDriverLocation.ts`

- Use Expo Location API
- Update every 10 seconds
- Upsert to `driver_locations` table

### 6.2 useRealtimeRides

**File**: `src/hooks/useRealtimeRides.ts`

- Subscribe to pending rides
- Filter by distance < 20km
- Trigger haptic feedback

### 6.3 useNotifications

**File**: `src/hooks/useNotifications.ts`

- Request permissions
- Get push token
- Handle foreground/background

---

## Phase 7: UI Components

### 7.1 AuthScreen

- Check app_metadata.role === 'app_driver'
- Redirect to ProfileSetup if incomplete
- Redirect to Dashboard if approved

### 7.2 DashboardScreen

- Full-screen map (react-native-maps)
- Online/Offline toggle
- Bottom sheet with tabs

### 7.3 FullscreenRideModal

- 20-second countdown
- Ride details (price, distance, duration)
- Swipe-to-accept gesture

### 7.4 ProfileSetupScreen

- 4-step wizard
- Document upload with preview

### 7.5 DocumentUploadScreen

- Multiple document types
- Supabase Storage upload
- Status tracking

---

## Phase 8: Navigation Structure

```typescript
// RootStackParamList
type RootStackParamList = {
  Auth: undefined;
  ProfileSetup: undefined;
  Dashboard: undefined;
  RideDetail: { rideId: string };
  DocumentUpload: { documentType?: string };
  Settings: undefined;
};

// TabNavigator (after dashboard)
type TabParamList = {
  Home: undefined;
  Rides: undefined;
  Earnings: undefined;
  Profile: undefined;
};
```

---

## Phase 9: App Configuration

### 9.1 app.json Updates

```json
{
  "expo": {
    "name": "Vector Elegans Driver",
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow Vector Elegans to use your location for trip tracking."
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#000000"
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

### 9.2 Root Component

**File**: `App.tsx`

```typescript
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import './i18n';
import { AppNavigator } from './src/navigation/AppNavigator';
import { supabase } from './src/lib/supabase';
import { useDriverStore } from './src/lib/stores/driverStore';

export default function App() {
  const [loading, setLoading] = useState(true);
  const { setCurrentLocation } = useDriverStore();

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Initialize driver data
        }
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProviderContainer>
          <AppNavigator />
         >
        <Navigation <StatusBar style="auto" />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

---

## Phase 10: Docker & Deployment

### 10.1 Dockerfile (Updated)

```dockerfile
FROM expo/eas-cli:latest

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8081

CMD ["npx", "expo", "start", "--tunnel"]
```

### 10.2 docker-compose.yml (Development)

```yaml
services:
  expo:
    build: .
    ports:
      - "8081:8081"
    environment:
      - EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL}
      - EXPO_PUBLIC_SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY}
    volumes:
      - .:/app
    command: npx expo start --tunnel

  eas-build:
    build: .
    profiles:
      - build
    command: npx eas build --platform=all --profile=production
    environment:
      - EXPO_TOKEN=${EXPO_TOKEN}
```

### 10.3 Commands

```bash
# Development
docker-compose up expo

# Production Build
docker-compose --profile build up eas-build

# Direct commands (if Docker not available)
npx expo start
npx expo run:android
npx expo run:ios
```

---

## GitOps Workflow

### 1. Local Development

```bash
# Clone repository
git clone https://github.com/jawadbentaleb-dot/vector-elegans-driver.git
cd vector-elegans-driver

# Install dependencies
npm install

# Start development
npm start
# or
docker-compose up expo
```

### 2. Development Cycle

```bash
# Create feature branch
git checkout -b feature/driver-dashboard

# Make changes
# ... edit files ...

# Commit with conventional commits
git add .
git commit -m "feat: add driver dashboard with map"

# Push to remote
git push origin feature/driver-dashboard

# Create pull request (GitHub Actions will run tests)
```

### 3. CI/CD (GitHub Actions)

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      - run: npm ci
      - run: npx expo lint
      - run: npx tsc --noEmit
```

---

## Summary

### Key Deliverables

- [x] GitHub repository: `jawadbentaleb-dot/vector-elegans-driver`
- [ ] i18n setup with en/fr/es
- [ ] Zustand driver store
- [ ] Supabase services
- [ ] Custom hooks (location, realtime, notifications)
- [ ] Full UI components
- [ ] Docker configuration
- [ ] GitOps workflow

### Dependencies

```bash
npm install \
  zustand \
  react-native-maps \
  @react-navigation/native \
  @react-navigation/native-stack \
  @react-navigation/bottom-tabs \
  @react-native-async-storage/async-storage \
  react-native-gesture-handler \
  react-native-safe-area-context \
  react-native-screens

npx expo install \
  expo-localization \
  i18next \
  react-i18next \
  expo-av \
  expo-haptics \
  expo-keep-awake \
  expo-notifications \
  expo-location \
  expo-image-picker \
  expo-secure-store \
  expo-file-system
```

### Timeline

- Phase 1-2: Environment & i18n (2h)
- Phase 3-4: Types & State (3h)
- Phase 5-6: Services & Hooks (4h)
- Phase 7-8: UI Components (6h)
- Phase 9-10: Integration & Deploy (3h)

**Total Estimated: 18 hours**
