import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { runDossierSystemTests, quickTest } from '../lib/tests/dossierSystemTests';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

export const DossierSystemTestRunner: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runFullTests = async () => {
    setIsRunning(true);
    setResults([]);
    
    try {
      const testResults = await runDossierSystemTests();
      setResults(testResults);
      setLastRun(new Date());
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue lors des tests');
      console.error('Erreur lors des tests:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const runQuickTest = async (feature: 'submission' | 'locking' | 'validation' | 'notifications') => {
    setIsRunning(true);
    
    try {
      await quickTest(feature);
      Alert.alert('Succès', `Test rapide ${feature} terminé avec succès`);
    } catch (error) {
      Alert.alert('Erreur', `Erreur lors du test ${feature}`);
      console.error(`Erreur lors du test ${feature}:`, error);
    } finally {
      setIsRunning(false);
    }
  };

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  return (
    <View className="flex-1 bg-black p-4">
      <View className="mb-6">
        <Text className="text-2xl font-bold text-white mb-2">Tests Système Dossier</Text>
        <Text className="text-gray-400">
          Testez le système complet de gestion des dossiers
        </Text>
      </View>

      <ScrollView className="flex-1">
        {/* Boutons de test */}
        <View className="mb-6">
          <Pressable
            onPress={runFullTests}
            disabled={isRunning}
            className={`bg-emerald-600 rounded-lg p-4 mb-3 ${isRunning ? 'opacity-50' : ''}`}
          >
            <View className="flex-row items-center justify-center">
              <Feather name="play" size={20} color="white" className="mr-2" />
              <Text className="text-white font-semibold">
                {isRunning ? 'Tests en cours...' : 'Lancer tous les tests'}
              </Text>
            </View>
          </Pressable>

          {/* Tests rapides */}
          <Text className="text-gray-400 mb-2">Tests rapides :</Text>
          <View className="flex-row flex-wrap gap-2">
            {(['submission', 'locking', 'validation', 'notifications'] as const).map((feature) => (
              <Pressable
                key={feature}
                onPress={() => runQuickTest(feature)}
                disabled={isRunning}
                className={`bg-blue-600 rounded-lg px-3 py-2 ${isRunning ? 'opacity-50' : ''}`}
              >
                <Text className="text-white text-sm font-medium">
                  {feature}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Résultats */}
        {results.length > 0 && (
          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <Text className="text-white font-semibold mr-2">Résultats :</Text>
              <Text className={`${passedCount === totalCount ? 'text-emerald-400' : 'text-yellow-400'}`}>
                {passedCount}/{totalCount} passés
              </Text>
            </View>

            {results.map((result, index) => (
              <View
                key={index}
                className={`rounded-lg p-3 mb-2 ${
                  result.passed ? 'bg-emerald-900/30 border-emerald-500' : 'bg-red-900/30 border-red-500'
                } border`}
              >
                <View className="flex-row items-center">
                  <Feather
                    name={result.passed ? 'check-circle' : 'x-circle'}
                    size={16}
                    color={result.passed ? '#10b981' : '#ef4444'}
                    className="mr-2"
                  />
                  <Text className={`flex-1 font-medium ${
                    result.passed ? 'text-emerald-300' : 'text-red-300'
                  }`}>
                    {result.test}
                  </Text>
                </View>
                <Text className="text-gray-300 text-sm mt-1">
                  {result.message}
                </Text>
                {result.details && (
                  <Text className="text-gray-500 text-xs mt-1">
                    Détails: {JSON.stringify(result.details, null, 2).substring(0, 100)}...
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Statut */}
        {lastRun && (
          <View className="bg-gray-900 rounded-lg p-3">
            <Text className="text-gray-400 text-sm">
              Dernier test: {lastRun.toLocaleString('fr-FR')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};