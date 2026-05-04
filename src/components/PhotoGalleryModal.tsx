import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Unit, COMPONENTS } from '../types';
import PhotoViewer from './PhotoViewer';

interface PhotoItem { uri: string; context: string; }

interface Props { unit: Unit; onClose: () => void; }

export default function PhotoGalleryModal({ unit, onClose }: Props) {
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  const photos = useMemo((): PhotoItem[] => {
    const items: PhotoItem[] = [];
    for (const comp of COMPONENTS) {
      const data = unit.components[comp.key];
      const label = unit.customComponentLabels?.[comp.key] ?? comp.label;
      for (const uri of (data.progressImages ?? []).filter(u => u.startsWith('https://')))
        items.push({ uri, context: `${label} · Progress` });
      for (const uri of (data.goodImages ?? []).filter(u => u.startsWith('https://')))
        items.push({ uri, context: `${label} · Good` });
      for (const issue of data.issues.filter(i => !i.deleted))
        for (const uri of (issue.images ?? []).filter(u => u.startsWith('https://')))
          items.push({ uri, context: `${label} · Issue` });
    }
    for (const m of (unit.miscEquipment ?? []).filter(m => !m.deleted)) {
      const label = m.label || 'Misc Equipment';
      for (const uri of (m.progressImages ?? []).filter(u => u.startsWith('https://')))
        items.push({ uri, context: `${label} · Progress` });
      for (const uri of (m.goodImages ?? []).filter(u => u.startsWith('https://')))
        items.push({ uri, context: `${label} · Good` });
      for (const issue of m.issues.filter(i => !i.deleted))
        for (const uri of (issue.images ?? []).filter(u => u.startsWith('https://')))
          items.push({ uri, context: `${label} · Issue` });
    }
    return items;
  }, [unit]);

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#e6edf3" />
          </TouchableOpacity>
          <Text style={s.title}>Photos</Text>
          <Text style={s.count}>{photos.length}</Text>
        </View>
        {photos.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="images-outline" size={56} color="#30363d" />
            <Text style={s.emptyText}>No synced photos for this unit</Text>
          </View>
        ) : (
          <FlatList
            data={photos}
            keyExtractor={(item, idx) => `${item.uri}-${idx}`}
            numColumns={3}
            contentContainerStyle={s.grid}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.thumb} onPress={() => setViewingPhoto(item.uri)} activeOpacity={0.85}>
                <Image source={{ uri: item.uri }} style={s.thumbImg} />
                <View style={s.thumbLabel}>
                  <Text style={s.thumbLabelText} numberOfLines={1}>{item.context}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
      {viewingPhoto && <PhotoViewer uri={viewingPhoto} onClose={() => setViewingPhoto(null)} />}
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161b22', borderBottomWidth: 1, borderBottomColor: '#21262d',
    paddingHorizontal: 14, paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 52 : 12,
  },
  backBtn: { marginRight: 12, padding: 2 },
  title: { color: '#e6edf3', fontSize: 17, fontWeight: '700', flex: 1 },
  count: { color: '#8b949e', fontSize: 14 },
  grid: { padding: 2 },
  thumb: { flex: 1, margin: 2, backgroundColor: '#161b22', borderRadius: 4, overflow: 'hidden' },
  thumbImg: { width: '100%', aspectRatio: 1 },
  thumbLabel: { padding: 4 },
  thumbLabelText: { color: '#8b949e', fontSize: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6e7681', fontSize: 15, marginTop: 14 },
});
