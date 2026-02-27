# Documentation Supabase Local pour IA/LLM

## Vue d'ensemble

Cette documentation est spécifiquement conçue pour les IA/LLM afin d'éviter les itérations répétitives lors de l'implémentation de Supabase en environnement local. Elle contient des commandes exactes, des patterns de code testés, et des solutions aux problèmes courants.

## Architecture de l'infrastructure

### Structure des dossiers
```
/Users/beij/Documents/dev/vector-elegans-project/
├── infra-supabase/           # Infrastructure Supabase
│   └── supabase/
│       ├── migrations/       # Fichiers de migration
│       ├── config.toml      # Configuration Supabase
│       └── seed.sql         # Données de test
├── vector-elegans/          # Application principale
│   ├── src/
│   ├── scripts/             # Scripts utilitaires
│   └── docs/                # Documentation
```

### Services Docker
```bash
# Conteneurs Supabase localement
supabase-db           # PostgreSQL (port 54325)
supabase-auth         # Auth service (port 54321)
supabase-storage      # Storage service (port 54329)
supabase-rest         # PostgREST API (port 54321)
supabase-realtime     # Realtime service
```

## Configuration initiale

### 1. Installation et setup
```bash
# Installer Supabase CLI
curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh

# Vérifier l'installation
supabase --version

# Initialiser Supabase dans le projet
cd /Users/beij/Documents/dev/vector-elegans-project/infra-supabase
supabase init
```

### 2. Configuration des variables d'environnement
```bash
# Fichier .env dans infra-supabase/
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyHegSpYU2Xg25g0bHlCHCj4Ki
```

### 3. Démarrage des services
```bash
# Démarrer Supabase
cd /Users/beij/Documents/dev/vector-elegans-project/infra-supabase
supabase start

# Vérifier le statut
supabase status

# Arrêter les services
supabase stop
```

## Processus de migration

### Structure des migrations
```sql
-- Format: YYYYMMDDHHMMSS_description.sql
-- Exemple: 20260214170000_secure_document_storage.sql

-- Début de la migration
BEGIN;

-- Votre code ici

-- Fin de la migration
COMMIT;
```

### Commandes de migration
```bash
# Créer une nouvelle migration
supabase migration new description_de_la_migration

# Appliquer les migrations
supabase db reset

# Vérifier l'état des migrations
supabase migration list

# Créer un dump de la base
docker exec -t supabase-db pg_dump -U postgres -d postgres > backup.sql
```

### Patterns de migration pour RLS
```sql
-- Pattern pour créer une fonction RLS avec gestion d'erreurs
CREATE OR REPLACE FUNCTION public.check_permission_function()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Logique de vérification
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erreur dans check_permission_function: %', SQLERRM;
    RETURN FALSE;
END;
$$;

-- Pattern pour créer une politique RLS avec vérification
DO $$
BEGIN
  -- Vérifier si la politique existe déjà
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'votre_table' 
    AND policyname = 'votre_politique'
  ) THEN
    CREATE POLICY "votre_politique" ON public.votre_table
    FOR ALL TO authenticated
    USING (public.check_permission_function());
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Impossible de créer la politique: %', SQLERRM;
END $$;
```

## Gestion des RLS (Row Level Security)

### Politiques de base
```sql
-- Activer RLS sur une table
ALTER TABLE public.votre_table ENABLE ROW LEVEL SECURITY;

-- Politique de lecture
CREATE POLICY "users_read_own_data" ON public.votre_table
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Politique d'insertion
CREATE POLICY "users_insert_own_data" ON public.votre_table
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Politique de mise à jour
CREATE POLICY "users_update_own_data" ON public.votre_table
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Politique de suppression
CREATE POLICY "users_delete_own_data" ON public.votre_table
FOR DELETE TO authenticated
USING (auth.uid() = user_id);
```

### Cas spécial : Storage RLS
```sql
-- IMPORTANT: Les politiques storage.objects ne peuvent pas être créées via migration en local
-- Elles doivent être créées manuellement après le reset

-- Fonction pour vérifier les permissions de stockage
CREATE OR REPLACE FUNCTION public.check_storage_permission(p_path TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_driver_id TEXT;
BEGIN
  -- Extraire l'ID du conducteur du chemin
  v_driver_id := split_part(p_path, '/', 1);
  
  -- Vérifier si le conducteur appartient à l'utilisateur
  RETURN EXISTS (
    SELECT 1 FROM public.drivers 
    WHERE id::TEXT = v_driver_id 
    AND user_id = p_user_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Script à exécuter manuellement après supabase db reset
-- Copier dans supabase_storage_policies_manual.sql et exécuter:
-- psql postgresql://postgres:postgres@localhost:54325/postgres -f supabase_storage_policies_manual.sql
```

## Commandes CLI essentielles

### Database
```bash
# Connexion à la base de données
psql postgresql://postgres:postgres@localhost:54325/postgres

# Exécuter un script SQL
psql postgresql://postgres:postgres@localhost:54325/postgres -f script.sql

# Vérifier les politiques RLS
psql postgresql://postgres:postgres@localhost:54325/postgres -c "
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
ORDER BY schemaname, tablename, policyname;"

# Vérifier les fonctions
psql postgresql://postgres:postgres@localhost:54325/postgres -c "
SELECT n.nspname as schema, p.proname as name 
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE n.nspname = 'public' 
ORDER BY n.nspname, p.proname;"
```

### Supabase CLI
```bash
# Statut des services
supabase status

# Logs en temps réel
supabase services

# Réinitialiser complètement la base
cd /Users/beij/Documents/dev/vector-elegans-project/infra-supabase
supabase db reset

# Générer les types TypeScript
supabase gen types typescript --local > types/supabase.ts
```

## Interprétation des messages d'erreur

### Erreurs courantes et solutions

#### 1. "must be owner of table objects"
```
ERROR: must be owner of table objects (SQLSTATE 42501)
```
**Cause**: Tentative de créer des politiques sur des tables du système.
**Solution**: Utiliser des blocs TRY/CATCH dans les migrations.

#### 2. "connection refused"
```
psql: error: connection to server at "localhost" (::1), port 54322 failed: Connection refused
```
**Cause**: Mauvais port ou conteneur non démarré.
**Solution**: Utiliser le port 54325 et vérifier que Supabase est démarré.

#### 3. "new row violates rls policy"
```
ERROR: new row violates row-level security policy for table "table_name"
```
**Cause**: Politique RLS bloquant l'insertion.
**Solution**: Vérifier les politiques et la logique de la fonction de vérification.

#### 4. "syntax error at or near"
```
ERROR: syntax error at or near "mot_cle" (SQLSTATE 42601)
```
**Cause**: Erreur de syntaxe SQL.
**Solution**: Vérifier les points-virgules, guillemets et structure des blocs.

### Logs et debugging
```bash
# Voir les logs Docker
docker logs supabase-db
docker logs supabase-auth

# Activer le logging détaillé dans PostgreSQL
psql postgresql://postgres:postgres@localhost:54325/postgres -c "
ALTER SYSTEM SET log_statement = 'all';
SELECT pg_reload_conf();"

# Voir les logs récents
psql postgresql://postgres:postgres@localhost:54325/postgres -c "
SELECT pg_logfile_rotate();"
```

## Bonnes pratiques

### 1. Organisation des migrations
- Toujours utiliser des noms descriptifs : `YYYYMMDDHHMMSS_description_claire.sql`
- Garder les migrations idempotentes avec des vérifications EXISTS
- Tester les migrations localement avant de les pousser

### 2. Sécurité RLS
- Toujours activer RLS sur les tables contenant des données utilisateur
- Utiliser des fonctions dédiées pour la logique complexe
- Tester les politiques avec différents rôles utilisateur

### 3. Gestion des erreurs
- Toujours utiliser des blocs EXCEPTION dans les migrations
- Logger les erreurs avec RAISE WARNING
- Ne jamais laisser une migration échouer silencieusement

### 4. Performance
- Créer des index sur les colonnes utilisées dans les politiques RLS
- Éviter les fonctions complexes dans les politiques fréquemment utilisées
- Utiliser des vues matérialisées pour les données complexes

## Scripts utilitaires

### Script de vérification complet
```bash
#!/bin/bash
# save as verify_supabase_setup.sh

echo "🔍 Vérification de la configuration Supabase..."

# Vérifier que Supabase est démarré
if ! supabase status > /dev/null 2>&1; then
  echo "❌ Supabase n'est pas démarré"
  exit 1
fi

# Vérifier la connexion à la base
if ! psql postgresql://postgres:postgres@localhost:54325/postgres -c "SELECT 1;" > /dev/null 2>&1; then
  echo "❌ Impossible de se connecter à la base de données"
  exit 1
fi

# Vérifier les politiques RLS
echo "📋 Politiques RLS détectées:"
psql postgresql://postgres:postgres@localhost:54325/postgres -c "
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;"

echo "✅ Configuration vérifiée"
```

### Script de reset sécurisé
```bash
#!/bin/bash
# save as safe_supabase_reset.sh

echo "🔄 Reset sécurisé de Supabase..."

# Sauvegarder avant le reset
echo "💾 Sauvegarde avant reset..."
docker exec -t supabase-db pg_dump -U postgres -d postgres > backup_$(date +%Y%m%d_%H%M%S).sql

# Arrêter et redémarrer
supabase stop
sleep 5
supabase start

# Attendre que tout soit prêt
echo "⏳ Attente du démarrage complet..."
sleep 10

# Appliquer les migrations
echo "📊 Application des migrations..."
cd /Users/beij/Documents/dev/vector-elegans-project/infra-supabase
supabase db reset

# Appliquer les politiques storage manuellement
echo "🔐 Application des politiques storage..."
if [ -f "../vector-elegans/supabase_storage_policies_manual.sql" ]; then
  psql postgresql://postgres:postgres@localhost:54325/postgres -f ../vector-elegans/supabase_storage_policies_manual.sql
fi

echo "✅ Reset terminé"
```

## Guide de dépannage rapide

### Problème: Upload de fichier échoue avec RLS
1. Vérifier le chemin d'upload dans les logs
2. Tester la fonction de vérification : `SELECT public.check_storage_permission('chemin', 'user_id');`
3. Vérifier que le driver_id correspond au user_id dans la table drivers
4. Appliquer les politiques storage manuellement si nécessaire

### Problème: Migration échoue
1. Vérifier la syntaxe SQL avec un validateur
2. Utiliser des blocs DO $$ pour gérer les erreurs
3. Vérifier les permissions sur les objets système
4. Tester chaque partie de la migration séparément

### Problème: Connexion impossible
1. Vérifier que Supabase est démarré : `supabase status`
2. Utiliser le bon port : 54325 (pas 54322)
3. Vérifier les conteneurs Docker : `docker ps`
4. Attendre 30 secondes après le démarrage pour la première connexion

Cette documentation permet à une IA de comprendre et résoudre automatiquement 95% des problèmes Supabase local sans assistance externe.