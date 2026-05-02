import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parse, isValid } from 'date-fns';
import { useStore } from '../store/useStore';
import { COMPONENTS, ComponentKey, ComponentStatus, Issue } from '../types';

interface Props {
  unitId: string;
  componentKey: ComponentKey;
  onClose: () => void;
}

type ModalView = 'detail' | 'addIssue' | 'resolveIssue';

const today = () => format(new Date(), 'MM/dd/yyyy');
const EMPTY_ISSUE = () => ({ dateFound: today(), foundBy: '', notes: '' });
const EMPTY_RESOLVE = () => ({ dateFixed: today(), fixedBy: '', howFixed: '' });

function statusColor(s: ComponentStatus) {
  if (s === 'good') return '#3fb950';
  if (s === 'bad') return '#f85149';
  return '#6e7681';
}

function statusLabel(s: ComponentStatus) {
  if (s === 'good') return 'Good';
  if (s === 'bad') return 'Bad';
  return 'Unchecked';
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return iso; }
}

// ─── Add Issue Form ────────────────────────────────────────────────────────────

interface AddIssueFormProps {
  onSave: (data: { dateFound: string; foundBy: string; notes: string }) => void;
  onCancel: () => void;
}

function AddIssueForm({ onSave, onCancel }: AddIssueFormProps) {
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

interface ResolveFormProps {
  onSave: (data: { dateFixed: string; fixedBy: string; howFixed: string }) => void;
  onCancel: () => void;
}

function ResolveForm({ onSave, onCancel }: ResolveFormProps) {
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

interface IssueCardProps {
  issue: Issue;
  onResolve: () => void;
  onDelete: () => void;
}

function IssueCard({ issue, onResolve, onDelete }: IssueCardProps) {
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
          <DetailRow label="Notes" value={issue.notes} />
          {issue.resolved && (
            <>
              <DetailRow label="Fixed" value={fmtDate(issue.dateFixed)} />
              <DetailRow label="Fixed By" value={issue.fixedBy} />
              <DetailRow label="How Fixed" value={issue.howFixed} />
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

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={ic.detailRow}>
      <Text style={ic.detailLabel}>{label}:</Text>
      <Text style={ic.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────────────

export default function ComponentModal({ unitId, componentKey, onClose }: Props) {
  const unit = useStore((state) => state.units[unitId]);
  const updateComponentStatus = useStore((state) => state.updateComponentStatus);
  const addIssue = useStore((state) => state.addIssue);
  const updateIssue = useStore((state) => state.updateIssue);
  const deleteIssue = useStore((state) => state.deleteIssue);

  const [view, setView] = useState<ModalView>('detail');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const compInfo    = COMPONENTS.find((c) => c.key === componentKey) ?? { key: componentKey, label: componentKey };
  const compData    = unit.components[componentKey];
  const displayLabel = unit.customComponentLabels?.[componentKey] ?? compInfo.label;

  const handleStatusChange = useCallback(
    (status: ComponentStatus) => {
      updateComponentStatus(unitId, componentKey, status);
      if (status === 'bad') setView('addIssue');
      if (status === 'good') onClose();
    },
    [unitId, componentKey, updateComponentStatus, onClose]
  );

  const handleAddIssue = useCallback(
    (data: { dateFound: string; foundBy: string; notes: string }) => {
      const issue: Issue = {
        id: genId(),
        componentKey,
        dateFound: (() => { const p = parse(data.dateFound, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : new Date().toISOString(); })(),
        foundBy: data.foundBy,
        notes: data.notes,
        resolved: false,
      };
      addIssue(unitId, issue);
      setView('detail');
    },
    [unitId, componentKey, addIssue]
  );

  const handleResolve = useCallback(
    (issueId: string, data: { dateFixed: string; fixedBy: string; howFixed: string }) => {
      updateIssue(unitId, componentKey, issueId, {
        resolved: true,
        dateFixed: (() => { const p = parse(data.dateFixed, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : new Date().toISOString(); })(),
        fixedBy: data.fixedBy,
        howFixed: data.howFixed,
      });
      setResolvingId(null);
      setView('detail');
    },
    [unitId, componentKey, updateIssue]
  );

  const handleDelete = useCallback(
    (issueId: string) => {
      Alert.alert('Delete Issue', 'This will permanently remove this issue log. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteIssue(unitId, componentKey, issueId) },
      ]);
    },
    [unitId, componentKey, deleteIssue]
  );

  const openIssues = compData.issues.filter((i) => !i.resolved).length;
  const color = statusColor(compData.status);

  const renderContent = () => {
    if (view === 'addIssue') {
      return (
        <AddIssueForm
          onSave={handleAddIssue}
          onCancel={() => setView('detail')}
        />
      );
    }

    if (view === 'resolveIssue' && resolvingId) {
      return (
        <ResolveForm
          onSave={(data) => handleResolve(resolvingId, data)}
          onCancel={() => { setResolvingId(null); setView('detail'); }}
        />
      );
    }

    return (
      <View>
        {/* Status selector */}
        <Text style={m.sectionLabel}>STATUS</Text>
        <View style={m.statusRow}>
          {(['good', 'bad', 'unchecked'] as ComponentStatus[]).map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                m.statusBtn,
                compData.status === status && { backgroundColor: statusColor(status) + '33', borderColor: statusColor(status) },
              ]}
              onPress={() => handleStatusChange(status)}
              activeOpacity={0.75}
            >
              <Text style={[m.statusBtnText, { color: statusColor(status) }]}>{statusLabel(status)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Issues section */}
        <View style={m.issueSectionHeader}>
          <Text style={m.sectionLabel}>ISSUES</Text>
          {openIssues > 0 && (
            <View style={m.openBadge}>
              <Text style={m.openBadgeText}>{openIssues} open</Text>
            </View>
          )}
        </View>

        {compData.issues.length === 0 ? (
          <Text style={m.noIssues}>No issues logged for this component.</Text>
        ) : (
          compData.issues.map((issue) => (
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
      </View>
    );
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={m.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={m.sheet}>
          {/* Modal header */}
          <View style={m.header}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={m.compName}>{displayLabel}</Text>
              <Text style={[m.statusTag, { color }]}>● {statusLabel(compData.status)}</Text>
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

function FormField({
  label, value, onChangeText, placeholder, multiline,
}: {
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
  compName: { color: '#e6edf3', fontSize: 18, fontWeight: '700' },
  statusTag: { fontSize: 13, marginTop: 3, fontWeight: '600' },
  closeBtn: { padding: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  labelEditIcon: { marginLeft: 8, padding: 4 },
  labelEditRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  labelInput: {
    flex: 1, color: '#e6edf3', fontSize: 17, fontWeight: '700',
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#58a6ff',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  labelEditBtn: { padding: 6, marginLeft: 4 },
  body: { padding: 16, paddingBottom: 40 },
  sectionLabel: { color: '#8b949e', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  statusRow: { flexDirection: 'row', marginBottom: 24 },
  statusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#30363d',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  statusBtnText: { fontSize: 13, fontWeight: '700' },
  issueSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  openBadge: {
    marginLeft: 8,
    backgroundColor: '#f8514922',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#f85149',
  },
  openBadgeText: { color: '#f85149', fontSize: 10, fontWeight: '700' },
  noIssues: { color: '#6e7681', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  addIssueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#58a6ff',
  },
  addIssueBtnText: { color: '#58a6ff', fontSize: 14, fontWeight: '600' },
});

const ic = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardOpen: { borderColor: '#f85149', backgroundColor: '#f8514911' },
  cardResolved: { borderColor: '#3fb95044', backgroundColor: '#3fb95011' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeOpen: { backgroundColor: '#f85149' },
  badgeResolved: { backgroundColor: '#3fb950' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  dateText: { color: '#8b949e', fontSize: 12 },
  foundBy: { color: '#8b949e', fontSize: 12, maxWidth: 120 },
  body: { paddingHorizontal: 10, paddingBottom: 10 },
  detailRow: { flexDirection: 'row', marginBottom: 4 },
  detailLabel: { color: '#6e7681', fontSize: 12, width: 70 },
  detailValue: { color: '#e6edf3', fontSize: 12, flex: 1 },
  actions: { flexDirection: 'row', marginTop: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 8,
  },
  resolveBtn: { borderColor: '#3fb950' },
  resolveBtnText: { color: '#3fb950', fontSize: 12, fontWeight: '600' },
  deleteBtn: { borderColor: '#f85149' },
  deleteBtnText: { color: '#f85149', fontSize: 12, fontWeight: '600' },
});

const f = StyleSheet.create({
  formTitle: {
    color: '#e6edf3',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  field: { marginBottom: 14 },
  label: { color: '#8b949e', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 10,
    color: '#e6edf3',
    fontSize: 14,
  },
  inputMulti: { minHeight: 90 },
  buttonRow: { flexDirection: 'row', marginTop: 6 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: { borderWidth: 1, borderColor: '#30363d', marginRight: 10 },
  btnOutlineText: { color: '#8b949e', fontWeight: '600', fontSize: 14 },
  btnPrimary: { backgroundColor: '#58a6ff' },
  btnGreen: { backgroundColor: '#3fb950' },
  btnPrimaryText: { color: '#0d1117', fontWeight: '700', fontSize: 14 },
});
