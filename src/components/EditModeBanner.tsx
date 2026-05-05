import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EDIT_TIMEOUT_MS, useEditMode } from '../context/EditModeContext';

export default function EditModeBanner() {
  const { isEditMode, lastActivity, enterEditMode } = useEditMode();
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    if (!isEditMode) return;
    const tick = () => {
      const elapsed = Date.now() - lastActivity;
      setSecondsLeft(Math.max(0, Math.ceil((EDIT_TIMEOUT_MS - elapsed) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [isEditMode, lastActivity]);

  if (isEditMode) {
    return (
      <View style={[s.banner, s.editBanner]}>
        <Ionicons name="pencil" size={12} color="#fff" style={{ marginRight: 6 }} />
        <Text style={s.editText}>EDIT MODE</Text>
        <Text style={s.countdown}>  ·  Locks in {secondsLeft}s</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity style={[s.banner, s.viewBanner]} onPress={enterEditMode} activeOpacity={0.85}>
      <Ionicons name="lock-closed" size={12} color="#8b949e" style={{ marginRight: 6 }} />
      <Text style={s.viewText}>VIEW ONLY</Text>
      <Text style={s.tapText}>  ·  Tap to edit</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  editBanner: { backgroundColor: '#1a7f37' },
  viewBanner: { backgroundColor: '#161b22', borderBottomWidth: 1, borderBottomColor: '#21262d' },
  editText: { color: '#ffffff', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  countdown: { color: '#b7f0c8', fontSize: 12, fontWeight: '500' },
  viewText: { color: '#8b949e', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  tapText: { color: '#58a6ff', fontSize: 12, fontWeight: '500' },
});
