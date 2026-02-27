/**
 * Script de test pour le système de gestion des dossiers
 * Teste la soumission complète, le verrouillage, les notifications et la persistance
 */

import { supabase } from '../supabase';
import { getDossierStatus, submitDossier, validateDossier } from '../services/dossierService';
import { useDriverFolderStore } from '../stores/driverFolderStore';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

/**
 * Test 1: Créer un conducteur de test
 */
async function createTestDriver(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('Aucun utilisateur connecté');
      return null;
    }

    // Vérifier si un conducteur existe déjà
    const { data: existingDriver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existingDriver) {
      console.log('Conducteur de test existant trouvé:', existingDriver.id);
      return existingDriver.id;
    }

    // Créer un nouveau conducteur
    const { data: newDriver, error } = await supabase
      .from('drivers')
      .insert([{
        user_id: user.id,
        first_name: 'Test',
        last_name: 'Conducteur',
        phone: '+33612345678',
        email: 'test@example.com',
        status: 'draft',
        completion_percentage: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Erreur lors de la création du conducteur:', error);
      return null;
    }

    console.log('Conducteur de test créé:', newDriver.id);
    return newDriver.id;
  } catch (error) {
    console.error('Exception lors de la création du conducteur:', error);
    return null;
  }
}

/**
 * Test 2: Vérifier l'état initial du dossier
 */
async function testInitialDossierState(driverId: string): Promise<TestResult> {
  try {
    const status = await getDossierStatus(driverId);
    
    if (!status) {
      return {
        test: 'État initial du dossier',
        passed: false,
        message: 'Impossible de récupérer l\'état du dossier'
      };
    }

    const expected = {
      status: 'draft',
      is_editable: true,
      can_submit: true,
      can_edit_documents: true,
      completion_percentage: 0
    };

    const passed = status.status === expected.status &&
                  status.is_editable === expected.is_editable &&
                  status.can_submit === expected.can_submit &&
                  status.can_edit_documents === expected.can_edit_documents;

    return {
      test: 'État initial du dossier',
      passed,
      message: passed ? 'État initial correct' : 'État initial incorrect',
      details: { actual: status, expected }
    };
  } catch (error) {
    return {
      test: 'État initial du dossier',
      passed: false,
      message: 'Exception lors du test',
      details: error
    };
  }
}

/**
 * Test 3: Simuler la soumission du dossier
 */
async function testDossierSubmission(driverId: string): Promise<TestResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        test: 'Soumission du dossier',
        passed: false,
        message: 'Aucun utilisateur connecté'
      };
    }

    // Mettre à jour le conducteur pour qu'il soit complet (100%)
    await supabase
      .from('drivers')
      .update({
        first_name: 'Test',
        last_name: 'Conducteur',
        phone: '+33612345678',
        date_of_birth: '1990-01-01',
        address_line1: '123 Rue de Test',
        city: 'Testville',
        postal_code: '75000',
        driving_license_number: '123456789012',
        driving_license_expiry_date: '2025-12-31',
        vtc_card_number: 'VTC123456',
        vtc_card_expiry_date: '2025-12-31',
        insurance_number: 'INS123456',
        company_siret: '12345678901234',
        completion_percentage: 100,
        updated_at: new Date().toISOString()
      })
      .eq('id', driverId);

    // Soumettre le dossier
    const result = await submitDossier(driverId, user.id);

    if (!result.success) {
      return {
        test: 'Soumission du dossier',
        passed: false,
        message: `Échec de la soumission: ${result.message}`,
        details: result
      };
    }

    // Vérifier l'état après soumission
    const status = await getDossierStatus(driverId);
    
    const passed = result.success && 
                  result.new_status === 'submitted' &&
                  status?.status === 'submitted' &&
                  status?.is_editable === false &&
                  status?.can_submit === false;

    return {
      test: 'Soumission du dossier',
      passed,
      message: passed ? 'Soumission réussie et verrouillage effectué' : 'Problème avec la soumission',
      details: { result, status }
    };
  } catch (error) {
    return {
      test: 'Soumission du dossier',
      passed: false,
      message: 'Exception lors de la soumission',
      details: error
    };
  }
}

/**
 * Test 4: Vérifier le verrouillage après soumission
 */
async function testPostSubmissionLocking(driverId: string): Promise<TestResult> {
  try {
    const status = await getDossierStatus(driverId);
    
    if (!status) {
      return {
        test: 'Verrouillage après soumission',
        passed: false,
        message: 'Impossible de récupérer l\'état du dossier'
      };
    }

    const passed = status.status === 'submitted' &&
                  status.is_editable === false &&
                  status.can_submit === false;

    return {
      test: 'Verrouillage après soumission',
      passed,
      message: passed ? 'Dossier correctement verrouillé' : 'Verrouillage non effectué',
      details: status
    };
  } catch (error) {
    return {
      test: 'Verrouillage après soumission',
      passed: false,
      message: 'Exception lors du test',
      details: error
    };
  }
}

/**
 * Test 5: Tester la validation du dossier (admin)
 */
async function testDossierValidation(driverId: string): Promise<TestResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        test: 'Validation du dossier',
        passed: false,
        message: 'Aucun utilisateur connecté'
      };
    }

    // Valider le dossier
    const result = await validateDossier(driverId, user.id, true);

    if (!result.success) {
      return {
        test: 'Validation du dossier',
        passed: false,
        message: `Échec de la validation: ${result.message}`,
        details: result
      };
    }

    // Vérifier l'état après validation
    const status = await getDossierStatus(driverId);
    
    const passed = result.success && 
                  result.new_status === 'validated' &&
                  status?.status === 'validated' &&
                  status?.is_editable === false &&
                  status?.can_submit === false;

    return {
      test: 'Validation du dossier',
      passed,
      message: passed ? 'Validation réussie' : 'Problème avec la validation',
      details: { result, status }
    };
  } catch (error) {
    return {
      test: 'Validation du dossier',
      passed: false,
      message: 'Exception lors de la validation',
      details: error
    };
  }
}

/**
 * Test 6: Vérifier la persistance après refresh
 */
async function testStatePersistence(driverId: string): Promise<TestResult> {
  try {
    // Simuler un refresh en récupérant à nouveau l'état
    const status = await getDossierStatus(driverId);
    
    if (!status) {
      return {
        test: 'Persistance après refresh',
        passed: false,
        message: 'Impossible de récupérer l\'état du dossier'
      };
    }

    const passed = status.status === 'validated' &&
                  status.is_editable === false &&
                  status.can_submit === false &&
                  status.validated_at !== null;

    return {
      test: 'Persistance après refresh',
      passed,
      message: passed ? 'État persistant après refresh' : 'Problème de persistance',
      details: status
    };
  } catch (error) {
    return {
      test: 'Persistance après refresh',
      passed: false,
      message: 'Exception lors du test',
      details: error
    };
  }
}

/**
 * Test 7: Tester le système de notifications
 */
async function testNotificationSystem(): Promise<TestResult> {
  try {
    const store = useDriverFolderStore.getState();
    
    // Ajouter une notification de test
    store.addNotification({
      type: 'success',
      title: 'Test de notification',
      message: 'Ceci est un test de notification'
    });

    // Vérifier que la notification a été ajoutée
    const notifications = store.notifications;
    const hasNotification = notifications.length > 0 &&
                          notifications[notifications.length - 1].title === 'Test de notification';

    return {
      test: 'Système de notifications',
      passed: hasNotification,
      message: hasNotification ? 'Système de notifications fonctionnel' : 'Problème avec le système de notifications',
      details: { notifications: notifications.length, lastNotification: notifications[notifications.length - 1] }
    };
  } catch (error) {
    return {
      test: 'Système de notifications',
      passed: false,
      message: 'Exception lors du test des notifications',
      details: error
    };
  }
}

/**
 * Fonction principale de test
 */
export async function runDossierSystemTests(): Promise<TestResult[]> {
  console.log('🧪 Début des tests du système de gestion des dossiers...');
  
  const results: TestResult[] = [];
  let driverId: string | null = null;

  try {
    // Test 1: Créer un conducteur de test
    console.log('📋 Création du conducteur de test...');
    driverId = await createTestDriver();
    if (!driverId) {
      results.push({
        test: 'Création du conducteur',
        passed: false,
        message: 'Impossible de créer le conducteur de test'
      });
      return results;
    }

    results.push({
      test: 'Création du conducteur',
      passed: true,
      message: 'Conducteur de test créé avec succès',
      details: { driverId }
    });

    // Test 2: État initial
    console.log('🔍 Test de l\'état initial...');
    results.push(await testInitialDossierState(driverId));

    // Test 3: Soumission du dossier
    console.log('📤 Test de la soumission du dossier...');
    results.push(await testDossierSubmission(driverId));

    // Test 4: Verrouillage après soumission
    console.log('🔒 Test du verrouillage après soumission...');
    results.push(await testPostSubmissionLocking(driverId));

    // Test 5: Validation du dossier
    console.log('✅ Test de la validation du dossier...');
    results.push(await testDossierValidation(driverId));

    // Test 6: Persistance après refresh
    console.log('🔄 Test de la persistance...');
    results.push(await testStatePersistence(driverId));

    // Test 7: Système de notifications
    console.log('🔔 Test du système de notifications...');
    results.push(await testNotificationSystem());

  } catch (error) {
    console.error('💥 Erreur fatale lors des tests:', error);
    results.push({
      test: 'Suite de tests',
      passed: false,
      message: 'Erreur fatale lors de l\'exécution des tests',
      details: error
    });
  }

  // Nettoyage
  if (driverId) {
    console.log('🧹 Nettoyage...');
    try {
      await supabase.from('drivers').delete().eq('id', driverId);
      console.log('Conducteur de test supprimé');
    } catch (error) {
      console.warn('Impossible de supprimer le conducteur de test:', error);
    }
  }

  // Afficher le résumé
  console.log('\n📊 Résumé des tests:');
  console.log('===================');
  results.forEach((result, index) => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${index + 1}. ${status} ${result.test}: ${result.message}`);
  });

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`\n📈 Résultat: ${passedCount}/${totalCount} tests passés`);

  return results;
}

/**
 * Fonction pour tester rapidement un aspect spécifique
 */
export async function quickTest(feature: 'submission' | 'locking' | 'validation' | 'notifications') {
  console.log(`⚡ Test rapide: ${feature}`);
  
  const driverId = await createTestDriver();
  if (!driverId) {
    console.error('Impossible de créer le conducteur de test');
    return;
  }

  try {
    switch (feature) {
      case 'submission':
        console.log(await testDossierSubmission(driverId));
        break;
      case 'locking':
        await testDossierSubmission(driverId);
        console.log(await testPostSubmissionLocking(driverId));
        break;
      case 'validation':
        await testDossierSubmission(driverId);
        console.log(await testDossierValidation(driverId));
        break;
      case 'notifications':
        console.log(await testNotificationSystem());
        break;
    }
  } finally {
    // Nettoyer
    if (driverId) {
      await supabase.from('drivers').delete().eq('id', driverId);
    }
  }
}