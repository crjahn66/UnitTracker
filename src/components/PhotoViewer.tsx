import React from 'react';
import { Modal, View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props { uri: string; onClose: () => void; }

export default function PhotoViewer({ uri, onClose }: Props) {
  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close-circle" size={34} color="#fff" />
        </TouchableOpacity>
        <Image source={{ uri }} style={s.image} resizeMode="contain" />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000ee', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 48, right: 16, zIndex: 10 },
  image: { width: '100%', height: '100%' },
});
