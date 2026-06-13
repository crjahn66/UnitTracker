import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, Image, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { format, parse, isValid } from 'date-fns';
import { useStore } from '../store/useStore';
import { ComponentStatus, ReadyForMasterIssue, ReadyForMasterTransition, getReadyForMaster } from '../types';
import { saveImage, deleteImage } from '../utils/imageStorage';
import { pushToCloud } from '../utils/sync';
import { useEditMode } from '../context/EditModeContext';
import PhotoViewer from './PhotoViewer';
import NameSelectField from './NameSelectField';
import { showToast } from '../utils/toast';

interface Props {
  unitId: string;
  onClose: () => void;
}

type ModalView = 'detail' | 'addIssue' | 'resolveIssue' | 'editIssue' | 'progressNote' | 'goodNote' | 'statusSignoff' | 'editTransition';

const today = () => format(new Date(), 'MM/dd/yyyy');
const EMPTY_ISSUE = () => ({ dateFound: today(), foundBy: '', notes: '' });
const EMPTY_RESOLVE = () => ({ dateFixed: today(), fixedBy: '', howFixed: '' });

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') { (window as any).alert(`${title}\n${msg}`); }
  else { Alert.alert(title, msg); }
};
function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return iso; }
}
function statusColor(s: ComponentStatus) {
  if (s === 'good') return '#3fb950'; if (s === 'bad') return '#f85149';
  return '#6e7681';
}
function statusLabel(s: ComponentStatus) {
  if (s === 'good') return 'Good'; if (s === 'bad') return 'Bad';
  return 'Unchecked';
}
function transitionText(status: ComponentStatus) {
  if (status === 'good') return 'Good';
  if (status === 'bad') return 'Bad';
  return 'Unchecked';
}

// ─── Image Strip ──────────────────────────────────────────────────────────────

function ImageStrip({ images, onAdd, onRemove, onView = () => {} }: {
  images: string[]; onAdd: () => void; onRemove: (uri: string) => void; onView?: (uri: string) => void;
}) {
  return (
    <View style={img.strip}>
      <FlatList
        horizontal
        data={images}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <View style={img.thumb}>
            <TouchableOpacity onPress={() => onView(item)} activeOpacity={0.85}>
              <Image source={{ uri: item }} style={img.thumbImg} />
            </TouchableOpacity>
            <TouchableOpacity style={img.removeBtn} onPress={() => onRemove(item)}>
              <Ionicons name="close-circle" size={18} color="#f85149" />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <TouchableOpacity style={img.addBtn} onPress={onAdd}>
            <Ionicons name="camera-outline" size={22} color="#58a6ff" />
            <Text style={img.addBtnText}>Photo</Text>
          </TouchableOpacity>
        }
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Add Issue Form ────────────────────────────────────────────────────────────

function AddIssueForm({ onSave, onCancel, initialImages }: {
  onSave: (d: { dateFound: string; foundBy: string; notes: string; images: string[]; status: ComponentStatus }) => void;
  onCancel: () => void;
  /** Pre-attach photos (e.g. from the "Photo-first issue" camera button). */
  initialImages?: string[];
}) {
  const [form, setForm] = useState(EMPTY_ISSUE());
  const [images, setImages] = useState<string[]>(initialImages ?? []);
  const [status, setStatus] = useState<ComponentStatus>('bad');
  const set = (key: 'dateFound' | 'foundBy' | 'notes', val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));
  const notesRef = React.useRef<TextInput>(null);

  const pickImages = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!result.canceled) setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
  };

  const handleSave = () => {
    if (!form.foundBy.trim()) { showAlert('Required', 'Please enter who found or logged the issue.'); return; }
    if (!form.notes.trim()) { showAlert('Required', 'Please enter issue notes.'); return; }
    onSave({ ...form, images, status });
  };

  return (
    <View>
      <Text style={f.formTitle}>Log Ready for Master Entry</Text>
      <Text style={f.label}>Ready for Master Status</Text>
      <View style={f.statusRow}>
        {(['bad'] as ComponentStatus[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[f.statusBtn, status === s && { backgroundColor: statusColor(s) + '33', borderColor: statusColor(s) }]}
            onPress={() => setStatus(s)}
            activeOpacity={0.75}
          >
            <Text style={[f.statusBtnText, { color: statusColor(s) }]}>{statusLabel(s)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FormField label="Date" value={form.dateFound} onChangeText={(v) => set('dateFound', v)} placeholder="MM/DD/YYYY" />
      <NameSelectField label="Logged By" value={form.foundBy} onChange={(v) => { set('foundBy', v); if (v) setTimeout(() => notesRef.current?.focus(), 50); }} rememberLastUsed />
      <FormField label="Notes" value={form.notes} onChangeText={(v) => set('notes', v)} placeholder="Describe the Ready for Master log entry…" multiline inputRef={notesRef} />
      <Text style={f.label}>Photos</Text>
      <ImageStrip images={images} onAdd={pickImages} onRemove={(u) => setImages((p) => p.filter((i) => i !== u))} />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}><Text style={f.btnOutlineText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnPrimary]} onPress={handleSave}><Text style={f.btnPrimaryText}>Save Entry</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Resolve Issue Form ────────────────────────────────────────────────────────

function ResolveForm({ onSave, onCancel }: {
  onSave: (d: { dateFixed: string; fixedBy: string; howFixed: string }) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState(EMPTY_RESOLVE);
  const set = (key: 'dateFixed' | 'fixedBy' | 'howFixed', val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));
  const handleSave = () => {
    if (!form.fixedBy.trim()) { showAlert('Required', 'Please enter who fixed the issue.'); return; }
    if (!form.howFixed.trim()) { showAlert('Required', 'Please describe how it was fixed.'); return; }
    onSave(form);
  };
  return (
    <View>
      <Text style={f.formTitle}>Mark as Resolved</Text>
      <FormField label="Date Fixed" value={form.dateFixed} onChangeText={(v) => set('dateFixed', v)} placeholder="MM/DD/YYYY" />
      <FormField label="Fixed By" value={form.fixedBy} onChangeText={(v) => set('fixedBy', v)} placeholder="Name / Tech ID" />
      <FormField label="How Fixed" value={form.howFixed} onChangeText={(v) => set('howFixed', v)} placeholder="Describe the resolution…" multiline />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}><Text style={f.btnOutlineText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnGreen]} onPress={handleSave}><Text style={f.btnPrimaryText}>Mark Resolved</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Add Update Form ──────────────────────────────────────────────────────────

function AddUpdateForm({ onSave, onCancel }: {
  onSave: (note: string, updatedBy: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const [updatedBy, setUpdatedBy] = useState('');
  const noteRef = React.useRef<TextInput>(null);
  return (
    <View style={uf.container}>
      <Text style={uf.title}>Add Update</Text>
      <NameSelectField label="Updated By" value={updatedBy} onChange={(v) => { setUpdatedBy(v); if (v) setTimeout(() => noteRef.current?.focus(), 50); }} rememberLastUsed />
      <FormField label="Update Note" value={note} onChangeText={setNote} placeholder="What changed or was actioned…" multiline inputRef={noteRef} />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}><Text style={f.btnOutlineText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnPrimary]} onPress={() => {
          if (!updatedBy.trim()) { if (Platform.OS === 'web') { (window as any).alert('Required\nPlease enter who is adding this update.'); } else { Alert.alert('Required', 'Please enter who is adding this update.'); } return; }
          if (!note.trim()) { if (Platform.OS === 'web') { (window as any).alert('Required\nPlease enter an update note.'); } else { Alert.alert('Required', 'Please enter an update note.'); } return; }
          onSave(note.trim(), updatedBy.trim());
        }}><Text style={f.btnPrimaryText}>Save Update</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Issue Card ────────────────────────────────────────────────────────────────

function IssueCard({ issue, onResolve, onUnresolve, onDelete, onEdit, onAddUpdate, onEditUpdate, onDeleteUpdate, onAddImage, onRemoveImage, onViewImage }: {
  issue: ReadyForMasterIssue; onResolve: () => void; onUnresolve: () => void; onDelete: () => void; onEdit: () => void;
  onAddUpdate: (note: string, updatedBy: string) => void;
  onEditUpdate: (updateId: string, changes: { note: string; updatedBy: string }) => void;
  onDeleteUpdate: (updateId: string) => void;
  onAddImage: (uri: string) => void; onRemoveImage: (uri: string) => void; onViewImage: (uri: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editUpdateForm, setEditUpdateForm] = useState({ note: '', updatedBy: '' });
  const { isEditMode } = useEditMode();
  const ageDays = !issue.resolved && issue.dateFound
    ? Math.floor((Date.now() - new Date(issue.dateFound).getTime()) / 86400000)
    : null;

  const pickImages = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!result.canceled)result.assets.forEach((a) => onAddImage(a.uri));
  };

  return (
    <View style={[ic.card, issue.resolved ? ic.cardResolved : ic.cardOpen]}>
      <TouchableOpacity style={ic.header} onPress={() => setExpanded((e) => !e)} activeOpacity={0.8}>
        <View style={ic.headerLeft}>
          <View style={[ic.badge, issue.resolved ? ic.badgeResolved : ic.badgeOpen]}>
            <Text style={ic.badgeText}>{issue.resolved ? 'Resolved' : 'Open'}</Text>
          </View>
          <Text style={ic.dateText}>{fmtDate(issue.dateFound)}</Text>
          {ageDays !== null && ageDays >= 0 && (
            <View style={ic.ageBadge}>
              <Text style={ic.ageBadgeText}>{ageDays}d</Text>
            </View>
          )}
          {(issue.images?.length ?? 0) > 0 && (
            <View style={ic.photoBadge}>
              <Ionicons name="image-outline" size={11} color="#8b949e" />
              <Text style={ic.photoBadgeText}>{issue.images!.length}</Text>
            </View>
          )}
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
          {(issue.updates?.length ?? 0) > 0 && (
            <View style={uf.log}>
              <Text style={uf.logHeader}>Updates</Text>
              {[...(issue.updates ?? [])].reverse().map((u) =>
                editingUpdateId === u.id ? (
                  <View key={u.id} style={uf.logEditEntry}>
                    <NameSelectField label="Updated By" value={editUpdateForm.updatedBy} onChange={(v) => setEditUpdateForm((p) => ({ ...p, updatedBy: v }))} rememberLastUsed />
                    <FormField label="Note" value={editUpdateForm.note} onChangeText={(v) => setEditUpdateForm((p) => ({ ...p, note: v }))} multiline />
                    <View style={f.buttonRow}>
                      <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={() => setEditingUpdateId(null)}><Text style={f.btnOutlineText}>Cancel</Text></TouchableOpacity>
                      <TouchableOpacity style={[f.btn, f.btnPrimary]} onPress={() => { if (editUpdateForm.note.trim() && editUpdateForm.updatedBy.trim()) { onEditUpdate(u.id, editUpdateForm); setEditingUpdateId(null); } }}><Text style={f.btnPrimaryText}>Save</Text></TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View key={u.id} style={uf.logEntry}>
                    <View style={uf.logEntryHeader}>
                      <Text style={uf.logMeta}>{fmtDate(u.date)}  ·  {u.updatedBy}</Text>
                      {isEditMode && (
                        <View style={uf.logEntryActions}>
                          <TouchableOpacity onPress={() => { setEditingUpdateId(u.id); setEditUpdateForm({ note: u.note, updatedBy: u.updatedBy }); }}>
                            <Ionicons name="pencil-outline" size={13} color="#d29922" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => onDeleteUpdate(u.id)} style={{ marginLeft: 10 }}>
                            <Ionicons name="trash-outline" size={13} color="#f85149" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <Text style={uf.logNote}>{u.note}</Text>
                  </View>
                )
              )}
            </View>
          )}
          {(issue.images?.length ?? 0) > 0 && (
            <ImageStrip images={issue.images ?? []} onAdd={pickImages} onRemove={onRemoveImage} onView={onViewImage} />
          )}
          {isEditMode && !showUpdateForm && (
            <View style={ic.actions}>
              {!issue.resolved && (
                <TouchableOpacity style={[ic.actionBtn, ic.resolveBtn]} onPress={onResolve}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#3fb950" style={{ marginRight: 4 }} />
                  <Text style={ic.resolveBtnText}>Mark Resolved</Text>
                </TouchableOpacity>
              )}
              {issue.resolved && (
                <TouchableOpacity style={[ic.actionBtn, ic.unresolveBtn]} onPress={onUnresolve}>
                  <Ionicons name="arrow-undo-outline" size={14} color="#8b949e" style={{ marginRight: 4 }} />
                  <Text style={ic.unresolveBtnText}>Unresolve</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[ic.actionBtn, ic.editBtn]} onPress={onEdit}>
                <Ionicons name="pencil-outline" size={14} color="#d29922" style={{ marginRight: 4 }} />
                <Text style={ic.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ic.actionBtn, ic.updateBtn]} onPress={() => setShowUpdateForm(true)}>
                <Ionicons name="add-circle-outline" size={14} color="#58a6ff" style={{ marginRight: 4 }} />
                <Text style={ic.updateBtnText}>Add Update</Text>
              </TouchableOpacity>
              {!issue.resolved && (
                <TouchableOpacity style={[ic.actionBtn, ic.photoBtn]} onPress={pickImages}>
                  <Ionicons name="camera-outline" size={14} color="#58a6ff" style={{ marginRight: 4 }} />
                  <Text style={ic.photoBtnText}>Add Photo</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[ic.actionBtn, ic.deleteBtn]} onPress={onDelete}>
                <Ionicons name="trash-outline" size={14} color="#f85149" style={{ marginRight: 4 }} />
                <Text style={ic.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
          {isEditMode && showUpdateForm && (
            <AddUpdateForm
              onCancel={() => setShowUpdateForm(false)}
              onSave={(note, updatedBy) => { onAddUpdate(note, updatedBy); setShowUpdateForm(false); }}
            />
          )}
        </View>
      )}
    </View>
  );
}

// ─── Edit Issue Form ──────────────────────────────────────────────────────────

function EditIssueForm({ issue, onSave, onCancel }: {
  issue: ReadyForMasterIssue; onSave: (updates: Partial<ReadyForMasterIssue>) => void; onCancel: () => void;
}) {
  const fmt = (iso?: string) => { try { return iso ? format(new Date(iso), 'MM/dd/yyyy') : ''; } catch { return iso ?? ''; } };
  const [form, setForm] = useState({
    dateFound: fmt(issue.dateFound), dateUpdated: fmt(issue.dateUpdated), foundBy: issue.foundBy,
    notes: issue.notes,
    dateFixed: fmt(issue.dateFixed), fixedBy: issue.fixedBy ?? '', howFixed: issue.howFixed ?? '',
  });
  const set = (key: keyof typeof form, val: string) => setForm((p) => ({ ...p, [key]: val }));
  const parseDate = (s: string, fallback: string) => { const p = parse(s, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : fallback; };

  const handleSave = () => {
    if (!form.foundBy.trim()) { showAlert('Required', 'Please enter who signed off.'); return; }
    if (!form.notes.trim()) { showAlert('Required', 'Please enter issue notes.'); return; }
    const updates: Partial<ReadyForMasterIssue> = {
      dateFound: parseDate(form.dateFound, issue.dateFound),
      dateUpdated: parseDate(form.dateUpdated, issue.dateUpdated ?? new Date().toISOString()),
      foundBy: form.foundBy, notes: form.notes,
    };
    if (issue.resolved) {
      updates.dateFixed = parseDate(form.dateFixed, issue.dateFixed ?? new Date().toISOString());
      updates.fixedBy = form.fixedBy;
      updates.howFixed = form.howFixed;
    }
    onSave(updates);
  };

  return (
    <View>
      <Text style={f.formTitle}>Edit Issue</Text>
      <FormField label="Date Found"        value={form.dateFound}        onChangeText={(v) => set('dateFound', v)}        placeholder="MM/DD/YYYY" />
      <FormField label="Last Updated"      value={form.dateUpdated}      onChangeText={(v) => set('dateUpdated', v)}      placeholder="MM/DD/YYYY" />
      <NameSelectField label="Sign-off By" value={form.foundBy} onChange={(v) => set('foundBy', v)} rememberLastUsed />
      <FormField label="Notes"             value={form.notes}            onChangeText={(v) => set('notes', v)}            placeholder="Describe the issue…" multiline />
      {issue.resolved && (
        <>
          <FormField label="Date Fixed" value={form.dateFixed} onChangeText={(v) => set('dateFixed', v)} placeholder="MM/DD/YYYY" />
          <FormField label="Fixed By" value={form.fixedBy} onChangeText={(v) => set('fixedBy', v)} placeholder="Name / Tech ID" />
          <FormField label="How Fixed"  value={form.howFixed}  onChangeText={(v) => set('howFixed', v)}  placeholder="Describe the resolution…" multiline />
        </>
      )}
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}><Text style={f.btnOutlineText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnPrimary]} onPress={handleSave}><Text style={f.btnPrimaryText}>Save Changes</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Status Image Strip (for good/inProgress note boxes) ─────────────────────

function StatusImageStrip({ images, onAdd, onRemove, onView, accentColor }: {
  images: string[]; onAdd: (uri: string, file?: File) => void; onRemove: (uri: string) => void; onView: (uri: string) => void; accentColor: string;
}) {
  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: true });
    if (!result.canceled) result.assets.forEach((a) => onAdd(a.uri, (a as any).file));
  };
  if (images.length === 0) {
    return (
      <TouchableOpacity style={[img.statusAddBtn, { borderColor: accentColor + '66' }]} onPress={pick} activeOpacity={0.7}>
        <Ionicons name="camera-outline" size={14} color={accentColor} />
        <Text style={[img.statusAddBtnText, { color: accentColor }]}>Add Photo</Text>
      </TouchableOpacity>
    );
  }
  return (
    <FlatList
      horizontal
      data={[...images, '__add__']}
      keyExtractor={(item) => item}
      style={{ marginTop: 8 }}
      renderItem={({ item }) => {
        if (item === '__add__') {
          return (
            <TouchableOpacity style={[img.addBtn, { borderColor: accentColor + '66' }]} onPress={pick}>
              <Ionicons name="camera-outline" size={20} color={accentColor} />
            </TouchableOpacity>
          );
        }
        const isRemote = item.startsWith('https://');
        return (
          <View style={img.thumb}>
            <TouchableOpacity onPress={() => isRemote && onView(item)} activeOpacity={0.85}>
              {isRemote || Platform.OS !== 'web' ? (
                <Image source={{ uri: item }} style={img.thumbImg} />
              ) : (
                <View style={[img.thumbImg, img.thumbPending]}>
                  <Ionicons name="cloud-upload-outline" size={16} color="#8b949e" />
                  <Text style={img.thumbPendingText}>Sync{'\n'}device</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={img.removeBtn} onPress={() => onRemove(item)}>
              <Ionicons name="close-circle" size={18} color="#f85149" />
            </TouchableOpacity>
          </View>
        );
      }}
      showsHorizontalScrollIndicator={false}
    />
  );
}

// ─── Progress / Good Note Forms ───────────────────────────────────────────────

function ProgressNoteForm({ initial, onSave, onCancel }: {
  initial: string; onSave: (note: string) => void; onCancel: () => void;
}) {
  const [note, setNote] = useState(initial);
  return (
    <View>
      <Text style={f.formTitle}>In Progress Note</Text>
      <FormField label="What's in progress?" value={note} onChangeText={setNote} placeholder="Describe current status…" multiline />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}><Text style={f.btnOutlineText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnAmber]} onPress={() => onSave(note)}><Text style={f.btnPrimaryText}>Save Note</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function GoodNoteForm({ initial, onSave, onSkip }: {
  initial: string; onSave: (note: string) => void; onSkip: () => void;
}) {
  const [note, setNote] = useState(initial);
  return (
    <View>
      <Text style={f.formTitle}>Commissioning Note</Text>
      <FormField label="Notes (optional)" value={note} onChangeText={setNote} placeholder="Any notes about this item…" multiline />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onSkip}><Text style={f.btnOutlineText}>Skip</Text></TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnGreen]} onPress={() => onSave(note)}><Text style={f.btnPrimaryText}>Save &amp; Close</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function StatusSignoffForm({ status, initialDate, initialSignedBy, initialReason, initialNotes, onSave, onCancel }: {
  status: Extract<ComponentStatus, 'good' | 'bad'>;
  initialDate?: string;
  initialSignedBy?: string;
  initialReason?: string;
  initialNotes?: string;
  onSave: (data: { date: string; signedBy: string; reason?: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(() => {
    if (!initialDate) return today();
    try { return format(new Date(initialDate), 'MM/dd/yyyy'); } catch { return today(); }
  });
  const [signedBy, setSignedBy] = useState(initialSignedBy ?? '');
  const [reason, setReason] = useState(initialReason ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const reasonRef = React.useRef<TextInput>(null);

  const handleSave = () => {
    if (!signedBy.trim()) { showAlert('Required', status === 'bad' ? 'Please enter who logged this.' : 'Please enter who is signing off.'); return; }
    if (status === 'bad' && !reason.trim()) { showAlert('Required', 'Please enter why Ready for Master is bad.'); return; }
    onSave({ date, signedBy: signedBy.trim(), reason: reason.trim() || undefined, notes: notes.trim() || undefined });
  };

  return (
    <View>
      <Text style={f.formTitle}>{status === 'good' ? 'Good Sign-off' : 'Bad Sign-off'}</Text>
      <FormField label="Date" value={date} onChangeText={setDate} placeholder="MM/DD/YYYY" />
      <NameSelectField label={status === 'bad' ? 'Logged By' : 'Sign-off By'} value={signedBy} onChange={(v) => { setSignedBy(v); if (status === 'bad' && v) setTimeout(() => reasonRef.current?.focus(), 50); }} rememberLastUsed />
      {status === 'bad' && (
        <FormField label="Why Bad" value={reason} onChangeText={setReason} placeholder="Describe why Ready for Master is bad…" multiline inputRef={reasonRef} />
      )}
      {status === 'good' && (
        <FormField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Example: ISOLATION VALVES HAVE BEEN REPLACED" multiline />
      )}
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}><Text style={f.btnOutlineText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[f.btn, status === 'good' ? f.btnGreen : f.btnPrimary]} onPress={handleSave}><Text style={f.btnPrimaryText}>Save</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function TransitionEditForm({ entry, initialSignedBy, initialNotes, onSave, onCancel }: {
  entry: ReadyForMasterTransition;
  initialSignedBy?: string;
  initialNotes?: string;
  onSave: (updates: { date: string; signedBy: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(() => {
    const initial = entry.signedDate ?? entry.date;
    try { return format(new Date(initial), 'MM/dd/yyyy'); } catch { return today(); }
  });
  const [signedBy, setSignedBy] = useState(entry.signedBy ?? initialSignedBy ?? '');
  const [notes, setNotes] = useState(entry.notes ?? initialNotes ?? '');

  const handleSave = () => {
    if (!signedBy.trim()) { showAlert('Required', entry.status === 'bad' ? 'Please enter who logged this.' : 'Please enter who signed off.'); return; }
    onSave({ date, signedBy: signedBy.trim(), notes: notes.trim() || undefined });
  };

  return (
    <View>
      <Text style={f.formTitle}>Edit {transitionText(entry.status)} Log</Text>
      <FormField label="Date" value={date} onChangeText={setDate} placeholder="MM/DD/YYYY" />
      <NameSelectField label={entry.status === 'bad' ? 'Logged By' : 'Sign-off By'} value={signedBy} onChange={setSignedBy} rememberLastUsed />
      <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder={entry.status === 'bad' ? 'Why was Ready for Master bad?' : 'Ready for Master note…'} multiline />
      <View style={f.buttonRow}>
        <TouchableOpacity style={[f.btn, f.btnOutline]} onPress={onCancel}><Text style={f.btnOutlineText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[f.btn, f.btnPrimary]} onPress={handleSave}><Text style={f.btnPrimaryText}>Save</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────────────

export default function ReadyForMasterModal({ unitId, onClose }: Props) {
  const unit = useStore((state) => state.units[unitId]);
  const updateReadyForMaster = useStore((state) => state.updateReadyForMaster);
  const addReadyForMasterIssue = useStore((state) => state.addReadyForMasterIssue);
  const updateReadyForMasterIssue = useStore((state) => state.updateReadyForMasterIssue);
  const deleteReadyForMasterIssue = useStore((state) => state.deleteReadyForMasterIssue);
  const addReadyForMasterIssueUpdate = useStore((state) => state.addReadyForMasterIssueUpdate);
  const editReadyForMasterIssueUpdate = useStore((state) => state.editReadyForMasterIssueUpdate);
  const deleteReadyForMasterIssueUpdate = useStore((state) => state.deleteReadyForMasterIssueUpdate);
  const { isEditMode } = useEditMode();

  const ready = getReadyForMaster(unit);
  const statusDate =
    ready.status === 'good'       ? ready.goodDate :
    ready.status === 'bad'        ? ready.badDate : undefined;

  const [view, setView] = useState<ModalView>('detail');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editingTransitionId, setEditingTransitionId] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [editingStatusDate, setEditingStatusDate] = useState(false);
  const [statusDateValue, setStatusDateValue] = useState('');
  const [photoFirstImages, setPhotoFirstImages] = useState<string[]>([]);
  const [pendingStatus, setPendingStatus] = useState<Extract<ComponentStatus, 'good' | 'bad'> | null>(null);

  const handleStatusChange = useCallback((status: ComponentStatus) => {
    if (status === 'good') { setPendingStatus(status); setView('statusSignoff'); return; }
    if (status === 'bad') { setPendingStatus('bad'); setView('statusSignoff'); return; }
    updateReadyForMaster(unitId, { status, progressNote: '', goodNote: '' }); pushToCloud().catch(() => {});
  }, [unitId, updateReadyForMaster]);

  const handleStatusSignoff = useCallback((data: { date: string; signedBy: string; reason?: string; notes?: string }) => {
    if (!pendingStatus) return;
    const parsed = parse(data.date, 'MM/dd/yyyy', new Date());
    const statusDateIso = isValid(parsed) ? parsed.toISOString() : new Date().toISOString();
    const statusChanged = pendingStatus !== ready.status;
    const updateLatestCurrentTransition = !statusChanged
      ? [...(ready.transitionLog ?? [])]
        .filter((entry) => entry.status === pendingStatus)
        .sort((a, b) => (a.signedDate ?? a.date).localeCompare(b.signedDate ?? b.date))
        .pop()
      : undefined;
    const transitionLog = updateLatestCurrentTransition
      ? (ready.transitionLog ?? []).map((entry) => entry.id === updateLatestCurrentTransition.id
        ? { ...entry, signedDate: statusDateIso, signedBy: data.signedBy, notes: pendingStatus === 'good' ? data.notes : data.reason }
        : entry)
      : undefined;
    if (pendingStatus === 'bad') {
      updateReadyForMaster(unitId, { status: 'bad', progressNote: '', goodNote: '', goodSignedBy: undefined, badDate: statusDateIso, badSignedBy: data.signedBy, badReason: data.reason, ...(transitionLog ? { transitionLog } : {}) });
      pushToCloud().catch(() => {});
      setPendingStatus(null);
      setView('detail');
      return;
    }
    updateReadyForMaster(unitId, { status: 'good', progressNote: '', goodNote: data.notes ?? '', badSignedBy: undefined, badReason: undefined, goodDate: statusDateIso, goodSignedBy: data.signedBy, ...(transitionLog ? { transitionLog } : {}) });
    pushToCloud().catch(() => {});
    setPendingStatus(null);
    onClose();
  }, [unitId, pendingStatus, ready.status, ready.transitionLog, updateReadyForMaster, onClose]);

  const handleAddIssue = useCallback((data: { dateFound: string; foundBy: string; notes: string; images: string[]; status: ComponentStatus }) => {
    const id = genId();
    const now = new Date().toISOString();
    const dateFound = (() => { const p = parse(data.dateFound, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : now; })();
    const issue: ReadyForMasterIssue = {
      id,
      dateFound,
      dateUpdated: now,
      foundBy: data.foundBy,
      notes: data.notes,
      resolved: false,
      images: data.images.length > 0 ? data.images : undefined,
    };
    updateReadyForMaster(unitId, data.status === 'bad'
      ? { status: 'bad', progressNote: '', goodNote: '', goodSignedBy: undefined, badDate: dateFound, badSignedBy: data.foundBy, badReason: data.notes }
      : { status: data.status, progressNote: '', goodNote: '', goodDate: dateFound, goodSignedBy: data.foundBy });
    addReadyForMasterIssue(unitId, issue);
    setView('detail');
    setPendingStatus(null);
    setPhotoFirstImages([]);
    if (data.images.length > 0) {
      (async () => {
        const uploaded: string[] = [];
        for (const uri of data.images) {
          try { uploaded.push(await saveImage(id, uri)); } catch { /* skip */ }
        }
        if (uploaded.length > 0) {
          updateReadyForMasterIssue(unitId, id, { images: uploaded });
          pushToCloud().catch(() => {});
        }
      })();
    }
  }, [unitId, addReadyForMasterIssue, updateReadyForMasterIssue, updateReadyForMaster]);

  const handleEditTransition = useCallback((entryId: string, updates: { date: string; signedBy: string; notes?: string }) => {
    const entry = ready.transitionLog?.find((t) => t.id === entryId);
    if (!entry) return;
    const parsed = parse(updates.date, 'MM/dd/yyyy', new Date());
    const signedDate = isValid(parsed) ? parsed.toISOString() : (entry.signedDate ?? entry.date);
    const transitionLog = (ready.transitionLog ?? []).map((t) =>
      t.id === entryId
        ? { ...t, signedDate, signedBy: updates.signedBy, notes: updates.notes }
        : t
    );
    const isCurrentStatus = entry.status === ready.status;
    const readyUpdates = entry.status === 'good' && isCurrentStatus
      ? { transitionLog, goodDate: signedDate, goodSignedBy: updates.signedBy, goodNote: updates.notes ?? '' }
      : entry.status === 'bad' && isCurrentStatus
        ? { transitionLog, badDate: signedDate, badSignedBy: updates.signedBy, badReason: updates.notes }
        : { transitionLog };
    updateReadyForMaster(unitId, readyUpdates);

    if (entry.status === 'bad') {
      const matchingIssue = ready.issues.find((i) => !i.deleted && fmtDate(i.dateFound) === fmtDate(entry.signedDate ?? entry.date));
      if (matchingIssue) {
        updateReadyForMasterIssue(unitId, matchingIssue.id, { dateFound: signedDate, foundBy: updates.signedBy, notes: updates.notes ?? matchingIssue.notes });
      }
    }
    setEditingTransitionId(null);
    setView('detail');
    pushToCloud().catch(() => {});
  }, [unitId, ready.transitionLog, ready.status, ready.issues, updateReadyForMaster, updateReadyForMasterIssue]);

  const handleDeleteTransition = useCallback((entryId: string) => {
    const doDelete = () => {
      const transitionLog = (ready.transitionLog ?? []).filter((entry) => entry.id !== entryId);
      const latest = [...transitionLog]
        .sort((a, b) => (a.signedDate ?? a.date).localeCompare(b.signedDate ?? b.date))
        .pop();
      const latestDate = latest?.signedDate ?? latest?.date;
      updateReadyForMaster(unitId, {
        transitionLog,
        status: latest?.status ?? 'unchecked',
        failCount: transitionLog.filter((entry) => entry.status === 'bad').length,
        wasGood: transitionLog.some((entry) => entry.status === 'good'),
        goodDate: latest?.status === 'good' ? latestDate : undefined,
        goodSignedBy: latest?.status === 'good' ? latest.signedBy : undefined,
        goodNote: latest?.status === 'good' ? latest.notes ?? '' : '',
        badDate: latest?.status === 'bad' ? latestDate : undefined,
        badSignedBy: latest?.status === 'bad' ? latest.signedBy : undefined,
        badReason: latest?.status === 'bad' ? latest.notes : undefined,
      });
      pushToCloud().catch(() => {});
    };
    if (Platform.OS === 'web') {
      if ((window as any).confirm('Delete this Ready for Master log entry?')) doDelete();
    } else {
      Alert.alert('Delete Log Entry', 'This will remove this Ready for Master log entry and recalculate the current status from the latest remaining entry. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [unitId, ready.transitionLog, updateReadyForMaster]);

  const handleResolve = useCallback((issueId: string, data: { dateFixed: string; fixedBy: string; howFixed: string }) => {
    updateReadyForMasterIssue(unitId, issueId, {
      resolved: true,
      dateFixed: (() => { const p = parse(data.dateFixed, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : new Date().toISOString(); })(),
      fixedBy: data.fixedBy, howFixed: data.howFixed,
    });
    setResolvingId(null); setView('detail');
  }, [unitId, updateReadyForMasterIssue]);

  const handlePhotoFirstIssue = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { showAlert('Camera Permission', 'Camera access is required to capture a photo for the issue.'); return; }
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: false });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setPendingStatus('bad');
      setPhotoFirstImages([uri]);
      setView('addIssue');
    } catch {
      showAlert('Camera Error', 'Could not open the camera.');
    }
  }, []);

  const handleDelete = useCallback((issueId: string) => {
    const doDelete = () => {
      const issue = ready.issues.find((i) => i.id === issueId);
      const photoUris = [...(issue?.images ?? [])];
      deleteReadyForMasterIssue(unitId, issueId);
      pushToCloud().catch(() => {});
      showToast({
        message: 'Issue deleted',
        actionLabel: 'Undo',
        onAction: () => { updateReadyForMasterIssue(unitId, issueId, { deleted: false, deletedAt: undefined }); pushToCloud().catch(() => {}); },
        onDismissNoAction: () => { for (const uri of photoUris) deleteImage(uri); },
      });
    };
    if (Platform.OS === 'web') {
      if ((window as any).confirm('Delete this issue log?')) doDelete();
    } else {
      Alert.alert('Delete Issue', 'This will permanently remove this issue log. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [unitId, deleteReadyForMasterIssue, updateReadyForMasterIssue, ready.issues]);

  const handleAddImage = useCallback(async (issueId: string, uri: string) => {
    const saved = await saveImage(issueId, uri);
    const issue = ready.issues.find((i) => i.id === issueId);
    updateReadyForMasterIssue(unitId, issueId, { images: [...(issue?.images ?? []), saved] });
  }, [unitId, updateReadyForMasterIssue, ready.issues]);

  const handleRemoveImage = useCallback((issueId: string, uri: string) => {
    const doRemove = async () => {
      await deleteImage(uri);
      const issue = ready.issues.find((i) => i.id === issueId);
      updateReadyForMasterIssue(unitId, issueId, { images: (issue?.images ?? []).filter((i) => i !== uri) });
    };
    if (Platform.OS === 'web') {
      if ((window as any).confirm('Remove this photo from the issue?')) doRemove();
    } else {
      Alert.alert('Remove Photo', 'Remove this photo from the issue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    }
  }, [unitId, updateReadyForMasterIssue, ready.issues]);

  const handleEditIssue = useCallback((issueId: string, updates: Partial<ReadyForMasterIssue>) => {
    updateReadyForMasterIssue(unitId, issueId, updates);
    setEditingIssueId(null);
    setView('detail');
    pushToCloud().catch(() => {});
  }, [unitId, updateReadyForMasterIssue]);

  const handleUnresolve = useCallback((issueId: string) => {
    updateReadyForMasterIssue(unitId, issueId, { resolved: false, dateFixed: undefined, fixedBy: undefined, howFixed: undefined });
    pushToCloud().catch(() => {});
  }, [unitId, updateReadyForMasterIssue]);

  const handleAddUpdate = useCallback((issueId: string, note: string, updatedBy: string) => {
    addReadyForMasterIssueUpdate(unitId, issueId, { id: genId(), date: new Date().toISOString(), note, updatedBy });
    pushToCloud().catch(() => {});
  }, [unitId, addReadyForMasterIssueUpdate]);

  const handleEditUpdate = useCallback((issueId: string, updateId: string, changes: { note: string; updatedBy: string }) => {
    editReadyForMasterIssueUpdate(unitId, issueId, updateId, changes);
    pushToCloud().catch(() => {});
  }, [unitId, editReadyForMasterIssueUpdate]);

  const handleDeleteUpdate = useCallback((issueId: string, updateId: string) => {
    deleteReadyForMasterIssueUpdate(unitId, issueId, updateId);
    pushToCloud().catch(() => {});
  }, [unitId, deleteReadyForMasterIssueUpdate]);

  const visibleIssues = ready.issues.filter((i) => !i.deleted);
  const statusLog = [...(ready.transitionLog ?? [])].sort((a, b) => (a.signedDate ?? a.date).localeCompare(b.signedDate ?? b.date));
  const legacyIssueLog = visibleIssues
    .filter((issue) => !statusLog.some((entry) =>
      entry.status === 'bad'
      && fmtDate(entry.signedDate ?? entry.date) === fmtDate(issue.dateFound)
      && ((entry.notes ?? ready.badReason ?? '') === issue.notes || (entry.signedBy ?? ready.badSignedBy ?? '') === issue.foundBy)
    ))
    .map((issue) => ({ type: 'issue' as const, date: issue.dateFound, issue }));
  const combinedLog = [
    ...statusLog.map((entry) => ({ type: 'transition' as const, date: entry.signedDate ?? entry.date, entry })),
    ...legacyIssueLog,
  ].sort((a, b) => a.date.localeCompare(b.date));
  const color = statusColor(ready.status);

  const renderContent = () => {
    if (view === 'addIssue') return (
      <AddIssueForm onSave={handleAddIssue} onCancel={() => { setPendingStatus(null); setView('detail'); setPhotoFirstImages([]); }} initialImages={photoFirstImages} />
    );
    if (view === 'editIssue' && editingIssueId) {
      const issue = ready.issues.find((i) => i.id === editingIssueId);
      if (issue) return <EditIssueForm issue={issue} onSave={(u) => handleEditIssue(editingIssueId, u)} onCancel={() => { setEditingIssueId(null); setView('detail'); }} />;
    }
    if (view === 'editTransition' && editingTransitionId) {
      const entry = ready.transitionLog?.find((t) => t.id === editingTransitionId);
      if (entry) {
        const displayDate = entry.signedDate ?? entry.date;
        const matchingBadIssue = entry.status === 'bad'
          ? ready.issues.find((i) => !i.deleted && fmtDate(i.dateFound) === fmtDate(displayDate))
          : undefined;
        const isCurrentStatus = entry.status === ready.status;
        const initialSignedBy = entry.signedBy
          ?? (entry.status === 'good' && isCurrentStatus ? ready.goodSignedBy : undefined)
          ?? (entry.status === 'bad' ? matchingBadIssue?.foundBy ?? (isCurrentStatus ? ready.badSignedBy : undefined) : undefined);
        const initialNotes = entry.notes
          ?? (entry.status === 'bad' ? matchingBadIssue?.notes ?? (isCurrentStatus ? ready.badReason : undefined) : undefined);
        return <TransitionEditForm entry={entry} initialSignedBy={initialSignedBy} initialNotes={initialNotes} onSave={(u) => handleEditTransition(editingTransitionId, u)} onCancel={() => { setEditingTransitionId(null); setView('detail'); }} />;
      }
    }
    if (view === 'resolveIssue' && resolvingId) return <ResolveForm onSave={(d) => handleResolve(resolvingId, d)} onCancel={() => { setResolvingId(null); setView('detail'); }} />;
    if (view === 'progressNote') return (
      <ProgressNoteForm initial={ready.progressNote ?? ''} onSave={(note) => { updateReadyForMaster(unitId, { progressNote: note }); pushToCloud().catch(() => {}); setView('detail'); }} onCancel={() => setView('detail')} />
    );
    if (view === 'goodNote') return (
      <GoodNoteForm initial={ready.goodNote ?? ''} onSave={(note) => { updateReadyForMaster(unitId, { goodNote: note }); pushToCloud().catch(() => {}); onClose(); }} onSkip={onClose} />
    );
    if (view === 'statusSignoff' && pendingStatus) return (
      <StatusSignoffForm
        status={pendingStatus}
        initialDate={pendingStatus === 'good' ? ready.goodDate : ready.badDate}
        initialSignedBy={pendingStatus === 'good' ? ready.goodSignedBy : ready.badSignedBy}
        initialReason={pendingStatus === 'bad' ? ready.badReason : undefined}
        initialNotes={pendingStatus === 'good' ? ready.goodNote : undefined}
        onSave={handleStatusSignoff}
        onCancel={() => { setPendingStatus(null); setView('detail'); }}
      />
    );

    return (
      <View>
        <Text style={m.sectionLabel}>STATUS</Text>
        {isEditMode && (
          <View style={m.statusRow}>
            {(['good', 'bad', 'unchecked'] as ComponentStatus[]).map((status) => (
              <TouchableOpacity key={status} style={[m.statusBtn, ready.status === status && { backgroundColor: statusColor(status) + '33', borderColor: statusColor(status) }]} onPress={() => handleStatusChange(status)} activeOpacity={0.75}>
                <Text style={[m.statusBtnText, { color: statusColor(status) }]}>{statusLabel(status)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {ready.status !== 'unchecked' && (
          <View style={m.statusDateRow}>
            {editingStatusDate ? (
              <View style={m.statusDateEdit}>
                <TextInput style={m.statusDateInput} value={statusDateValue} onChangeText={setStatusDateValue} placeholder="MM/DD/YYYY" placeholderTextColor="#6e7681" autoFocus />
                <TouchableOpacity onPress={() => {
                  const p = parse(statusDateValue, 'MM/dd/yyyy', new Date());
                  if (isValid(p)) {
                    const date = p.toISOString();
                    updateReadyForMaster(unitId, ready.status === 'good' ? { goodDate: date } : ready.status === 'bad' ? { badDate: date } : {});
                    pushToCloud().catch(() => {});
                  }
                  setEditingStatusDate(false);
                }} style={m.statusDateSaveBtn}><Text style={m.statusDateSaveText}>Save</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingStatusDate(false)}><Text style={m.statusDateCancelText}>Cancel</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={m.statusDateDisplay} onPress={() => { setStatusDateValue(statusDate ? format(new Date(statusDate), 'MM/dd/yyyy') : format(new Date(), 'MM/dd/yyyy')); setEditingStatusDate(true); }} activeOpacity={0.7}>
                <Text style={m.statusDateLabel}>STATUS DATE</Text>
                <Text style={m.statusDateValue}>{statusDate ? format(new Date(statusDate), 'MMM d, yyyy') : 'Not set'}</Text>
                <Ionicons name="pencil-outline" size={12} color="#6e7681" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={m.logSection}>
          <View style={m.issueSectionHeader}>
            <Text style={m.sectionLabel}>READY FOR MASTER LOG</Text>
          </View>
          {combinedLog.length === 0 ? (
            <Text style={m.noIssues}>No Ready for Master log entries yet.</Text>
          ) : (
            <>
              {combinedLog.map((logEntry) => {
                if (logEntry.type === 'issue') {
                  const issue = logEntry.issue;
                  const entryColor = statusColor('bad');
                  return (
                    <View key={`issue-${issue.id}`} style={[m.logEntry, { borderLeftColor: entryColor }]}>
                      <View style={m.logEntryHeader}>
                        <Text style={[m.logStatus, { color: entryColor }]}>Bad</Text>
                        <View style={m.logHeaderRight}>
                          <Text style={m.logDate}>{fmtDate(issue.dateFound)}</Text>
                          {isEditMode && (
                            <>
                              <TouchableOpacity onPress={() => { setEditingIssueId(issue.id); setView('editIssue'); }} style={m.logEditBtn}>
                                <Ionicons name="pencil-outline" size={13} color="#d29922" />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleDelete(issue.id)} style={m.logEditBtn}>
                                <Ionicons name="trash-outline" size={13} color="#f85149" />
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                      {!!issue.foundBy && <Text style={m.logMeta}>Logged by {issue.foundBy}</Text>}
                      {!!issue.notes && <Text style={m.logNotes}>{issue.notes}</Text>}
                    </View>
                  );
                }
                const entry = logEntry.entry;
                const displayDate = entry.signedDate ?? entry.date;
                const isCurrentStatus = entry.status === ready.status;
                const by = entry.signedBy
                  ?? (entry.status === 'good' && isCurrentStatus ? ready.goodSignedBy : undefined)
                  ?? (entry.status === 'bad' && isCurrentStatus ? ready.badSignedBy : undefined);
                const notes = entry.notes
                  ?? (entry.status === 'good' && isCurrentStatus ? ready.goodNote : undefined)
                  ?? (entry.status === 'bad' && isCurrentStatus ? ready.badReason : undefined);
                const entryColor = statusColor(entry.status);
                return (
                  <View key={`transition-${entry.id}`} style={[m.logEntry, { borderLeftColor: entryColor }]}>
                    <View style={m.logEntryHeader}>
                      <Text style={[m.logStatus, { color: entryColor }]}>{transitionText(entry.status)}</Text>
                      <View style={m.logHeaderRight}>
                        <Text style={m.logDate}>{fmtDate(displayDate)}</Text>
                        {isEditMode && (
                          <>
                            <TouchableOpacity onPress={() => { setEditingTransitionId(entry.id); setView('editTransition'); }} style={m.logEditBtn}>
                              <Ionicons name="pencil-outline" size={13} color="#d29922" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteTransition(entry.id)} style={m.logEditBtn}>
                              <Ionicons name="trash-outline" size={13} color="#f85149" />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                    {!!by && <Text style={m.logMeta}>{entry.status === 'bad' ? 'Logged by' : 'Signed by'} {by}</Text>}
                    {!!notes && <Text style={m.logNotes}>{notes}</Text>}
                  </View>
                );
              })}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={m.sheet}>
          <View style={m.header}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={m.labelRow}><Text style={m.compName}>Ready for Master</Text></View>
              <Text style={[m.statusTag, { color }]}>● {statusLabel(ready.status)}{statusDate ? `  ·  ${fmtDate(statusDate)}` : ''}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}><Ionicons name="close" size={22} color="#8b949e" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={m.body} keyboardShouldPersistTaps="handled">{renderContent()}</ScrollView>
        </View>
      </KeyboardAvoidingView>
      {viewingPhoto && <PhotoViewer uri={viewingPhoto} onClose={() => setViewingPhoto(null)} />}
    </Modal>
  );
}
// ─── FormField ─────────────────────────────────────────────────────────────────

function FormField({ label, value, onChangeText, placeholder, multiline, inputRef }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
}) {
  return (
    <View style={f.field}>
      <Text style={f.label}>{label}</Text>
      <TextInput ref={inputRef} style={[f.input, multiline && f.inputMulti]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#6e7681" multiline={multiline} numberOfLines={multiline ? 4 : 1} textAlignVertical={multiline ? 'top' : 'center'} />
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
  issueBtnRow: { flexDirection: 'row', gap: 8 },
  photoIssueBtn: { borderColor: '#d29922' },
  archiveToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, marginBottom: 4 },
  archiveToggleText: { color: '#6e7681', fontSize: 13, fontWeight: '600' },
  deleteItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#f8514944' },
  deleteItemBtnText: { color: '#f85149', fontSize: 14, fontWeight: '600' },
  statusDateRow: { marginBottom: 16, marginTop: -8 },
  statusDateDisplay: { flexDirection: 'row', alignItems: 'center' },
  statusDateLabel: { color: '#8b949e', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginRight: 8 },
  statusDateValue: { color: '#58a6ff', fontSize: 12 },
  statusDateEdit: { flexDirection: 'row', alignItems: 'center' },
  statusDateInput: { flex: 1, backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#30363d', borderRadius: 6, color: '#e6edf3', fontSize: 13, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
  statusDateSaveBtn: { marginRight: 12 },
  statusDateSaveText: { color: '#3fb950', fontSize: 13, fontWeight: '600' },
  statusDateCancelText: { color: '#8b949e', fontSize: 13 },
  progressNoteBox: { backgroundColor: '#d2992211', borderRadius: 8, borderWidth: 1, borderColor: '#d2992244', padding: 10, marginBottom: 20 },
  noteBoxTop: { flexDirection: 'row', alignItems: 'center' },
  progressNoteLabel: { color: '#d29922', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  progressNoteText: { color: '#e6edf3', fontSize: 13 },
  goodNoteBox: { backgroundColor: '#3fb95011', borderRadius: 8, borderWidth: 1, borderColor: '#3fb95044', padding: 10, marginBottom: 20 },
  goodNoteLabel: { color: '#3fb950', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  goodNoteText: { color: '#e6edf3', fontSize: 13 },
  badSignoffBox: { backgroundColor: '#f8514911', borderRadius: 8, borderWidth: 1, borderColor: '#f8514944', padding: 10, marginBottom: 20 },
  badSignoffLabel: { color: '#f85149', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  badSignoffText: { color: '#e6edf3', fontSize: 13 },
  logSection: { marginBottom: 18 },
  logEntry: { backgroundColor: '#161b22', borderRadius: 8, borderWidth: 1, borderColor: '#30363d', borderLeftWidth: 4, padding: 10, marginBottom: 8 },
  logEntryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  logHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  logEditBtn: { marginLeft: 8, padding: 2 },
  logStatus: { fontSize: 12, fontWeight: '700' },
  logDate: { color: '#8b949e', fontSize: 12 },
  logMeta: { color: '#c9d1d9', fontSize: 12, marginTop: 2 },
  logNotes: { color: '#8b949e', fontSize: 12, marginTop: 4 },
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
  ageBadge: { marginLeft: 6, backgroundColor: '#f8514922', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#f8514966' },
  ageBadgeText: { color: '#f85149', fontSize: 10, fontWeight: '600' },
  photoBadge: { flexDirection: 'row', alignItems: 'center', marginLeft: 6, backgroundColor: '#21262d', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  photoBadgeText: { color: '#8b949e', fontSize: 10, fontWeight: '600', marginLeft: 3 },
  foundBy: { color: '#8b949e', fontSize: 12, maxWidth: 120 },
  body: { paddingHorizontal: 10, paddingBottom: 10 },
  detailRow: { flexDirection: 'row', marginBottom: 4 },
  detailLabel: { color: '#6e7681', fontSize: 12, width: 70 },
  detailValue: { color: '#e6edf3', fontSize: 12, flex: 1 },
  actions: { flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1 },
  resolveBtn: { borderColor: '#3fb950' }, resolveBtnText: { color: '#3fb950', fontSize: 12, fontWeight: '600' },
  unresolveBtn: { borderColor: '#8b949e' }, unresolveBtnText: { color: '#8b949e', fontSize: 12, fontWeight: '600' },
  editBtn: { borderColor: '#d29922' }, editBtnText: { color: '#d29922', fontSize: 12, fontWeight: '600' },
  updateBtn: { borderColor: '#58a6ff' }, updateBtnText: { color: '#58a6ff', fontSize: 12, fontWeight: '600' },
  photoBtn: { borderColor: '#58a6ff' }, photoBtnText: { color: '#58a6ff', fontSize: 12, fontWeight: '600' },
  deleteBtn: { borderColor: '#f85149' }, deleteBtnText: { color: '#f85149', fontSize: 12, fontWeight: '600' },
});

const img = StyleSheet.create({
  strip: { marginVertical: 8 },
  thumb: { width: 80, height: 80, marginRight: 8, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: 80, height: 80 },
  thumbPending: { backgroundColor: '#21262d', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  thumbPendingText: { color: '#8b949e', fontSize: 9, textAlign: 'center', marginTop: 2 },
  removeBtn: { position: 'absolute', top: 2, right: 2, backgroundColor: '#0d1117aa', borderRadius: 9 },
  addBtn: { width: 80, height: 80, borderRadius: 6, borderWidth: 1, borderColor: '#58a6ff', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#58a6ff', fontSize: 11, marginTop: 2 },
  statusAddBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  statusAddBtnText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
});

const uf = StyleSheet.create({
  container: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#21262d' },
  title: { color: '#e6edf3', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  log: { marginTop: 10, marginBottom: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#21262d' },
  logHeader: { color: '#8b949e', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  logEntry: { borderLeftWidth: 2, borderLeftColor: '#58a6ff', paddingLeft: 8, marginBottom: 8 },
  logEntryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  logEntryActions: { flexDirection: 'row', alignItems: 'center' },
  logEditEntry: { marginBottom: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#21262d' },
  logMeta: { color: '#8b949e', fontSize: 11 },
  logNote: { color: '#e6edf3', fontSize: 12 },
});

const f = StyleSheet.create({
  formTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { color: '#8b949e', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#30363d', borderRadius: 8, padding: 10, color: '#e6edf3', fontSize: 14 },
  inputMulti: { minHeight: 90 },
  statusRow: { flexDirection: 'row', marginBottom: 14 },
  statusBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#30363d', alignItems: 'center', marginRight: 8 },
  statusBtnText: { fontSize: 13, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', marginTop: 6 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 1, borderColor: '#30363d', marginRight: 10 },
  btnOutlineText: { color: '#8b949e', fontWeight: '600', fontSize: 14 },
  btnPrimary: { backgroundColor: '#58a6ff' },
  btnGreen: { backgroundColor: '#3fb950' },
  btnAmber: { backgroundColor: '#d29922' },
  btnPrimaryText: { color: '#0d1117', fontWeight: '700', fontSize: 14 },
});
