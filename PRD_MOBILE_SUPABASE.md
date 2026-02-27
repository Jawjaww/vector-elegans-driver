# 📋 Product Requirements Document (PRD) - Vector Elegans (React Native & Supabase)

## 🎯 Vision & Objectifs (React Native & Supabase)

**Vision**: Créer l'application VTC chauffeur la plus élégante et performante du marché, avec une expérience mobile premium et une infrastructure Supabase robuste.

**Objectifs Principaux**:
- ✅ Application chauffeur React Native avec design premium
- ✅ Système de réservation temps réel via Supabase
- ✅ Authentification sécurisée avec rôles (app_driver)
- ✅ Géolocalisation et navigation optimisées
- ✅ Infrastructure Supabase scalable et sécurisée

---

## 👥 Personas & Utilisateurs (Focus Mobile)

### 🚗 **Chauffeurs VTC (App Mobile)**
- **Profil**: Professionnels du transport, 25-55 ans
- **Besoins**: Application rapide, notifications instantanées, navigation fluide
- **Frustrations**: Apps lentes, interface complexe, batterie drainée
- **Objectifs**: Maximiser revenus, minimiser temps d'attente

### 📱 **Clients (Via Web - Info Contextuelle)**
- **Contexte**: Utilisent le portail web pour réserver, chauffeur reçoit sur mobile
- **Interaction**: Réservations apparaissent en temps réel sur app chauffeur

---

## 🚀 Fonctionnalités Principales (React Native)

### 1. **Application Chauffeur Premium**
**User Story**: En tant que chauffeur, je veux une application élégante et rapide pour gérer mes courses.

**Fonctionnalités Mobile**:
- 📱 **Interface glassmorphism** avec animations fluides
- 🔔 **Notifications push** avec vibration et son personnalisé
- 📍 **Localisation GPS** en temps réel avec précision
- 🎯 **Réception courses** avec acceptation/refus en 15 secondes
- 💬 **Chat intégré** avec traduction automatique
- 🧭 **Navigation GPS** intégrée (Google Maps/Waze)
- 📊 **Tableau de bord** revenus et statistiques
- 🔄 **Mode en ligne/hors ligne** avec bouton toggle

**Critères d'Acceptation**:
- Temps de chargement < 2 secondes
- Réponse notification < 3 secondes
- Précision GPS < 10 mètres
- Interface utilisable d'une main
- Mode nuit automatique

---

### 2. **Système de Réservation Temps Réel**
**User Story**: En tant que chauffeur, je veux recevoir les réservations instantanément et les gérer efficacement.

**Fonctionnalités Supabase**:
- ⚡ **WebSocket temps réel** pour nouvelles réservations
- 🔄 **Statuts de course**: en attente → acceptée → en cours → terminée
- 📍 **Mise à jour position** chauffeur toutes les 5 secondes
- 💰 **Calcul prix automatique** via fonctions SQL
- 📱 **Synchronisation** offline/online automatique

**Tables Supabase Principales**:
```sql
-- Rides (courses)
CREATE TABLE rides (
  id UUID PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id),
  customer_id UUID REFERENCES users(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')),
  pickup_location GEOGRAPHY(POINT, 4326),
  dropoff_location GEOGRAPHY(POINT, 4326),
  price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ride status history
CREATE TABLE ride_status_history (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  status TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3. **Authentification & Sécurité (Supabase)**
**User Story**: En tant que chauffeur, je veux un système de connexion sécurisé et rapide.

**Fonctionnalités Auth**:
- 🔐 **JWT sécurisé** avec métadonnées de rôle
- 👤 **Profil chauffeur** avec documents (permis, carte grise)
- ✅ **Validation automatique** via triggers SQL
- 🛡️ **RLS (Row Level Security)** sur toutes les tables
- 📱 **Biométrie** (Face ID/Touch ID) sur mobile

**Configuration Supabase**:
```sql
-- Auto-assign driver role
CREATE OR REPLACE FUNCTION assign_driver_role()
RETURNS TRIGGER AS $$
BEGIN
  NEW.raw_app_meta_data = jsonb_set(COALESCE(NEW.raw_app_meta_data, '{}'), '{role}', '"app_driver"');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- RLS for drivers
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers can only see their own rides" ON rides
  FOR ALL TO authenticated
  USING (auth.uid() = driver_id);
```

---

### 4. **Géolocalisation & Navigation**
**User Story**: En tant que chauffeur, je veux une navigation précise et optimisée.

**Fonctionnalités GPS**:
- 📍 **Tracking GPS** continu en arrière-plan
- 🗺️ **Itinéraires optimisés** avec trafic temps réel
- 📱 **Boussole intégrée** pour orientation facile
- 🔄 **Mise à jour position** toutes les 5 secondes
- ⚡ **Mode économie batterie** automatique

**Services Mobiles**:
```typescript
// Hook de géolocalisation
const useDriverLocation = () => {
  const [location, setLocation] = useState<LocationObject>();
  
  useEffect(() => {
    const subscription = Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000 },
      (newLocation) => {
        setLocation(newLocation);
        // Update Supabase
        supabase.from('drivers').update({
          current_location: `POINT(${newLocation.coords.longitude} ${newLocation.coords.latitude})`
        }).eq('id', driverId);
      }
    );
    
    return () => subscription.remove();
  }, []);
  
  return location;
};
```

---

## 🎨 Design System (React Native)

### **Philosophie Mobile**
- **Dark mode premium** optimisé pour la conduite nocturne
- **Glassmorphism** avec transparences subtiles
- **Animations 60fps** avec react-native-reanimated
- **Touch targets > 44px** pour accessibilité
- **Mode portrait** optimisé (pas de rotation)

### **Composants Mobiles**
```tsx
// ElegantButton avec animations
const ElegantButton = ({ title, onPress, variant }) => (
  <Animated.View style={[styles.glassEffect, animatedStyle]}>
    <TouchableOpacity onPress={onPress}>
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  </Animated.View>
);

const styles = StyleSheet.create({
  glassEffect: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 14,
    padding: 16,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  }
});
```

---

## 🔧 Architecture Supabase

### **Tables Principales (Mobile Focus)**
```sql
-- Drivers (chauffeurs)
CREATE TABLE drivers (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  license_number VARCHAR(50) UNIQUE NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id),
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
  current_location GEOGRAPHY(POINT, 4326),
  rating DECIMAL(3,2) DEFAULT 5.0,
  total_rides INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicles (véhicules)
CREATE TABLE vehicles (
  id UUID PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  license_plate VARCHAR(20) UNIQUE NOT NULL,
  type TEXT CHECK (type IN ('standard', 'premium', 'van', 'electric')),
  photos JSONB,
  documents JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **Fonctions SQL (Mobile)**
```sql
-- Calcul prix course
CREATE OR REPLACE FUNCTION calculate_ride_price(
  pickup_lat FLOAT,
  pickup_lng FLOAT,
  dropoff_lat FLOAT,
  dropoff_lng FLOAT,
  vehicle_type TEXT
) RETURNS DECIMAL AS $$
DECLARE
  distance_km FLOAT;
  base_price DECIMAL;
  per_km_price DECIMAL;
  total_price DECIMAL;
BEGIN
  -- Calcul distance (approximation)
  distance_km := ST_DistanceSphere(
    ST_MakePoint(pickup_lng, pickup_lat),
    ST_MakePoint(dropoff_lng, dropoff_lat)
  ) / 1000;
  
  -- Tarifs selon type véhicule
  SELECT base_rate, per_km_rate INTO base_price, per_km_price
  FROM rates WHERE vehicle_type = calculate_ride_price.vehicle_type;
  
  total_price := base_price + (distance_km * per_km_price);
  
  RETURN ROUND(total_price, 2);
END;
$$ LANGUAGE plpgsql;
```

---

## 📱 Spécifications Mobiles

### **Performance Targets**
- **Temps de démarrage**: < 2 secondes
- **FPS animations**: 60fps constant
- **Taille app**: < 50MB (PWA)
- **Battery usage**: < 5% par heure en navigation
- **Offline capability**: Fonctionnel sans réseau 30min

### **Permissions Mobiles**
```json
{
  "permissions": [
    "LOCATION",
    "LOCATION_BACKGROUND",
    "NOTIFICATIONS",
    "CAMERA",
    "MICROPHONE"
  ]
}
```

### **Push Notifications**
```typescript
// Notification nouvelle course
const sendNewRideNotification = async (ride: Ride) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nouvelle course disponible',
      body: `Course de ${ride.distance}km - ${ride.estimated_price}€`,
      data: { rideId: ride.id },
      sound: 'notification.wav',
      vibrate: [0, 250, 250, 250],
    },
    trigger: null, // Immediate
  });
};
```

---

## 🧪 Testing & Qualité

### **Tests Mobiles**
- **Unit tests**: Jest + React Testing Library
- **Integration tests**: Detox pour E2E
- **Performance**: Flipper pour profiling
- **Accessibility**: Screen reader testing

### **Monitoring Supabase**
- **Query performance**: pg_stat_statements
- **Connection pooling**: PgBouncer metrics
- **Real-time health**: WebSocket monitoring
- **Error tracking**: Sentry integration

---

## 🚀 Déploiement & DevOps

### **Build Mobile**
```bash
# Build production PWA
cd vector-elegans
npm run build:mobile

# Deploy to Expo
expo build:web
expo publish
```

### **Migrations Supabase**
```bash
# Apply migrations
cd infra-supabase
supabase db push

# Generate types
supabase gen types typescript --local > src/types/supabase.ts
```

---

## 📊 KPIs Mobiles

### **Performance Mobile**
- **Temps de réponse API**: < 200ms
- **Taux d'erreur**: < 0.1%
- **Crash rate**: < 0.01%
- **Session duration**: > 5 minutes
- **User retention**: > 60% (7 jours)

### **Business Metrics**
- **Acceptation courses**: > 85%
- **Temps moyen course**: < 25 minutes
- **Satisfaction chauffeur**: > 4.5/5
- **Taux completion**: > 95%

---

## 🎯 Roadmap Mobile (6 mois)

### **Mois 1-2: MVP Mobile**
- ✅ Authentification chauffeur
- ✅ Réception basic courses
- ✅ Navigation GPS
- ✅ Profil et documents

### **Mois 3-4: Premium Mobile**
- 🎨 Design system complet
- 📊 Tableau de bord analytics
- 💬 Chat intégré
- 🔔 Notifications avancées

### **Mois 5-6: Scale Mobile**
- ⚡ Optimisation performance
- 🌍 Multi-langue
- 📱 PWA installable
- 🤖 Features IA

---

**Note**: Ce PRD se concentre spécifiquement sur la partie React Native et Supabase. Le dossier `elegance-mobilite-tmp` sert uniquement de référence pour le design system et les interactions entre portails.