import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parse, isValid } from 'date-fns';
import { useStore } from '../store/useStore';
import { pushToCloud } from '../utils/sync';
import { GeneralIssue } from '../types';

interface Props {
  onClose: () => void;
}

type ModalView = 'list' | 'addIssue' | 'resolveIssue';

const today = () => format(new Date(), 'MM/dd/yyyy');
const EMPTY_ISSUE  = () => ({ dateFound: today(), foundBy: '', notes: '' });
const EMPTY_RESOLVE = () => ({ dateFixed: today(), fixedBy: '', howFixed: '' });

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') { (window as any).alert(`${title}\n${msg}`); }
  else { Alert.alert(title, msg); }
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return iso; }
}

function parseDate(str: string): string {
  const p = parse(str, 'MM/dd/yyyy', new Date());
  return isValid(p) ? p.toISOString() : new Date().toISOString();
}

// ─── Add Issue Form ────────────────────────────────────────────────────────────

function AddIssueForm({ onSave, onCancel }: {
  onSave: (d: { dateFound: string; foundBy: string; notes: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(EMPTY_ISSUE);
  const set = (key: 'dateFound' | 'foundBy' | 'notes', val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.foundBy.trim()) { showAlert('Required', 'Please enter who found the issue.'); return; }
    if (!form.notes.trim())   { showAlert('Required', 'Please enter issue notes.'); return; }
    onSave(form);
  };

  return (
    <View>
      <Text style={f.formTitle}>Log General Issue</Text>
      <FormField label="Date Found" value={form.dateFound} onChangeText={(v) => set('dateFound', v)} placeholder="MM/DD/YYYY" />
      <FormField label="Found By"   value={form.foundBy}   onChangeText={(v) => set('foundBy', v)}   placeholder="Name / Tech ID" />
      <FormField label="Notes"      value={form.notes}     onChangeText={(v) => set('notes', v)}     placeholder="Describe the issue…" multiline />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}>
          <Text style={f.btnOutlineText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnPrimary]} onPress={handleSave}>
          <Text style={f.btnPrimaryText}>Save Issue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Resolve Form ──────────────────────────────────────────────────────────────

function ResolveForm({ onSave, onCancel }: {
  onSave: (d: { dateFixed: string; fixedBy: string; howFixed: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(EMPTY_RESOLVE);
  const set = (key: 'dateFixed' | 'fixedBy' | 'howFixed', val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.fixedBy.trim())  { showAlert('Required', 'Please enter who fixed the issue.'); return; }
    if (!form.howFixed.trim()) { showAlert('Required', 'Please describe how it was fixed.'); return; }
    onSave(form);
  };

  return (
    <View>
      <Text style={f.formTitle}>Mark as Resolved</Text>
      <FormField label="Date Fixed" value={form.dateFixed} onChangeText={(v) => set('dateFixed', v)} placeholder="MM/DD/YYYY" />
      <FormField label="Fixed By"   value={form.fixedBy}   onChangeText={(v) => set('fixedBy', v)}   placeholder="Name / Tech ID" />
      <FormField label="How Fixed"  value={form.howFixed}  onChangeText={(v) => set('howFixed', v)}  placeholder="Describe the resolution…" multiline />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}>
          <Text style={f.btnOutlineText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnGreen]} onPress={handleSave}>
          <Text style={f.btnPrimaryText}>Mark Resolved</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Issue Card ────────────────────────────────────────────────────────────────

function IssueCard({ issue, onResolve, onDelete }: {
  issue: GeneralIssue;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[ic.card, issue.resolved ? ic.cardResolved : ic.cardOpen]}>
      <TouchableOpacity style={ic.header} onPress={() => setExpanded((e) => !e)} activeOpacity={0.8}>
        <View style={ic.headerLeft}>
          <View style={[ic.badge, issue.resolved ? ic.badgeResolved : ic.badgeOpen]}>
            <Text style={ic.badgeText}>{issue.resolved ? 'Resolved' : 'Open'}</Text>
          </View>
          <Text style={ic.dateText}>{fmtDate(issue.dateFound)}</Text>
        </View>
        <View style={ic.headerRight}>
          <Text style={ic.foundBy} numberOfLines={1}>{issue.foundBy || '—'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#6e7681" style={{ marginLeft: 4 }} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={ic.body}>
          <Text style={ic.notes}>{issue.notes}</Text>
          {issue.resolved && (
            <>
              {issue.dateFixed  ? <Text style={ic.meta}>Fixed: {fmtDate(issue.dateFixed)}</Text> : null}
              {issue.fixedBy    ? <Text style={ic.meta}>By: {issue.fixedBy}</Text> : null}
              {issue.howFixed   ? <Text style={ic.meta}>How: {issue.howFixed}</Text> : null}
            </>
          )}
          {!issue.resolved && (
            <View style={ic.actions}>
              <TouchableOpacity style={[ic.actionBtn, ic.resolveBtn]} onPress={onResolve}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#3fb950" style={{ marginRight: 4 }} />
                <Text style={ic.resolveBtnText}>Mark Resolved</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ic.actionBtn, ic.deleteBtn]} onPress={onDelete}>
                <Ionicons name="trash-outline" size={14} color="#f85149" style={{ marginRight: 4 }} />
                <Text style={ic.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────────────

export default function GeneralIssueModal({ onClose }: Props) {
  const generalIssues     = useStore((state) => state.generalIssues);
  const addGeneralIssue   = useStore((state) => state.addGeneralIssue);
  const updateGeneralIssue = useStore((state) => state.updateGeneralIssue);
  const deleteGeneralIssue = useStore((state) => state.deleteGeneralIssue);

  const [view, setView]           = useState<ModalView>('list');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleAdd = useCallback((data: { dateFound: string; foundBy: string; notes: string }) => {
    addGeneralIssue({
      id: genId(),
      dateFound: parseDate(data.dateFound),
      foundBy: data.foundBy,
      notes: data.notes,
      resolved: false,
    });
    setView('list');
  }, [addGeneralIssue]);

  const handleResolve = useCallback((issueId: string, data: { dateFixed: string; fixedBy: string; howFixed: string }) => {
    updateGeneralIssue(issueId, {
      resolved: true,
      dateFixed: parseDate(data.dateFixed),
      fixedBy: data.fixedBy,
      howFixed: data.howFixed,
    });
    setResolvingId(null);
    setView('list');
  }, [updateGeneralIssue]);

  const handleDelete = useCallback((issueId: string) => {
    const doDelete = () => { deleteGeneralIssue(issueId); pushToCloud().catch(() => {}); };
    if (Platform.OS === 'web') {
      if ((window as any).confirm('Permanently remove this issue?')) doDelete();
    } else {
      Alert.alert('Delete Issue', 'Permanently remove this issue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [deleteGeneralIssue]);

  const active    = generalIssues.filter((i) => !i.deleted);
  const sorted    = [...active].sort((a, b) => b.dateFound.localeCompare(a.dateFound));
  const openCount = active.filter((i) => !i.resolved).length;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={m.sheet}>
          {/* Header */}
          <View style={m.header}>
            <View style={{ flex: 1 }}>
              <Text style={m.title}>General Issues</Text>
              <Text style={m.subtitle}>
                {openCount > 0 ? `${openCount} open` : 'No open issues'}
                {active.length > 0 ? `  ·  ${active.length} total` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Ionicons name="close" size={22} color="#8b949e" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {view === 'addIssue' ? (
            <ScrollView contentContainerStyle={m.body} keyboardShouldPersistTaps="handled">
              <AddIssueForm onSave={handleAdd} onCancel={() => setView('list')} />
            </ScrollView>
          ) : view === 'resolveIssue' && resolvingId ? (
            <ScrollView contentContainerStyle={m.body} keyboardShouldPersistTaps="handled">
              <ResolveForm
                onSave={(data) => handleResolve(resolvingId, data)}
                onCancel={() => { setResolvingId(null); setView('list'); }}
              />
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={m.body} keyboardShouldPersistTaps="handled">
              {sorted.length === 0 && (
                <Text style={m.empty}>No issues logged yet.</Text>
              )}
              {sorted.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onResolve={() => { setResolvingId(issue.id); setView('resolveIssue'); }}
                  onDelete={() => handleDelete(issue.id)}
                />
              ))}
              <TouchableOpacity style={m.addBtn} onPress={() => setView('addIssue')}>
                <Ionicons name="add-circle-outline" size={18} color="#58a6ff" style={{ marginRight: 6 }} />
                <Text style={m.addBtnText}>Log New Issue</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FormField ─────────────────────────────────────────────────────────────────

function FormField({ label, value, onChangeText, placeholder, multiline }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={f.field}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        style={[f.input, multiline && f.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6e7681"
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  sheet: {
    backgroundColor: '#161b22',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: '#21262d',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  title:    { color: '#e6edf3', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  body:     { padding: 16, paddingBottom: 40 },
  empty:    { color: '#6e7681', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#58a6ff',
  },
  addBtnText: { color: '#58a6ff', fontSize: 14, fontWeight: '600' },
});

const ic = StyleSheet.create({
  card:         { borderRadius: 8, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  cardOpen:     { borderColor: '#f85149', backgroundColor: '#f8514911' },
  cardResolved: { borderColor: '#3fb95044', backgroundColor: '#3fb95011' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
  },
  headerLeft:   { flexDirection: 'row', alignItems: 'center' },
  headerRight:  { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  badge:         { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeOpen:     { backgroundColor: '#f85149' },
  badgeResolved: { backgroundColor: '#3fb950' },
  badgeText:    { color: '#fff', fontSize: 10, fontWeight: '700' },
  dateText:     { color: '#8b949e', fontSize: 12, marginLeft: 6 },
  foundBy:      { color: '#8b949e', fontSize: 12, maxWidth: 140 },
  body:         { paddingHorizontal: 10, paddingBottom: 10 },
  notes:        { color: '#e6edf3', fontSize: 13, marginBottom: 6 },
  meta:         { color: '#6e7681', fontSize: 11, marginBottom: 2 },
  actions:      { flexDirection: 'row', marginTop: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 6, borderWidth: 1, marginRight: 8,
  },
  resolveBtn:     { borderColor: '#3fb950' },
  resolveBtnText: { color: '#3fb950', fontSize: 12, fontWeight: '600' },
  deleteBtn:      { borderColor: '#f85149' },
  deleteBtnText:  { color: '#f85149', fontSize: 12, fontWeight: '600' },
});

const f = StyleSheet.create({
  formTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  field:     { marginBottom: 14 },
  label:     { color: '#8b949e', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#0d1117',
    borderWidth: 1, borderColor: '#30363d', borderRadius: 8,
    padding: 10, color: '#e6edf3', fontSize: 14,
  },
  inputMulti: { minHeight: 90 },
  buttonRow:  { flexDirection: 'row', marginTop: 6 },
  btn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  btnOutline:     { borderWidth: 1, borderColor: '#30363d', marginRight: 10 },
  btnOutlineText: { color: '#8b949e', fontWeight: '600', fontSize: 14 },
  btnPrimary:     { backgroundColor: '#58a6ff' },
  btnGreen:       { backgroundColor: '#3fb950' },
  btnPrimaryText: { color: '#0d1117', fontWeight: '700', fontSize: 14 },
});
