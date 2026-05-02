import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parse, isValid } from 'date-fns';
import { useStore } from '../store/useStore';
import { ComponentStatus, MiscIssue, MiscEquipItem } from '../types';

interface Props {
  unitId: string;
  itemId: string;
  onClose: () => void;
}

type ModalView = 'detail' | 'addIssue' | 'resolveIssue' | 'progressNote' | 'goodNote';

const today = () => format(new Date(), 'MM/dd/yyyy');
const EMPTY_ISSUE = () => ({ dateFound: today(), foundBy: '', notes: '' });
const EMPTY_RESOLVE = () => ({ dateFixed: today(), fixedBy: '', howFixed: '' });

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return iso; }
}

function statusColor(s: ComponentStatus) {
  if (s === 'good') return '#3fb950';
  if (s === 'bad') return '#f85149';
  if (s === 'inProgress') return '#d29922';
  return '#6e7681';
}
function statusLabel(s: ComponentStatus) {
  if (s === 'good') return 'Good';
  if (s === 'bad') return 'Bad';
  if (s === 'inProgress') return 'In Progress';
  return 'Unchecked';
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
    if (!form.foundBy.trim()) { Alert.alert('Required', 'Please enter who found the issue.'); return; }
    if (!form.notes.trim()) { Alert.alert('Required', 'Please enter issue notes.'); return; }
    onSave(form);
  };

  return (
    <View>
      <Text style={f.formTitle}>Log New Issue</Text>
      <FormField label="Date Found" value={form.dateFound} onChangeText={(v) => set('dateFound', v)} placeholder="MM/DD/YYYY" />
      <FormField label="Found By" value={form.foundBy} onChangeText={(v) => set('foundBy', v)} placeholder="Name / Tech ID" />
      <FormField label="Notes" value={form.notes} onChangeText={(v) => set('notes', v)} placeholder="Describe the issue…" multiline />
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

// ─── Resolve Issue Form ────────────────────────────────────────────────────────

function ResolveForm({ onSave, onCancel }: {
  onSave: (d: { dateFixed: string; fixedBy: string; howFixed: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(EMPTY_RESOLVE);
  const set = (key: 'dateFixed' | 'fixedBy' | 'howFixed', val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.fixedBy.trim()) { Alert.alert('Required', 'Please enter who fixed the issue.'); return; }
    if (!form.howFixed.trim()) { Alert.alert('Required', 'Please describe how it was fixed.'); return; }
    onSave(form);
  };

  return (
    <View>
      <Text style={f.formTitle}>Mark as Resolved</Text>
      <FormField label="Date Fixed" value={form.dateFixed} onChangeText={(v) => set('dateFixed', v)} placeholder="MM/DD/YYYY" />
      <FormField label="Fixed By" value={form.fixedBy} onChangeText={(v) => set('fixedBy', v)} placeholder="Name / Tech ID" />
      <FormField label="How Fixed" value={form.howFixed} onChangeText={(v) => set('howFixed', v)} placeholder="Describe the resolution…" multiline />
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
  issue: MiscIssue;
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
          {!!issue.notes && <View style={ic.detailRow}><Text style={ic.detailLabel}>Notes:</Text><Text style={ic.detailValue}>{issue.notes}</Text></View>}
          {issue.resolved && (
            <>
              <View style={ic.detailRow}><Text style={ic.detailLabel}>Fixed:</Text><Text style={ic.detailValue}>{fmtDate(issue.dateFixed)}</Text></View>
              {!!issue.fixedBy && <View style={ic.detailRow}><Text style={ic.detailLabel}>Fixed By:</Text><Text style={ic.detailValue}>{issue.fixedBy}</Text></View>}
              {!!issue.howFixed && <View style={ic.detailRow}><Text style={ic.detailLabel}>How Fixed:</Text><Text style={ic.detailValue}>{issue.howFixed}</Text></View>}
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

// ─── Progress Note Form ───────────────────────────────────────────────────────

function ProgressNoteForm({ initial, onSave, onCancel }: {
  initial: string; onSave: (note: string) => void; onCancel: () => void;
}) {
  const [note, setNote] = useState(initial);
  return (
    <View>
      <Text style={f.formTitle}>In Progress Note</Text>
      <FormField label="What's in progress?" value={note} onChangeText={setNote} placeholder="Describe current status…" multiline />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}>
          <Text style={f.btnOutlineText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnAmber]} onPress={() => onSave(note)}>
          <Text style={f.btnPrimaryText}>Save Note</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Good Note Form ───────────────────────────────────────────────────────────

function GoodNoteForm({ initial, onSave, onSkip }: {
  initial: string; onSave: (note: string) => void; onSkip: () => void;
}) {
  const [note, setNote] = useState(initial);
  return (
    <View>
      <Text style={f.formTitle}>Commissioning Note</Text>
      <FormField label="Notes (optional)" value={note} onChangeText={setNote} placeholder="Any notes about this item…" multiline />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onSkip}>
          <Text style={f.btnOutlineText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnGreen]} onPress={() => onSave(note)}>
          <Text style={f.btnPrimaryText}>Save &amp; Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────────────

export default function MiscEquipModal({ unitId, itemId, onClose }: Props) {
  const unit         = useStore((state) => state.units[unitId]);
  const updateMiscEquip = useStore((state) => state.updateMiscEquip);
  const deleteMiscEquip = useStore((state) => state.deleteMiscEquip);
  const addMiscEquip    = useStore((state) => state.addMiscEquip);
  const addMiscIssue    = useStore((state) => state.addMiscIssue);
  const updateMiscIssue = useStore((state) => state.updateMiscIssue);
  const deleteMiscIssue = useStore((state) => state.deleteMiscIssue);

  const item = (unit.miscEquipment ?? []).find((i) => i.id === itemId);

  const [view, setView] = useState<ModalView>('detail');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(item?.label ?? '');

  const handleSaveLabel = useCallback(() => {
    const trimmed = labelValue.trim();
    updateMiscEquip(unitId, itemId, { label: trimmed });
    setEditingLabel(false);
    // If a label was set and there are no other blank items, auto-add a new blank slot
    const misc = unit.miscEquipment ?? [];
    const hasBlank = misc.some((i) => i.id !== itemId && !i.label.trim());
    if (trimmed && !hasBlank) addMiscEquip(unitId);
  }, [labelValue, unitId, itemId, updateMiscEquip, addMiscEquip, unit.miscEquipment]);

  const handleStatusChange = useCallback((status: ComponentStatus) => {
    updateMiscEquip(unitId, itemId, { status });
    if (status === 'inProgress') {
      updateMiscEquip(unitId, itemId, { goodNote: '' });
      setView('progressNote');
      return;
    }
    if (status === 'bad') {
      updateMiscEquip(unitId, itemId, { progressNote: '', goodNote: '' });
      setView('addIssue');
      return;
    }
    if (status === 'good') {
      updateMiscEquip(unitId, itemId, { progressNote: '' });
      onClose();
      return;
    }
    // unchecked
    updateMiscEquip(unitId, itemId, { progressNote: '', goodNote: '' });
  }, [unitId, itemId, updateMiscEquip, onClose]);

  const handleAddIssue = useCallback((data: { dateFound: string; foundBy: string; notes: string }) => {
    const issue: MiscIssue = {
      id: genId(),
      dateFound: (() => { const p = parse(data.dateFound, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : new Date().toISOString(); })(),
      foundBy: data.foundBy,
      notes: data.notes,
      resolved: false,
    };
    addMiscIssue(unitId, itemId, issue);
    setView('detail');
  }, [unitId, itemId, addMiscIssue]);

  const handleResolve = useCallback((issueId: string, data: { dateFixed: string; fixedBy: string; howFixed: string }) => {
    updateMiscIssue(unitId, itemId, issueId, {
      resolved: true,
      dateFixed: (() => { const p = parse(data.dateFixed, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : new Date().toISOString(); })(),
      fixedBy: data.fixedBy,
      howFixed: data.howFixed,
    });
    setResolvingId(null);
    setView('detail');
  }, [unitId, itemId, updateMiscIssue]);

  const handleDelete = useCallback((issueId: string) => {
    Alert.alert('Delete Issue', 'This will permanently remove this issue log. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMiscIssue(unitId, itemId, issueId) },
    ]);
  }, [unitId, itemId, deleteMiscIssue]);

  const handleDeleteItem = useCallback(() => {
    Alert.alert('Delete Equipment', 'Remove this misc equipment entry and all its issues?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteMiscEquip(unitId, itemId); onClose(); } },
    ]);
  }, [unitId, itemId, deleteMiscEquip, onClose]);

  if (!item) return null;

  const openIssues = item.issues.filter((i) => !i.resolved).length;
  const color = statusColor(item.status);

  const renderContent = () => {
    if (view === 'addIssue') {
      return <AddIssueForm onSave={handleAddIssue} onCancel={() => setView('detail')} />;
    }
    if (view === 'resolveIssue' && resolvingId) {
      return <ResolveForm onSave={(d) => handleResolve(resolvingId, d)} onCancel={() => { setResolvingId(null); setView('detail'); }} />;
    }
    if (view === 'progressNote') {
      return (
        <ProgressNoteForm
          initial={item.progressNote ?? ''}
          onSave={(note) => { updateMiscEquip(unitId, itemId, { progressNote: note }); setView('detail'); }}
          onCancel={() => setView('detail')}
        />
      );
    }

    if (view === 'goodNote') {
      return (
        <GoodNoteForm
          initial={item.goodNote ?? ''}
          onSave={(note) => { updateMiscEquip(unitId, itemId, { goodNote: note }); onClose(); }}
          onSkip={onClose}
        />
      );
    }

    return (
      <View>
        <Text style={m.sectionLabel}>STATUS</Text>
        <View style={m.statusRow}>
          {(['good', 'inProgress', 'bad', 'unchecked'] as ComponentStatus[]).map((status) => (
            <TouchableOpacity
              key={status}
              style={[m.statusBtn, item.status === status && { backgroundColor: statusColor(status) + '33', borderColor: statusColor(status) }]}
              onPress={() => handleStatusChange(status)}
              activeOpacity={0.75}
            >
              <Text style={[m.statusBtnText, { color: statusColor(status) }]}>{statusLabel(status)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {item.status === 'inProgress' && (
          <TouchableOpacity style={m.progressNoteBox} onPress={() => setView('progressNote')} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={m.progressNoteLabel}>IN PROGRESS NOTE</Text>
              <Text style={m.progressNoteText}>{item.progressNote || '(tap to add note)'}</Text>
            </View>
            <Ionicons name="pencil-outline" size={14} color="#d29922" />
          </TouchableOpacity>
        )}

        {item.status === 'good' && (
          <TouchableOpacity style={m.goodNoteBox} onPress={() => setView('goodNote')} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={m.goodNoteLabel}>COMMISSIONING NOTE</Text>
              <Text style={m.goodNoteText}>{item.goodNote || '(tap to add note)'}</Text>
            </View>
            <Ionicons name="pencil-outline" size={14} color="#3fb950" />
          </TouchableOpacity>
        )}

        <View style={m.issueSectionHeader}>
          <Text style={m.sectionLabel}>ISSUES</Text>
          {openIssues > 0 && (
            <View style={m.openBadge}>
              <Text style={m.openBadgeText}>{openIssues} open</Text>
            </View>
          )}
        </View>

        {item.issues.length === 0 ? (
          <Text style={m.noIssues}>No issues logged.</Text>
        ) : (
          item.issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onResolve={() => { setResolvingId(issue.id); setView('resolveIssue'); }}
              onDelete={() => handleDelete(issue.id)}
            />
          ))
        )}

        <TouchableOpacity style={m.addIssueBtn} onPress={() => setView('addIssue')}>
          <Ionicons name="add-circle-outline" size={18} color="#58a6ff" style={{ marginRight: 6 }} />
          <Text style={m.addIssueBtnText}>Log New Issue</Text>
        </TouchableOpacity>

        <TouchableOpacity style={m.deleteItemBtn} onPress={handleDeleteItem}>
          <Ionicons name="trash-outline" size={15} color="#f85149" style={{ marginRight: 6 }} />
          <Text style={m.deleteItemBtnText}>Remove Equipment</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={m.sheet}>
          <View style={m.header}>
            <View style={{ flex: 1, marginRight: 8 }}>
              {editingLabel ? (
                <View style={m.labelEditRow}>
                  <TextInput
                    style={m.labelInput}
                    value={labelValue}
                    onChangeText={setLabelValue}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveLabel}
                    selectTextOnFocus
                    placeholder="Equipment name…"
                    placeholderTextColor="#6e7681"
                  />
                  <TouchableOpacity onPress={handleSaveLabel} style={m.labelEditBtn}>
                    <Ionicons name="checkmark" size={20} color="#3fb950" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingLabel(false)} style={m.labelEditBtn}>
                    <Ionicons name="close" size={20} color="#f85149" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={m.labelRow} onPress={() => { setLabelValue(item.label); setEditingLabel(true); }} activeOpacity={0.7}>
                  <Text style={[m.compName, !item.label && m.compNamePlaceholder]}>
                    {item.label || 'Tap to name equipment…'}
                  </Text>
                  <Ionicons name="pencil-outline" size={14} color="#8b949e" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              )}
              <Text style={[m.statusTag, { color }]}>● {statusLabel(item.status)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Ionicons name="close" size={22} color="#8b949e" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={m.body} keyboardShouldPersistTaps="handled">
            {renderContent()}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FormField ─────────────────────────────────────────────────────────────────

function FormField({ label, value, onChangeText, placeholder, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean;
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
  sheet: { backgroundColor: '#161b22', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%', borderTopWidth: 1, borderColor: '#21262d' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  compName: { color: '#e6edf3', fontSize: 18, fontWeight: '700' },
  compNamePlaceholder: { color: '#6e7681', fontWeight: '400', fontSize: 15 },
  statusTag: { fontSize: 13, marginTop: 3, fontWeight: '600' },
  closeBtn: { padding: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  labelEditRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  labelInput: { flex: 1, color: '#e6edf3', fontSize: 17, fontWeight: '700', backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#58a6ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  labelEditBtn: { padding: 6, marginLeft: 4 },
  body: { padding: 16, paddingBottom: 40 },
  sectionLabel: { color: '#8b949e', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  statusRow: { flexDirection: 'row', marginBottom: 24 },
  statusBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#30363d', alignItems: 'center', marginHorizontal: 5 },
  statusBtnText: { fontSize: 13, fontWeight: '700' },
  issueSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  openBadge: { marginLeft: 8, backgroundColor: '#f8514922', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#f85149' },
  openBadgeText: { color: '#f85149', fontSize: 10, fontWeight: '700' },
  noIssues: { color: '#6e7681', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  addIssueBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#58a6ff' },
  addIssueBtnText: { color: '#58a6ff', fontSize: 14, fontWeight: '600' },
  deleteItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#f8514944' },
  deleteItemBtnText: { color: '#f85149', fontSize: 14, fontWeight: '600' },
  progressNoteBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#d2992211', borderRadius: 8, borderWidth: 1, borderColor: '#d2992244', padding: 10, marginBottom: 20 },
  progressNoteLabel: { color: '#d29922', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  progressNoteText: { color: '#e6edf3', fontSize: 13 },
  goodNoteBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3fb95011', borderRadius: 8, borderWidth: 1, borderColor: '#3fb95044', padding: 10, marginBottom: 20 },
  goodNoteLabel: { color: '#3fb950', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  goodNoteText: { color: '#e6edf3', fontSize: 13 },
});

const ic = StyleSheet.create({
  card: { borderRadius: 8, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  cardOpen: { borderColor: '#f85149', backgroundColor: '#f8514911' },
  cardResolved: { borderColor: '#3fb95044', backgroundColor: '#3fb95011' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeOpen: { backgroundColor: '#f85149' },
  badgeResolved: { backgroundColor: '#3fb950' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  dateText: { color: '#8b949e', fontSize: 12, marginLeft: 6 },
  foundBy: { color: '#8b949e', fontSize: 12, maxWidth: 120 },
  body: { paddingHorizontal: 10, paddingBottom: 10 },
  detailRow: { flexDirection: 'row', marginBottom: 4 },
  detailLabel: { color: '#6e7681', fontSize: 12, width: 70 },
  detailValue: { color: '#e6edf3', fontSize: 12, flex: 1 },
  actions: { flexDirection: 'row', marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, marginRight: 8 },
  resolveBtn: { borderColor: '#3fb950' },
  resolveBtnText: { color: '#3fb950', fontSize: 12, fontWeight: '600' },
  deleteBtn: { borderColor: '#f85149' },
  deleteBtnText: { color: '#f85149', fontSize: 12, fontWeight: '600' },
});

const f = StyleSheet.create({
  formTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { color: '#8b949e', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#30363d', borderRadius: 8, padding: 10, color: '#e6edf3', fontSize: 14 },
  inputMulti: { minHeight: 90 },
  buttonRow: { flexDirection: 'row', marginTop: 6 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 1, borderColor: '#30363d', marginRight: 10 },
  btnOutlineText: { color: '#8b949e', fontWeight: '600', fontSize: 14 },
  btnPrimary: { backgroundColor: '#58a6ff' },
  btnGreen: { backgroundColor: '#3fb950' },
  btnAmber: { backgroundColor: '#d29922' },
  btnPrimaryText: { color: '#0d1117', fontWeight: '700', fontSize: 14 },
});
