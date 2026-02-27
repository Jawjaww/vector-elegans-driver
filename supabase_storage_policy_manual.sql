-- Ce script doit être exécuté manuellement dans l'éditeur SQL du Dashboard Supabase
-- car les migrations automatiques n'ont pas les droits suffisants sur le schéma 'storage'.

-- 1. Autoriser l'upload pour les utilisateurs authentifiés
CREATE POLICY "Authenticated users can upload driver documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Autoriser la mise à jour
CREATE POLICY "Authenticated users can update driver documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'driver-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Autoriser la lecture
CREATE POLICY "Authenticated users can read driver documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'driver-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Autoriser la suppression
CREATE POLICY "Authenticated users can delete driver documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'driver-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
