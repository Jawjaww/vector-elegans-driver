# Guide complet des RLS pour driver_documents

## Vue d'ensemble

Ce guide explique comment configurer et dépanner les politiques RLS (Row Level Security) pour la table `driver_documents` dans Supabase.

## Structure de la table

```sql
-- Structure actuelle de la table
CREATE TABLE public.driver_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES public.drivers(id),
    document_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Politiques RLS requises

### 1. Politique d'INSERT (création de documents)
```sql
CREATE POLICY "drivers_insert_own_docs" ON public.driver_documents
FOR INSERT TO authenticated
WITH CHECK (
  driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
);
```

### 2. Politique de SELECT (lecture de documents)
```sql
CREATE POLICY "drivers_select_own_docs" ON public.driver_documents
FOR SELECT TO authenticated
USING (
  driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
);
```

### 3. Politique d'UPDATE (modification de documents)
```sql
CREATE POLICY "drivers_update_own_docs" ON public.driver_documents
FOR UPDATE TO authenticated
USING (
  driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
);
```

### 4. Politique de DELETE (suppression de documents)
```sql
CREATE POLICY "drivers_delete_own_docs" ON public.driver_documents
FOR DELETE TO authenticated
USING (
  driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
);
```

## Script de création automatique

```sql
-- Activer RLS sur la table
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

-- Créer toutes les politiques de manière idempotente
DO $$
BEGIN
  -- INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'driver_documents' 
    AND policyname = 'drivers_insert_own_docs'
  ) THEN
    CREATE POLICY "drivers_insert_own_docs" ON public.driver_documents
    FOR INSERT TO authenticated
    WITH CHECK (
      driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
    );
  END IF;
  
  -- SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'driver_documents' 
    AND policyname = 'drivers_select_own_docs'
  ) THEN
    CREATE POLICY "drivers_select_own_docs" ON public.driver_documents
    FOR SELECT TO authenticated
    USING (
      driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
    );
  END IF;
  
  -- UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'driver_documents' 
    AND policyname = 'drivers_update_own_docs'
  ) THEN
    CREATE POLICY "drivers_update_own_docs" ON public.driver_documents
    FOR UPDATE TO authenticated
    USING (
      driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
    );
  END IF;
  
  -- DELETE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'driver_documents' 
    AND policyname = 'drivers_delete_own_docs'
  ) THEN
    CREATE POLICY "drivers_delete_own_docs" ON public.driver_documents
    FOR DELETE TO authenticated
    USING (
      driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
    );
  END IF;
END $$;
```

## Tests de validation

### Test 1: Vérifier que RLS est activé
```sql
-- Vérifier que RLS est activé
SELECT rowsecurity 
FROM pg_class c 
JOIN pg_namespace n ON c.relnamespace = n.oid 
WHERE n.nspname = 'public' AND c.relname = 'driver_documents';
-- Doit retourner: t
```

### Test 2: Vérifier les politiques existantes
```sql
-- Lister toutes les politiques
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'driver_documents'
ORDER BY policyname;
```

### Test 3: Test d'INSERT avec RLS
```sql
-- Simuler un utilisateur authentifié
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';

-- Test INSERT (doit réussir)
INSERT INTO public.driver_documents (driver_id, document_type, file_url)
VALUES (
  (SELECT id FROM public.drivers WHERE user_id = '00000000-0000-0000-0000-000000000004' LIMIT 1),
  'driving_license',
  'http://example.com/test.jpg'
) RETURNING id;
```

### Test 4: Test d'accès non autorisé
```sql
-- Essayer d'accéder aux documents d'un autre conducteur (doit échouer)
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';

-- Cette requête ne retournera que les documents du conducteur connecté
SELECT * FROM public.driver_documents 
WHERE driver_id != (SELECT id FROM public.drivers WHERE user_id = '00000000-0000-0000-0000-000000000004' LIMIT 1);
-- Doit retourner: 0 lignes
```

## Dépannage des erreurs courantes

### ❌ Erreur: "new row violates row-level security policy"

**Causes possibles:**
1. RLS non activé sur la table
2. Politiques manquantes
3. Aucun driver associé à l'utilisateur
4. Mauvais driver_id fourni

**Solutions:**
```bash
# 1. Vérifier RLS
psql "$DB_URL" -c "SELECT rowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relname = 'driver_documents';"

# 2. Vérifier les politiques
psql "$DB_URL" -c "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'driver_documents';"

# 3. Vérifier le driver
psql "$DB_URL" -c "SELECT id FROM public.drivers WHERE user_id = 'USER_ID';"

# 4. Appliquer le script de correction
psql "$DB_URL" -f driver_documents_rls_fix.sql
```

### ❌ Erreur: "permission denied for table driver_documents"

**Cause:** RLS activé mais aucune politique permissive

**Solution:**
```sql
-- Vérifier les politiques
SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'driver_documents';

-- Si vide, appliquer le script complet
```

### ❌ Erreur: "relation \"driver_documents\" does not exist"

**Cause:** Table non créée

**Solution:**
```sql
-- Créer la table
CREATE TABLE public.driver_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES public.drivers(id),
    document_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Commandes de diagnostic rapide

```bash
# Vérifier l'état complet
psql "$DB_URL" -c "
SELECT 
  'RLS activé: ' || CASE WHEN rowsecurity THEN 'OUI' ELSE 'NON' END as rls_status,
  'Nb politiques: ' || (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'driver_documents') as policies_count
FROM pg_class c 
JOIN pg_namespace n ON c.relnamespace = n.oid 
WHERE n.nspname = 'public' AND c.relname = 'driver_documents';"

# Voir les politiques détaillées
psql "$DB_URL" -c "
SELECT 
  policyname,
  cmd as operation,
  CASE WHEN qual IS NOT NULL THEN 'Avec condition' ELSE 'Sans condition' END as using_check,
  CASE WHEN with_check IS NOT NULL THEN 'Avec vérification' ELSE 'Sans vérification' END as insert_check
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'driver_documents'
ORDER BY cmd, policyname;"

# Tester avec l'utilisateur actuel
psql "$DB_URL" -c "
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
SELECT 'Peut créer: ' || CASE WHEN EXISTS (SELECT 1 FROM public.drivers WHERE user_id = '00000000-0000-0000-0000-000000000004') THEN 'OUI' ELSE 'NON' END as can_insert;"
```

## Script de réparation automatique

Créez un fichier `fix_driver_documents_rls.sql`:

```sql
-- Script complet de réparation des RLS pour driver_documents

-- Activer RLS
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes politiques (si nécessaire)
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'driver_documents'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON public.driver_documents;';
  END LOOP;
END $$;

-- Recréer toutes les politiques
CREATE POLICY "drivers_insert_own_docs" ON public.driver_documents
FOR INSERT TO authenticated
WITH CHECK (
  driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "drivers_select_own_docs" ON public.driver_documents
FOR SELECT TO authenticated
USING (
  driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "drivers_update_own_docs" ON public.driver_documents
FOR UPDATE TO authenticated
USING (
  driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "drivers_delete_own_docs" ON public.driver_documents
FOR DELETE TO authenticated
USING (
  driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
);

-- Vérifier
SELECT 'RLS activé: ' || CASE WHEN rowsecurity THEN 'OUI' ELSE 'NON' END as status
FROM pg_class c 
JOIN pg_namespace n ON c.relnamespace = n.oid 
WHERE n.nspname = 'public' AND c.relname = 'driver_documents';

SELECT count(*) || ' politiques créées' as result
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'driver_documents';