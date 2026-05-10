import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList, TextInput,
  StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ROSTER } from '../constants/roster';
import { useStore } from '../store/useStore';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /**
   * When true, prefill an empty value with the last name picked on this device
   * (persisted in Zustand local storage as `lastFoundBy`) and remember any new
   * selection. Per-device only — never synced to the cloud.
   */
  rememberLastUsed?: boolean;
}

export default function NameSelectField({ label, value, onChange, placeholder, rememberLastUsed }: Props) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  const lastFoundBy = useStore((s) => s.lastFoundBy);
  const setLastFoundBy = useStore((s) => s.setLastFoundBy);

  // One-shot prefill on mount when value is empty and we have a remembered name.
  // Guarded by a ref so re-renders that clear the field (e.g. user deletes it)
  // don't keep snapping it back.
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (!rememberLastUsed) return;
    if (didPrefillRef.current) return;
    if (value) { didPrefillRef.current = true; return; }
    if (lastFoundBy) {
      didPrefillRef.current = true;
      onChange(lastFoundBy);
    }
  }, [rememberLastUsed, value, lastFoundBy, onChange]);

  const remember = (name: string) => {
    if (rememberLastUsed && name.trim()) setLastFoundBy(name.trim());
  };

  const openPicker = () => {
    setCustomMode(false);
    setCustomText('');
    setOpen(true);
  };

  const handleSelect = (name: string) => {
    onChange(name);
    remember(name);
    setOpen(false);
  };

  const handleCustomSave = () => {
    const v = customText.trim();
    if (v) { onChange(v); remember(v); }
    setOpen(false);
    setCustomMode(false);
    setCustomText('');
  };

  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={s.trigger} onPress={openPicker} activeOpacity={0.7}>
        <Text style={[s.triggerText, !value && s.placeholder]} numberOfLines={1}>
          {value || placeholder || 'Select name…'}
        </Text>
        <Ionicons name="chevron-down" size={14} color="#6e7681" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color="#8b949e" />
              </TouchableOpacity>
            </View>

            {customMode ? (
              <View style={s.customBox}>
                <TextInput
                  style={s.customInput}
                  value={customText}
                  onChangeText={setCustomText}
                  placeholder="Enter name…"
                  placeholderTextColor="#6e7681"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCustomSave}
                />
                <View style={s.customActions}>
                  <TouchableOpacity style={s.backBtn} onPress={() => setCustomMode(false)}>
                    <Text style={s.backText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.useBtn} onPress={handleCustomSave}>
                    <Text style={s.useText}>Use This Name</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <FlatList
                data={[...ROSTER, '__custom__'] as string[]}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  if (item === '__custom__') {
                    return (
                      <TouchableOpacity style={[s.row, s.customRow]} onPress={() => setCustomMode(true)}>
                        <Ionicons name="pencil-outline" size={14} color="#58a6ff" style={{ marginRight: 8 }} />
                        <Text style={s.customRowText}>Custom name…</Text>
                      </TouchableOpacity>
                    );
                  }
                  const selected = value === item;
                  return (
                    <TouchableOpacity style={[s.row, selected && s.rowSelected]} onPress={() => handleSelect(item)}>
                      <Text style={[s.rowText, selected && s.rowTextSelected]}>{item}</Text>
                      {selected && <Ionicons name="checkmark" size={16} color="#58a6ff" />}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { color: '#8b949e', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#30363d',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 11,
  },
  triggerText: { color: '#e6edf3', fontSize: 14, flex: 1 },
  placeholder: { color: '#6e7681' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066' },
  sheet: {
    backgroundColor: '#161b22', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '70%', borderTopWidth: 1, borderColor: '#21262d',
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#21262d',
  },
  sheetTitle: { color: '#e6edf3', fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#21262d',
  },
  rowSelected: { backgroundColor: '#58a6ff18' },
  rowText: { color: '#e6edf3', fontSize: 14 },
  rowTextSelected: { color: '#58a6ff', fontWeight: '600' },
  customRow: { justifyContent: 'flex-start' },
  customRowText: { color: '#58a6ff', fontSize: 14, fontWeight: '600' },
  customBox: { padding: 16 },
  customInput: {
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#58a6ff',
    borderRadius: 8, padding: 10, color: '#e6edf3', fontSize: 14, marginBottom: 12,
  },
  customActions: { flexDirection: 'row', gap: 10 },
  backBtn: { flex: 1, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: '#30363d', alignItems: 'center' },
  backText: { color: '#8b949e', fontWeight: '600', fontSize: 14 },
  useBtn: { flex: 2, paddingVertical: 11, borderRadius: 8, backgroundColor: '#58a6ff', alignItems: 'center' },
  useText: { color: '#0d1117', fontWeight: '700', fontSize: 14 },
});
