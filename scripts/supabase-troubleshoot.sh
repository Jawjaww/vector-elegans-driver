#!/bin/bash
# Script de dépannage automatique Supabase pour IA/LLM
# Ce script automatise la résolution des problèmes courants

set -e  # Arrêter sur la première erreur

# Configuration
DB_URL="postgresql://postgres:postgres@localhost:54325/postgres"
SUPABASE_DIR="/Users/beij/Documents/dev/vector-elegans-project/infra-supabase"
SCRIPTS_DIR="/Users/beij/Documents/dev/vector-elegans-project/vector-elegans/scripts"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions de logging
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier si Supabase est démarré
check_supabase_status() {
    log_info "Vérification du statut Supabase..."
    
    if ! command -v supabase &> /dev/null; then
        log_error "Supabase CLI non installé"
        return 1
    fi
    
    cd "$SUPABASE_DIR"
    if ! supabase status > /dev/null 2>&1; then
        log_warning "Supabase non démarré, démarrage en cours..."
        supabase start
        sleep 15  # Attendre le démarrage complet
    fi
    
    log_success "Supabase est démarré"
}

# Vérifier la connexion à la base de données
check_database_connection() {
    log_info "Vérification de la connexion base de données..."
    
    if ! psql "$DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log_error "Impossible de se connecter à la base de données"
        return 1
    fi
    
    log_success "Connexion base de données OK"
}

# Vérifier et créer le bucket storage
check_storage_bucket() {
    log_info "Vérification du bucket storage..."
    
    local bucket_exists=$(psql "$DB_URL" -t -c "SELECT count(*) FROM storage.buckets WHERE name = 'driver-documents';" | tr -d ' ')
    
    if [ "$bucket_exists" = "0" ]; then
        log_warning "Bucket 'driver-documents' manquant, création..."
        psql "$DB_URL" -c "INSERT INTO storage.buckets (id, name, public) VALUES ('driver-documents', 'driver-documents', true);" 2>/dev/null || log_warning "Bucket existe déjà"
    fi
    
    log_success "Bucket storage OK"
}

# Appliquer les politiques RLS pour storage
apply_storage_rls_policies() {
    log_info "Application des politiques RLS storage..."
    
    # Créer la fonction de vérification si elle n'existe pas
    psql "$DB_URL" -c "
    CREATE OR REPLACE FUNCTION public.check_driver_upload_permission(p_path text, p_user_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS \$\$
    DECLARE
      v_driver_id text;
    BEGIN
      v_driver_id := split_part(p_path, '/', 1);
      IF v_driver_id = 'tmp' THEN
        RETURN split_part(p_path, '/', 2) = p_user_id::text;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.drivers 
        WHERE id::text = v_driver_id 
        AND user_id = p_user_id
      );
    END;
    \$\$;" 2>/dev/null || log_warning "Erreur lors de la création de la fonction"
    
    # Appliquer les politiques depuis le fichier manuel
    if [ -f "../vector-elegans/supabase_storage_policies_manual.sql" ]; then
        psql "$DB_URL" -f "../vector-elegans/supabase_storage_policies_manual.sql" 2>/dev/null || log_warning "Politiques storage déjà appliquées"
    fi
    
    log_success "Politiques RLS storage OK"
}

# Vérifier et appliquer les politiques RLS pour driver_documents
check_driver_documents_rls() {
    log_info "Vérification des politiques RLS driver_documents..."
    
    # Vérifier si RLS est activé
    local rls_enabled=$(psql "$DB_URL" -t -c "SELECT rowsecurity FROM pg_class JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND pg_class.relname = 'driver_documents';" | tr -d ' ')
    
    if [ "$rls_enabled" != "t" ]; then
        log_warning "RLS non activé sur driver_documents, activation..."
        psql "$DB_URL" -c "ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;" 2>/dev/null || log_warning "RLS déjà activé"
    fi
    
    # Créer les politiques si elles n'existent pas
    psql "$DB_URL" -c "
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'driver_documents' AND policyname = 'drivers_insert_own_docs') THEN
        CREATE POLICY \"drivers_insert_own_docs\" ON public.driver_documents
        FOR INSERT TO authenticated
        WITH CHECK (
          driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
        );
      END IF;
      
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'driver_documents' AND policyname = 'drivers_select_own_docs') THEN
        CREATE POLICY \"drivers_select_own_docs\" ON public.driver_documents
        FOR SELECT TO authenticated
        USING (
          driver_id = (SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1)
        );
      END IF;
    END \$\$;" 2>/dev/null || log_warning "Politiques déjà existantes"
    
    log_success "Politiques RLS driver_documents OK"
}

# Vérifier la cohérence des données
check_data_consistency() {
    log_info "Vérification de la cohérence des données..."
    
    # Vérifier qu'il y a au moins un driver
    local driver_count=$(psql "$DB_URL" -t -c "SELECT count(*) FROM public.drivers;" | tr -d ' ')
    
    if [ "$driver_count" = "0" ]; then
        log_warning "Aucun driver trouvé, création d'un driver de test..."
        psql "$DB_URL" -c "
        INSERT INTO public.drivers (id, user_id, first_name, last_name, email, phone, status, created_at, updated_at)
        VALUES ('506e389d-1c2c-4501-bf71-c66dad5376e6', '00000000-0000-0000-0000-000000000004', 'Test', 'Driver', 'test@example.com', '+33612345678', 'pending', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;" 2>/dev/null || log_warning "Driver de test existe déjà"
    fi
    
    log_success "Cohérence des données OK"
}

# Tester l'upload complet
test_upload_workflow() {
    log_info "Test du workflow d'upload..."
    
    # Tester la fonction de vérification
    local test_result=$(psql "$DB_URL" -t -c "SELECT public.check_driver_upload_permission('506e389d-1c2c-4501-bf71-c66dad5376e6/driving_license/test.jpg', '00000000-0000-0000-0000-000000000004');" | tr -d ' ')
    
    if [ "$test_result" = "t" ]; then
        log_success "Fonction de vérification OK"
    else
        log_error "Fonction de vérification échoue"
        return 1
    fi
    
    # Tester l'insertion RLS
    local rls_test=$(psql "$DB_URL" -c "
    SET ROLE authenticated; 
    SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
    INSERT INTO public.driver_documents (driver_id, document_type, file_url, created_at)
    VALUES ('506e389d-1c2c-4501-bf71-c66dad5376e6', 'driving_license', 'test.jpg', NOW())
    RETURNING id;" 2>&1 || echo "failed")
    
    if [[ "$rls_test" == *"ERROR"* ]]; then
        log_error "Test RLS échoué: $rls_test"
        return 1
    else
        log_success "Test RLS OK"
    fi
}

# Générer un rapport
generate_report() {
    log_info "Génération du rapport de diagnostic..."
    
    echo ""
    echo "========================================"
    echo "📊 RAPPORT DE DIAGNOSTIC SUPABASE"
    echo "========================================"
    echo ""
    
    echo "🔧 Configuration système:"
    echo "  - Supabase: $(supabase --version 2>/dev/null || echo 'Non installé')"
    echo "  - PostgreSQL: $(psql --version 2>/dev/null || echo 'Non disponible')"
    echo "  - Docker: $(docker --version 2>/dev/null || echo 'Non installé')"
    echo ""
    
    echo "📋 Statut des services:"
    supabase status 2>/dev/null || echo "  - Supabase non démarré"
    echo ""
    
    echo "🗄️ Base de données:"
    psql "$DB_URL" -c "
    SELECT 
      'Tables: ' || count(*) as tables,
      'Politiques RLS: ' || (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') as policies,
      'Fonctions: ' || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public') as functions
    FROM pg_tables 
    WHERE schemaname = 'public';" 2>/dev/null || echo "  - Impossible de se connecter"
    echo ""
    
    echo "📁 Storage:"
    psql "$DB_URL" -c "
    SELECT 
      'Buckets: ' || count(*) as buckets,
      'Objects: ' || count(*) as objects
    FROM storage.buckets b
    LEFT JOIN storage.objects o ON b.id = o.bucket_id;" 2>/dev/null || echo "  - Storage non accessible"
    echo ""
    
    echo "👥 Données:"
    psql "$DB_URL" -c "
    SELECT 
      'Drivers: ' || count(*) as drivers,
      'Documents: ' || count(*) as documents
    FROM public.drivers d
    FULL JOIN public.driver_documents doc ON d.id = doc.driver_id;" 2>/dev/null || echo "  - Données non accessibles"
    echo ""
    
    echo "🔐 Politiques RLS:"
    psql "$DB_URL" -c "
    SELECT schemaname || '.' || tablename || ': ' || policyname as policy
    FROM pg_policies 
    WHERE schemaname IN ('public', 'storage')
    ORDER BY schemaname, tablename, policyname;" 2>/dev/null || echo "  - Aucune politique trouvée"
    echo ""
    
    echo "✅ Tests de validation:"
    local test_result=$(psql "$DB_URL" -t -c "SELECT public.check_driver_upload_permission('506e389d-1c2c-4501-bf71-c66dad5376e6/driving_license/test.jpg', '00000000-0000-0000-0000-000000000004');" 2>/dev/null | tr -d ' ')
    echo "  - Fonction check_driver_upload_permission: $([ "$test_result" = "t" ] && echo "✅ PASS" || echo "❌ FAIL")"
    echo ""
    
    echo "========================================"
    echo "Rapport généré le: $(date)"
    echo "========================================"
}

# Fonction principale
main() {
    echo "🚀 Démarrage du diagnostic automatique Supabase..."
    echo ""
    
    # Exécuter toutes les vérifications
    check_supabase_status
    check_database_connection
    check_storage_bucket
    apply_storage_rls_policies
    check_driver_documents_rls
    check_data_consistency
    test_upload_workflow
    
    echo ""
    log_success "✅ Diagnostic terminé avec succès!"
    echo ""
    
    # Générer le rapport
    generate_report
    
    echo ""
    log_info "💡 Prochaines étapes recommandées:"
    echo "   1. Vérifiez le rapport ci-dessus"
    echo "   2. Testez l'upload dans votre application"
    echo "   3. Si des erreurs persistent, consultez la documentation"
    echo ""
}

# Gestion des erreurs
trap 'log_error "Script interrompu"; exit 1' INT TERM

# Exécution principale
if [ "$1" = "--report-only" ]; then
    generate_report
elif [ "$1" = "--test-only" ]; then
    test_upload_workflow
else
    main "$@"
fi