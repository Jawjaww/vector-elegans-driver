-- Script pour créer les politiques RLS du storage manuellement
-- À exécuter après le reset local

-- Activer RLS sur storage.objects (si pas déjà fait)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Politique pour les uploads (INSERT)
CREATE POLICY "drivers_upload_own_docs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'driver-documents' 
  AND public.check_driver_upload_permission(name, auth.uid())
);

-- Politique pour la lecture (SELECT)  
CREATE POLICY "drivers_view_own_docs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'driver-documents' 
  AND public.check_driver_upload_permission(name, auth.uid())
);

-- Politique pour la suppression (DELETE)
CREATE POLICY "drivers_delete_own_docs" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'driver-documents' 
  AND public.check_driver_upload_permission(name, auth.uid())
);

-- Politique admin (facultatif)
CREATE POLICY "admin_all_access_docs" ON storage.objects
FOR ALL TO authenticated
USING (auth.jwt() ->> 'role' = 'admin');

-- Vérifier les politiques créées
SELECT policyname, cmd, roles, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects';