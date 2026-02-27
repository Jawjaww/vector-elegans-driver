# Guide de référence rapide Supabase pour IA/LLM

## Commandes essentielles (copier-coller direct)

### Démarrage/Arrêt
```bash
# Démarrer Supabase
cd /Users/beij/Documents/dev/vector-elegans-project/infra-supabase && supabase start

# Vérifier le statut
supabase status

# Arrêter
supabase stop

# Reset complet avec attente
cd /Users/beij/Documents/dev/vector-elegans-project/infra-supabase && supabase db reset && sleep 5
```

### Connexion base de données
```bash
# Connexion interactive
psql postgresql://postgres:postgres@localhost:54325/postgres

# Exécuter une commande
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT 1;"

# Exécuter un script SQL
psql postgresql://postgres:postgres@localhost:54325/postgres -f script.sql
```

### Vérifications rapides
```bash
# Vérifier les politiques RLS
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT schemaname, tablename, policyname FROM pg_policies ORDER BY 1,2,3;"

# Vérifier les fonctions
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT n.nspname as schema, p.proname as name FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' ORDER BY 1,2;"

# Vérifier les buckets storage
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT id, name, public FROM storage.buckets;"

# Vérifier les données drivers
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT id, user_id, created_at FROM public.drivers LIMIT 5;"
```

### Tests RLS
```bash
# Tester la fonction check_driver_upload_permission
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT public.check_driver_upload_permission('506e389d-1c2c-4501-bf71-c66dad5376e6/driving_license/test.jpg', '00000000-0000-0000-0000-000000000004');"

# Tester l'insertion avec RLS
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SET ROLE authenticated; INSERT INTO public.driver_documents (driver_id, document_type, file_url) VALUES ('506e389d-1c2c-4501-bf71-c66dad5376e6', 'driving_license', 'test.jpg');"
```

## Patterns de code critiques

### Migration avec gestion d'erreurs
```sql
-- Pattern obligatoire pour toutes les migrations
DO $$
BEGIN
  -- Votre code ici avec vérification EXISTS
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ma_table') THEN
    CREATE TABLE public.ma_table (...);
  END IF;
EXCEPTION 
  WHEN OTHERS THEN 
    RAISE WARNING 'Erreur migration: %', SQLERRM;
END $$;
```

### Fonction RLS sécurisée
```sql
CREATE OR REPLACE FUNCTION public.check_permission(p_path TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Logique de vérification
  RETURN EXISTS (...);
EXCEPTION 
  WHEN OTHERS THEN 
    RAISE WARNING 'Erreur fonction: %', SQLERRM; 
    RETURN FALSE;
END;
$$;
```

### Upload avec gestion driver_id
```typescript
// Pattern TypeScript pour upload sécurisé
const uploadDocument = async (userId: string, documentType: string, file: File) => {
  // Récupérer le driver_id depuis la base
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (!driver) throw new Error('Driver not found');
  
  const filePath = `${driver.id}/${documentType}/${Date.now()}_${file.name}`;
  
  const { data, error } = await supabase.storage
    .from('driver-documents')
    .upload(filePath, file);
  
  return { data, error };
};
```

## Erreurs fréquentes et solutions immédiates

### ❌ "must be owner of table objects"
```bash
# Solution: Le message est normal, continuer l'exécution
# La migration doit continuer malgré l'avertissement
```

### ❌ "connection refused port 54322"
```bash
# Solution: Utiliser le bon port
psql postgresql://postgres:postgres@localhost:54325/postgres
```

### ❌ "new row violates rls policy"
```bash
# Vérifier le chemin d'upload
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT public.check_driver_upload_permission('CHEMIN', 'USER_ID');"

# Appliquer politiques storage si nécessaire
psql postgresql://postgres:postgres@localhost:54325/postgres -f supabase_storage_policies_manual.sql
```

### ❌ "Driver not found"
```bash
# Vérifier que le driver existe
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT id, user_id FROM public.drivers WHERE user_id = 'USER_ID';"
```

## Workflow complet de reset

```bash
#!/bin/bash
# Reset complet et sécurisé

echo "🔄 Reset Supabase complet..."

# 1. Sauvegarder
echo "💾 Sauvegarde..."
docker exec -t supabase-db pg_dump -U postgres -d postgres > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Stop/Start
cd /Users/beij/Documents/dev/vector-elegans-project/infra-supabase
supabase stop
sleep 3
supabase start
sleep 10

# 3. Appliquer migrations
echo "📊 Migrations..."
supabase db reset

# 4. Appliquer politiques storage manuelles
echo "🔐 Politiques storage..."
if [ -f "../vector-elegans/supabase_storage_policies_manual.sql" ]; then
  psql postgresql://postgres:postgres@localhost:54325/postgres -f ../vector-elegans/supabase_storage_policies_manual.sql
fi

# 5. Vérifier
echo "✅ Vérification..."
psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT count(*) FROM pg_policies;"

echo "✅ Reset terminé avec succès"
```

## Variables d'environnement critiques

```bash
# Toujours définir ces variables
export SUPABASE_URL="http://localhost:54321"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyHegSpYU2Xg25g0bHlCHCj4Ki"

# Pour les scripts
export DB_URL="postgresql://postgres:postgres@localhost:54325/postgres"
```

## Commandes de débogage avancé

```bash
# Voir toutes les politiques
psql $DB_URL -c "SELECT schemaname, tablename, policyname, cmd, qual, with_check FROM pg_policies ORDER BY 1,2,3;"

# Voir les roles
psql $DB_URL -c "SELECT rolname, rolsuper, rolcreaterole FROM pg_roles WHERE rolname LIKE '%supabase%';"

# Voir les propriétaires de tables
psql $DB_URL -c "SELECT schemaname, tablename, tableowner FROM pg_tables WHERE schemaname IN ('public', 'storage') ORDER BY 1,2;"

# Test d'upload complet
psql $DB_URL -c "SELECT 
  public.check_driver_upload_permission('506e389d-1c2c-4501-bf71-c66dad5376e6/driving_license/test.jpg', '00000000-0000-0000-0000-000000000004') as storage_check,
  EXISTS (SELECT 1 FROM public.drivers WHERE id = '506e389d-1c2c-4501-bf71-c66dad5376e6' AND user_id = '00000000-0000-0000-0000-000000000004') as driver_exists;"
```

Ce guide permet à une IA d'exécuter immédiatement les commandes correctes sans recherche ni itération.