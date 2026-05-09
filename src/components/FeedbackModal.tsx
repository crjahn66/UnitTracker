import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID  = 'service_nj6jht6';
const EMAILJS_TEMPLATE_ID = 'template_hd31ssm';
const EMAILJS_PUBLIC_KEY  = 'g-zc9hAI8Xg1RKU4w';

type FeedbackType = 'Bug Report' | 'Feature Request' | 'General Feedback';

interface Props {
  userEmail?: string | null;
  onClose: () => void;
}

function showAlert(title: string, msg: string) {
  if (Platform.OS === 'web') { (window as any).alert(`${title}\n${msg}`); }
  else { Alert.alert(title, msg); }
}

export default function FeedbackModal({ userEmail, onClose }: Props) {
  const [type, setType] = useState<FeedbackType>('Feature Request');
  const [name, setName] = useState(userEmail?.replace('@red.group', '') ?? '');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!summary.trim()) { showAlert('Required', 'Please enter a summary.'); return; }
    setSending(true);
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          type,
          from_name: name.trim() || 'Unknown',
          summary: summary.trim(),
          message: details.trim() || '(no details provided)',
        },
        EMAILJS_PUBLIC_KEY,
      );
      setSent(true);
    } catch (e: any) {
      showAlert('Failed to Send', e?.message ?? 'Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Send Feedback</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#8b949e" />
            </TouchableOpacity>
          </View>

          {sent ? (
            <View style={s.successBox}>
              <Ionicons name="checkmark-circle" size={48} color="#3fb950" style={{ marginBottom: 12 }} />
              <Text style={s.successTitle}>Feedback Sent</Text>
              <Text style={s.successSub}>Thanks — we'll review your submission shortly.</Text>
              <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={s.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Type</Text>
              <View style={s.typeRow}>
                {(['Bug Report', 'Feature Request', 'General Feedback'] as FeedbackType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeBtn, type === t && s.typeBtnActive]}
                    onPress={() => setType(t)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.typeBtnText, type === t && s.typeBtnTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Your Name</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Name"
                placeholderTextColor="#6e7681"
              />

              <Text style={s.label}>Summary</Text>
              <TextInput
                style={s.input}
                value={summary}
                onChangeText={setSummary}
                placeholder="One-line description…"
                placeholderTextColor="#6e7681"
              />

              <Text style={s.label}>Details <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={[s.input, s.inputMulti]}
                value={details}
                onChangeText={setDetails}
                placeholder="Steps to reproduce, context, or anything else…"
                placeholderTextColor="#6e7681"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              <View style={s.btnRow}>
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onClose} activeOpacity={0.8}>
                  <Text style={s.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, s.btnPrimary, sending && s.btnDisabled]}
                  onPress={handleSend}
                  disabled={sending}
                  activeOpacity={0.8}
                >
                  {sending
                    ? <ActivityIndicator color="#0d1117" size="small" style={{ marginRight: 6 }} />
                    : <Ionicons name="send" size={15} color="#0d1117" style={{ marginRight: 6 }} />}
                  <Text style={s.btnPrimaryText}>{sending ? 'Sending…' : 'Send'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  sheet: { backgroundColor: '#161b22', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%', borderTopWidth: 1, borderColor: '#21262d' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  title: { color: '#e6edf3', fontSize: 17, fontWeight: '700' },
  body: { padding: 16, paddingBottom: 32 },
  label: { color: '#8b949e', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  optional: { color: '#6e7681', fontWeight: '400' },
  input: { backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#30363d', borderRadius: 8, padding: 10, color: '#e6edf3', fontSize: 14 },
  inputMulti: { minHeight: 100 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#30363d' },
  typeBtnActive: { backgroundColor: '#58a6ff22', borderColor: '#58a6ff' },
  typeBtnText: { color: '#8b949e', fontSize: 13, fontWeight: '600' },
  typeBtnTextActive: { color: '#58a6ff' },
  btnRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#3fb950' },
  btnPrimaryText: { color: '#0d1117', fontSize: 14, fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: '#30363d' },
  btnGhostText: { color: '#c9d1d9', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  successBox: { alignItems: 'center', padding: 32 },
  successTitle: { color: '#e6edf3', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  successSub: { color: '#8b949e', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  doneBtn: { backgroundColor: '#3fb950', paddingVertical: 10, paddingHorizontal: 32, borderRadius: 8 },
  doneBtnText: { color: '#0d1117', fontSize: 14, fontWeight: '700' },
});
