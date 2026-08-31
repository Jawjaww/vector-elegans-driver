import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';

type PreviewModalState = {
  visible: boolean;
  url: string | null;
};

let setPreviewModalState: ((s: PreviewModalState) => void) | null = null;

export function showDocumentImageModal(url: string): boolean {
  if (setPreviewModalState) {
    setPreviewModalState({ visible: true, url });
    return true;
  }
  return false;
}

/** Mount once near app root for in-app image preview. */
export function DocumentPreviewModalHost() {
  const [state, setState] = useState<PreviewModalState>({
    visible: false,
    url: null,
  });

  useEffect(() => {
    setPreviewModalState = setState;
    return () => {
      setPreviewModalState = null;
    };
  }, []);

  if (!state.visible || !state.url) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => setState({ visible: false, url: null })}
    >
      <View className="flex-1 bg-black/90 justify-center items-center p-4">
        <Pressable
          className="absolute top-12 right-6 z-10 bg-white/20 rounded-full px-4 py-2"
          onPress={() => setState({ visible: false, url: null })}
        >
          <Text className="text-white font-semibold">Fermer</Text>
        </Pressable>
        <Image source={{ uri: state.url }} className="w-full h-4/5" resizeMode="contain" />
      </View>
    </Modal>
  );
}
