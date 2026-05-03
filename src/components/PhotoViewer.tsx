import React, { useState } from 'react';
import { Modal, View, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { downloadPhoto } from '../utils/imageStorage';

interface Props { uri: string; onClose: () => void; }

export default function PhotoViewer({ uri, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadPhoto(uri);
    } catch (e: any) {
      Alert.alert('Download Failed', e?.message ?? String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close-circle" size={34} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={s.downloadBtn} onPress={handleDownload} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={downloading ? 'hourglass-outline' : 'download-outline'} size={30} color="#fff" />
        </TouchableOpacity>
        <Image source={{ uri }} style={s.image} resizeMode="contain" />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000ee', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 48, right: 16, zIndex: 10 },
  downloadBtn: { position: 'absolute', top: 48, left: 16, zIndex: 10 },
  image: { width: '100%', height: '100%' },
});
