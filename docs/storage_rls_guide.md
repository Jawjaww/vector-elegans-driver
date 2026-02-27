# Guide : Résolution des problèmes RLS Storage avec Supabase CLI

## Problème
Les politiques RLS sur le schéma `storage` ne peuvent pas être créées via migrations locales (`supabase db reset`) car le schéma `storage` est géré par le système.

## Solutions

### 1. Développement Local (Immediat)
**Utiliser le script manuel après chaque reset :**
```bash
npx supabase db reset
psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase_storage_policies_manual.sql
```

### 2. Production (Cloud)
**Les migrations fonctionnent normalement sur Supabase Cloud.**
Le schéma `storage` n'a pas les mêmes restrictions en production.

### 3. Script de post-reset (Recommandé)
Créer un script npm dans `package.json` :
```json
{
  "scripts": {
    "db:reset": "supabase db reset && npm run db:storage-policies",
    "db:storage-policies": "psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase_storage_policies_manual.sql"
  }
}
```

### 4. Alternative : Edge Function
Créer une Edge Function qui applique les politiques via l'API admin (plus complexe).

## Limitations connues
- **Local** : Impossible de créer des politiques sur `storage.objects` via migration
- **Cloud** : Fonctionne normalement
- **Solution** : Script manuel pour le développement local

## Documentation officielle
- [Supabase Storage RLS](https://supabase.com/docs/guides/storage/security/row-level-security)
- [Supabase Local Development](https://supabase.com/docs/guides/local-development)