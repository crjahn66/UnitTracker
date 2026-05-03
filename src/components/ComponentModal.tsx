import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, Image,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { format, parse, isValid } from 'date-fns';
import { useStore } from '../store/useStore';
import { COMPONENTS, ComponentKey, ComponentStatus, Issue } from '../types';
import { saveImage, deleteImage } from '../utils/imageStorage';
import { pushToCloud } from '../utils/sync';
import PhotoViewer from './PhotoViewer';

interface Props {
  unitId: string;
  componentKey: ComponentKey;
  onClose: () => void;
}

type ModalView = 'detail' | 'addIssue' | 'resolveIssue' | 'editIssue' | 'progressNote' | 'goodNote';

const today = () => format(new Date(), 'MM/dd/yyyy');
const EMPTY_ISSUE = () => ({ dateFound: today(), foundBy: '', notes: '' });
const EMPTY_RESOLVE = () => ({ dateFixed: today(), fixedBy: '', howFixed: '' });

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') { (window as any).alert(`${title}\n${msg}`); }
  else { Alert.alert(title, msg); }
};

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

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return iso; }
}

// ─── Image Strip ──────────────────────────────────────────────────────────────

function ImageStrip({ images, onAdd, onRemove, onView = () => {} }: {
  images: string[];
  onAdd: () => void;
  onRemove: (uri: string) => void;
  onView?: (uri: string) => void;
}) {
  return (
    <View style={img.strip}>
      <FlatList
        horizontal
        data={images}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          const isRemote = item.startsWith('https://');
          return (
            <View style={img.thumb}>
              <TouchableOpacity onPress={() => isRemote && onView?.(item)} activeOpacity={0.85}>
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

interface AddIssueFormProps {
  onSave: (data: { dateFound: string; foundBy: string; notes: string; images: string[] }) => void;
  onCancel: () => void;
}

function AddIssueForm({ onSave, onCancel }: AddIssueFormProps) {
  const [form, setForm] = useState(EMPTY_ISSUE);
  const [images, setImages] = useState<string[]>([]);
  const set = (key: 'dateFound' | 'foundBy' | 'notes', val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const pickImages = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!result.canceled)setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
  };

  const removeImage = (uri: string) => setImages((prev) => prev.filter((i) => i !== uri));

  const handleSave = () => {
    if (!form.foundBy.trim()) { showAlert('Required', 'Please enter who found the issue.'); return; }
    if (!form.notes.trim()) { showAlert('Required', 'Please enter issue notes.'); return; }
    onSave({ ...form, images });
  };

  return (
    <View>
      <Text style={f.formTitle}>Log New Issue</Text>
      <FormField label="Date Found" value={form.dateFound} onChangeText={(v) => set('dateFound', v)} placeholder="MM/DD/YYYY" />
      <FormField label="Found By" value={form.foundBy} onChangeText={(v) => set('foundBy', v)} placeholder="Name / Tech ID" />
      <FormField label="Notes" value={form.notes} onChangeText={(v) => set('notes', v)} placeholder="Describe the issue…" multiline />
      <Text style={f.label}>Photos</Text>
      <ImageStrip images={images} onAdd={pickImages} onRemove={removeImage} />
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
  onSave: (data: { dateFixed: string; fixedBy: string; howFixed: string }) => void;
  onCancel: () => void;
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

function IssueCard({ issue, onResolve, onDelete, onEdit, onAddImage, onRemoveImage, onViewImage }: {
  issue: Issue;
  onResolve: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onAddImage: (uri: string) => void;
  onRemoveImage: (uri: string) => void;
  onViewImage: (uri: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

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
          <DetailRow label="Notes" value={issue.notes} />
          {issue.resolved && (
            <>
              <DetailRow label="Fixed" value={fmtDate(issue.dateFixed)} />
              <DetailRow label="Fixed By" value={issue.fixedBy} />
              <DetailRow label="How Fixed" value={issue.howFixed} />
            </>
          )}
          {(issue.images?.length ?? 0) > 0 && (
            <ImageStrip
              images={issue.images ?? []}
              onAdd={pickImages}
              onRemove={onRemoveImage}
              onView={onViewImage}
            />
          )}
          <View style={ic.actions}>
            {!issue.resolved && (
              <TouchableOpacity style={[ic.actionBtn, ic.resolveBtn]} onPress={onResolve}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#3fb950" style={{ marginRight: 4 }} />
                <Text style={ic.resolveBtnText}>Mark Resolved</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[ic.actionBtn, ic.editBtn]} onPress={onEdit}>
              <Ionicons name="pencil-outline" size={14} color="#d29922" style={{ marginRight: 4 }} />
              <Text style={ic.editBtnText}>Edit</Text>
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

// ─── Edit Issue Form ──────────────────────────────────────────────────────────

function EditIssueForm({ issue, onSave, onCancel }: {
  issue: Issue; onSave: (updates: Partial<Issue>) => void; onCancel: () => void;
}) {
  const fmt = (iso?: string) => { try { return iso ? format(new Date(iso), 'MM/dd/yyyy') : ''; } catch { return iso ?? ''; } };
  const [form, setForm] = useState({
    dateFound: fmt(issue.dateFound), foundBy: issue.foundBy, notes: issue.notes,
    dateFixed: fmt(issue.dateFixed), fixedBy: issue.fixedBy ?? '', howFixed: issue.howFixed ?? '',
  });
  const set = (key: keyof typeof form, val: string) => setForm((p) => ({ ...p, [key]: val }));
  const parseDate = (s: string, fallback: string) => { const p = parse(s, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : fallback; };

  const handleSave = () => {
    if (!form.foundBy.trim()) { showAlert('Required', 'Please enter who found the issue.'); return; }
    if (!form.notes.trim()) { showAlert('Required', 'Please enter issue notes.'); return; }
    const updates: Partial<Issue> = {
      dateFound: parseDate(form.dateFound, issue.dateFound),
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
      <FormField label="Date Found" value={form.dateFound} onChangeText={(v) => set('dateFound', v)} placeholder="MM/DD/YYYY" />
      <FormField label="Found By" value={form.foundBy} onChangeText={(v) => set('foundBy', v)} placeholder="Name / Tech ID" />
      <FormField label="Notes" value={form.notes} onChangeText={(v) => set('notes', v)} placeholder="Describe the issue…" multiline />
      {issue.resolved && (
        <>
          <FormField label="Date Fixed" value={form.dateFixed} onChangeText={(v) => set('dateFixed', v)} placeholder="MM/DD/YYYY" />
          <FormField label="Fixed By" value={form.fixedBy} onChangeText={(v) => set('fixedBy', v)} placeholder="Name / Tech ID" />
          <FormField label="How Fixed" value={form.howFixed} onChangeText={(v) => set('howFixed', v)} placeholder="Describe the resolution…" multiline />
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
  images: string[];
  onAdd: (uri: string, file?: File) => void;
  onRemove: (uri: string) => void;
  onView: (uri: string) => void;
  accentColor: string;
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

// ─── Main Modal ────────────────────────────────────────────────────────────────

export default function ComponentModal({ unitId, componentKey, onClose }: Props) {
  const unit = useStore((state) => state.units[unitId]);
  const updateComponentStatus      = useStore((state) => state.updateComponentStatus);
  const setComponentProgressNote   = useStore((state) => state.setComponentProgressNote);
  const setComponentGoodNote       = useStore((state) => state.setComponentGoodNote);
  const setComponentProgressImages = useStore((state) => state.setComponentProgressImages);
  const setComponentGoodImages     = useStore((state) => state.setComponentGoodImages);
  const addIssue    = useStore((state) => state.addIssue);
  const updateIssue = useStore((state) => state.updateIssue);
  const deleteIssue = useStore((state) => state.deleteIssue);

  const [view, setView] = useState<ModalView>('detail');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const compInfo    = COMPONENTS.find((c) => c.key === componentKey) ?? { key: componentKey, label: componentKey };
  const compData    = unit.components[componentKey];
  const displayLabel = unit.customComponentLabels?.[componentKey] ?? compInfo.label;

  const handleStatusChange = useCallback(
    (status: ComponentStatus) => {
      updateComponentStatus(unitId, componentKey, status);
      if (status === 'inProgress') {
        setComponentGoodNote(unitId, componentKey, '');
        setView('progressNote');
        return;
      }
      if (status === 'bad') {
        setComponentProgressNote(unitId, componentKey, '');
        setComponentGoodNote(unitId, componentKey, '');
        setView('addIssue');
        return;
      }
      if (status === 'good') {
        setComponentProgressNote(unitId, componentKey, '');
        onClose();
        return;
      }
      setComponentProgressNote(unitId, componentKey, '');
      setComponentGoodNote(unitId, componentKey, '');
    },
    [unitId, componentKey, updateComponentStatus, setComponentProgressNote, setComponentGoodNote, onClose]
  );

  const handleAddIssue = useCallback(
    (data: { dateFound: string; foundBy: string; notes: string; images: string[] }) => {
      const id = genId();
      const issue: Issue = {
        id,
        componentKey,
        dateFound: (() => { const p = parse(data.dateFound, 'MM/dd/yyyy', new Date()); return isValid(p) ? p.toISOString() : new Date().toISOString(); })(),
        foundBy: data.foundBy,
        notes: data.notes,
        resolved: false,
        images: data.images.length > 0 ? data.images : undefined,
      };
      addIssue(unitId, issue);
      setView('detail');
      // Upload photos in the background — form is already closed
      if (data.images.length > 0) {
        (async () => {
          const uploaded: string[] = [];
          for (const uri of data.images) {
            try { uploaded.push(await saveImage(id, uri)); } catch { /* skip */ }
          }
          if (uploaded.length > 0) {
            updateIssue(unitId, componentKey, id, { images: uploaded });
            pushToCloud().catch(() => {});
          }
        })();
      }
    },
    [unitId, componentKey, addIssue, updateIssue]
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
      const doDelete = async () => {
        const issue = compData.issues.find((i) => i.id === issueId);
        for (const uri of (issue?.images ?? [])) deleteImage(uri);
        deleteIssue(unitId, componentKey, issueId);
        pushToCloud().catch(() => {});
      };
      if (Platform.OS === 'web') {
        if ((window as any).confirm('Delete this issue log?')) doDelete();
      } else {
        Alert.alert('Delete Issue', 'This will permanently remove this issue log. Continue?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]);
      }
    },
    [unitId, componentKey, deleteIssue, compData.issues]
  );

  const handleAddImage = useCallback(
    async (issueId: string, uri: string) => {
      const saved = await saveImage(issueId, uri);
      const issue = compData.issues.find((i) => i.id === issueId);
      updateIssue(unitId, componentKey, issueId, {
        images: [...(issue?.images ?? []), saved],
      });
    },
    [unitId, componentKey, updateIssue, compData.issues]
  );

  const handleRemoveImage = useCallback(
    (issueId: string, uri: string) => {
      const doRemove = async () => {
        await deleteImage(uri);
        const issue = compData.issues.find((i) => i.id === issueId);
        updateIssue(unitId, componentKey, issueId, {
          images: (issue?.images ?? []).filter((i) => i !== uri),
        });
      };
      // Alert.alert doesn't fire button callbacks inside a Modal on React Native Web
      if (Platform.OS === 'web') {
        if ((window as any).confirm('Remove this photo from the issue?')) doRemove();
      } else {
        Alert.alert('Remove Photo', 'Remove this photo from the issue?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doRemove },
        ]);
      }
    },
    [unitId, componentKey, updateIssue, compData.issues]
  );

  const handleEditIssue = useCallback(
    (issueId: string, updates: Partial<Issue>) => {
      updateIssue(unitId, componentKey, issueId, updates);
      setEditingIssueId(null);
      setView('detail');
    },
    [unitId, componentKey, updateIssue]
  );

  const visibleIssues = compData.issues.filter((i) => !i.deleted);
  const openIssuesList = visibleIssues.filter((i) => !i.resolved);
  const resolvedIssuesList = visibleIssues.filter((i) => i.resolved);
  const openIssues = openIssuesList.length;
  const color = statusColor(compData.status);

  const renderContent = () => {
    if (view === 'addIssue') {
      return <AddIssueForm onSave={handleAddIssue} onCancel={() => setView('detail')} />;
    }
    if (view === 'editIssue' && editingIssueId) {
      const issue = compData.issues.find((i) => i.id === editingIssueId);
      if (issue) return <EditIssueForm issue={issue} onSave={(u) => handleEditIssue(editingIssueId, u)} onCancel={() => { setEditingIssueId(null); setView('detail'); }} />;
    }
    if (view === 'resolveIssue' && resolvingId) {
      return (
        <ResolveForm
          onSave={(data) => handleResolve(resolvingId, data)}
          onCancel={() => { setResolvingId(null); setView('detail'); }}
        />
      );
    }
    if (view === 'progressNote') {
      return (
        <ProgressNoteForm
          initial={compData.progressNote ?? ''}
          onSave={(note) => { setComponentProgressNote(unitId, componentKey, note); setView('detail'); }}
          onCancel={() => setView('detail')}
        />
      );
    }
    if (view === 'goodNote') {
      return (
        <GoodNoteForm
          initial={compData.goodNote ?? ''}
          onSave={(note) => { setComponentGoodNote(unitId, componentKey, note); onClose(); }}
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

        {compData.status === 'inProgress' && (
          <View style={m.progressNoteBox}>
            <TouchableOpacity style={m.noteBoxTop} onPress={() => setView('progressNote')} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={m.progressNoteLabel}>IN PROGRESS NOTE</Text>
                <Text style={m.progressNoteText}>{compData.progressNote || '(tap to add note)'}</Text>
              </View>
              <Ionicons name="pencil-outline" size={14} color="#d29922" />
            </TouchableOpacity>
            <StatusImageStrip
              images={compData.progressImages ?? []}
              onAdd={async (uri, file) => {
                const saved = await saveImage(`${unitId}_${componentKey}_prog`, uri, file);
                setComponentProgressImages(unitId, componentKey, [...(compData.progressImages ?? []), saved]);
              }}
              onRemove={async (uri) => {
                await deleteImage(uri);
                setComponentProgressImages(unitId, componentKey, (compData.progressImages ?? []).filter((i) => i !== uri));
              }}
              onView={setViewingPhoto}
              accentColor="#d29922"
            />
          </View>
        )}

        {compData.status === 'good' && (
          <View style={m.goodNoteBox}>
            <TouchableOpacity style={m.noteBoxTop} onPress={() => setView('goodNote')} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={m.goodNoteLabel}>COMMISSIONING NOTE</Text>
                <Text style={m.goodNoteText}>{compData.goodNote || '(tap to add note)'}</Text>
              </View>
              <Ionicons name="pencil-outline" size={14} color="#3fb950" />
            </TouchableOpacity>
            <StatusImageStrip
              images={compData.goodImages ?? []}
              onAdd={async (uri, file) => {
                const saved = await saveImage(`${unitId}_${componentKey}_good`, uri, file);
                setComponentGoodImages(unitId, componentKey, [...(compData.goodImages ?? []), saved]);
              }}
              onRemove={async (uri) => {
                await deleteImage(uri);
                setComponentGoodImages(unitId, componentKey, (compData.goodImages ?? []).filter((i) => i !== uri));
              }}
              onView={setViewingPhoto}
              accentColor="#3fb950"
            />
          </View>
        )}

        <View style={m.issueSectionHeader}>
          <Text style={m.sectionLabel}>ISSUES</Text>
          {openIssues > 0 && (
            <View style={m.openBadge}>
              <Text style={m.openBadgeText}>{openIssues} open</Text>
            </View>
          )}
        </View>

        {visibleIssues.length === 0 ? (
          <Text style={m.noIssues}>No issues logged for this component.</Text>
        ) : (
          <>
            {openIssuesList.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onResolve={() => { setResolvingId(issue.id); setView('resolveIssue'); }}
                onEdit={() => { setEditingIssueId(issue.id); setView('editIssue'); }}
                onDelete={() => handleDelete(issue.id)}
                onAddImage={(uri) => handleAddImage(issue.id, uri)}
                onRemoveImage={(uri) => handleRemoveImage(issue.id, uri)}
                onViewImage={setViewingPhoto}
              />
            ))}
            {resolvedIssuesList.length > 0 && (
              <>
                <TouchableOpacity style={m.archiveToggle} onPress={() => setArchiveOpen((o) => !o)} activeOpacity={0.7}>
                  <Ionicons name={archiveOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#6e7681" style={{ marginRight: 6 }} />
                  <Text style={m.archiveToggleText}>{resolvedIssuesList.length} resolved issue{resolvedIssuesList.length !== 1 ? 's' : ''}</Text>
                </TouchableOpacity>
                {archiveOpen && resolvedIssuesList.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onResolve={() => { setResolvingId(issue.id); setView('resolveIssue'); }}
                    onEdit={() => { setEditingIssueId(issue.id); setView('editIssue'); }}
                    onDelete={() => handleDelete(issue.id)}
                    onAddImage={(uri) => handleAddImage(issue.id, uri)}
                    onRemoveImage={(uri) => handleRemoveImage(issue.id, uri)}
                    onViewImage={setViewingPhoto}
                  />
                ))}
              </>
            )}
          </>
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
      <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={m.sheet}>
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
      {viewingPhoto && <PhotoViewer uri={viewingPhoto} onClose={() => setViewingPhoto(null)} />}
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
  statusTag: { fontSize: 13, marginTop: 3, fontWeight: '600' },
  closeBtn: { padding: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  labelEditIcon: { marginLeft: 8, padding: 4 },
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
  archiveToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, marginBottom: 4 },
  archiveToggleText: { color: '#6e7681', fontSize: 13, fontWeight: '600' },
  progressNoteBox: { backgroundColor: '#d2992211', borderRadius: 8, borderWidth: 1, borderColor: '#d2992244', padding: 10, marginBottom: 20 },
  noteBoxTop: { flexDirection: 'row', alignItems: 'center' },
  progressNoteLabel: { color: '#d29922', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  progressNoteText: { color: '#e6edf3', fontSize: 13 },
  goodNoteBox: { backgroundColor: '#3fb95011', borderRadius: 8, borderWidth: 1, borderColor: '#3fb95044', padding: 10, marginBottom: 20 },
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
  photoBadge: { flexDirection: 'row', alignItems: 'center', marginLeft: 6, backgroundColor: '#21262d', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  photoBadgeText: { color: '#8b949e', fontSize: 10, fontWeight: '600', marginLeft: 3 },
  foundBy: { color: '#8b949e', fontSize: 12, maxWidth: 120 },
  body: { paddingHorizontal: 10, paddingBottom: 10 },
  detailRow: { flexDirection: 'row', marginBottom: 4 },
  detailLabel: { color: '#6e7681', fontSize: 12, width: 70 },
  detailValue: { color: '#e6edf3', fontSize: 12, flex: 1 },
  actions: { flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1 },
  resolveBtn: { borderColor: '#3fb950' },
  resolveBtnText: { color: '#3fb950', fontSize: 12, fontWeight: '600' },
  editBtn: { borderColor: '#d29922' },
  editBtnText: { color: '#d29922', fontSize: 12, fontWeight: '600' },
  photoBtn: { borderColor: '#58a6ff' },
  photoBtnText: { color: '#58a6ff', fontSize: 12, fontWeight: '600' },
  deleteBtn: { borderColor: '#f85149' },
  deleteBtnText: { color: '#f85149', fontSize: 12, fontWeight: '600' },
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
