import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Keyboard,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { format, parse, isValid } from 'date-fns';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { UnitStackParamList } from '../navigation';
import { useStore } from '../store/useStore';
import { STAGES, COMPONENTS, ComponentKey, StageKey, StageStatus, normalizeStageStatus } from '../types';
import ComponentModal from '../components/ComponentModal';
import MiscEquipModal from '../components/MiscEquipModal';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import { getNetworkEntry } from '../data/networkData';
import { pushToCloud } from '../utils/sync';
import { useEditMode } from '../context/EditModeContext';

type Props = NativeStackScreenProps<UnitStackParamList, 'UnitDetail'>;

// Session-scoped scroll position cache, keyed by unitId. Restored when the
// same unit is reopened (typically via the prev/next sibling nav, or after
// going back to UnitList and tapping the same card again). Cleared on app
// restart — intentionally lightweight, not persisted.
const _scrollCache = new Map<string, number>();

export default function UnitDetailScreen({ route, navigation }: Props) {
  const { unitId } = route.params;
  const unit = useStore((state) => state.units[unitId]);
  const allUnits = useStore((state) => state.units);

  // Sibling navigation: prev/next within the same side, ordered by unitNumber.
  // Matches the order shown on UnitListScreen so swiping/arrowing feels natural.
  const { prevId, nextId } = useMemo(() => {
    if (!unit) return { prevId: null as string | null, nextId: null as string | null };
    const siblings = Object.values(allUnits)
      .filter((u) => u.side === unit.side)
      .sort((a, b) => a.unitNumber - b.unitNumber);
    const idx = siblings.findIndex((u) => u.id === unit.id);
    return {
      prevId: idx > 0 ? siblings[idx - 1].id : null,
      nextId: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null,
    };
  }, [allUnits, unit]);

  const goToUnit = useCallback(
    (targetId: string) => {
      // replace() so swiping through 20 units doesn't pile up a 20-deep back stack.
      navigation.replace('UnitDetail', { unitId: targetId });
    },
    [navigation]
  );
  const updateStage  = useStore((state) => state.updateStage);
  const setStageNote = useStore((state) => state.setStageNote);
  const setStageDate = useStore((state) => state.setStageDate);
  const setStageStuckReason = useStore((state) => state.setStageStuckReason);

  const [selectedComponent, setSelectedComponent] = useState<ComponentKey | null>(null);
  const [selectedMiscItem, setSelectedMiscItem] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editingStageNote, setEditingStageNote] = useState<StageKey | null>(null);
  const [stageNoteValue, setStageNoteValue] = useState('');
  const [editingStageDate, setEditingStageDate] = useState<StageKey | null>(null);
  const [stageDateValue, setStageDateValue] = useState('');
  const [editingStuckReason, setEditingStuckReason] = useState<StageKey | null>(null);
  const [stuckReasonValue, setStuckReasonValue] = useState('');
  const addMiscEquip = useStore((state) => state.addMiscEquip);
  const { isEditMode } = useEditMode();
  const [addingMisc, setAddingMisc] = useState(false);
  const [newMiscName, setNewMiscName] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const addingMiscRef = useRef(false);
  addingMiscRef.current = addingMisc;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardPad(e.endCoordinates.height);
      if (addingMiscRef.current) {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardPad(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Restore previously-saved scroll position for this unit (if any). Runs once
  // per unitId mount; deferred to next tick so the ScrollView has laid out its
  // children. Most units re-open at the top (cache miss = no-op).
  useEffect(() => {
    const saved = _scrollCache.get(unitId);
    if (saved && saved > 0) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: saved, animated: false });
      }, 0);
      return () => clearTimeout(t);
    }
  }, [unitId]);

  // Auto-open a modal when navigated here with openComponent / openMiscItem
  // params (Dashboard "tap an open issue" deep link). Clear the params after
  // consuming so subsequent re-renders don't reopen the modal.
  const openComponentParam = (route.params as any).openComponent as ComponentKey | undefined;
  const openMiscItemParam  = (route.params as any).openMiscItem  as string       | undefined;
  useEffect(() => {
    if (openComponentParam) {
      setSelectedComponent(openComponentParam);
      navigation.setParams({ openComponent: undefined } as any);
    } else if (openMiscItemParam) {
      setSelectedMiscItem(openMiscItemParam);
      navigation.setParams({ openMiscItem: undefined } as any);
    }
  }, [openComponentParam, openMiscItemParam, navigation]);

  const handleStageChange = useCallback(
    (key: StageKey, status: StageStatus) => {
      updateStage(unitId, key, status);
      if (status === 'stuck') {
        setStuckReasonValue(unit?.stagesStuckReasons?.[key] ?? '');
        setEditingStuckReason(key);
        setEditingStageNote(null);
        setEditingStageDate(null);
      } else {
        if (editingStuckReason === key) setEditingStuckReason(null);
        setStageStuckReason(unitId, key, '');
      }
    },
    [unitId, updateStage, setStageStuckReason, unit, editingStuckReason]
  );

  if (!unit) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Unit not found</Text>
      </View>
    );
  }

  const networkEntry = getNetworkEntry(unit.side, unit.unitNumber);
  const stagesComplete = STAGES.filter((st) => normalizeStageStatus(unit.stages[st.key]) === 'complete').length;
  const allComps = Object.values(unit.components);
  const miscItems = (unit.miscEquipment ?? []).filter((m) => !m.deleted);

  const photoCount = useMemo(() => {
    let n = 0;
    for (const comp of allComps) {
      n += (comp.progressImages ?? []).filter((u) => u.startsWith('https://')).length;
      n += (comp.goodImages ?? []).filter((u) => u.startsWith('https://')).length;
      for (const issue of comp.issues.filter((i) => !i.deleted))
        n += (issue.images ?? []).filter((u) => u.startsWith('https://')).length;
    }
    for (const item of miscItems) {
      n += (item.progressImages ?? []).filter((u) => u.startsWith('https://')).length;
      n += (item.goodImages ?? []).filter((u) => u.startsWith('https://')).length;
      for (const issue of item.issues.filter((i) => !i.deleted))
        n += (issue.images ?? []).filter((u) => u.startsWith('https://')).length;
    }
    return n;
  }, [allComps, miscItems]);
  const goodCount = allComps.filter((c) => c.status === 'good').length + miscItems.filter((m) => m.status === 'good').length;
  const badCount = allComps.filter((c) => c.status === 'bad').length + miscItems.filter((m) => m.status === 'bad').length;
  const openIssues = allComps.flatMap((c) => c.issues).filter((i) => !i.resolved && !i.deleted).length
    + miscItems.flatMap((m) => m.issues).filter((i) => !i.resolved && !i.deleted).length;

  return (
    <View style={s.container}>
      {/* Sibling unit nav: ‹ Prev | N-XX | Next › */}
      <View style={s.siblingNav}>
        <TouchableOpacity
          style={[s.siblingBtn, !prevId && s.siblingBtnDisabled]}
          onPress={() => prevId && goToUnit(prevId)}
          disabled={!prevId}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={16} color={prevId ? '#58a6ff' : '#30363d'} />
          <Text style={[s.siblingBtnText, !prevId && s.siblingBtnTextDisabled]} numberOfLines={1}>
            {prevId ?? '—'}
          </Text>
        </TouchableOpacity>
        <Text style={s.siblingCurrent}>{unit.id}</Text>
        <TouchableOpacity
          style={[s.siblingBtn, s.siblingBtnRight, !nextId && s.siblingBtnDisabled]}
          onPress={() => nextId && goToUnit(nextId)}
          disabled={!nextId}
          activeOpacity={0.7}
        >
          <Text style={[s.siblingBtnText, !nextId && s.siblingBtnTextDisabled]} numberOfLines={1}>
            {nextId ?? '—'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={nextId ? '#58a6ff' : '#30363d'} />
        </TouchableOpacity>
      </View>

      {/* Header summary strip */}
      <View style={s.headerBar}>
        <HeaderStat label="Stages" value={`${stagesComplete}/${STAGES.length}`} color="#58a6ff" />
        <HeaderStat label="Good" value={goodCount} color="#3fb950" />
        <HeaderStat label="Bad" value={badCount} color="#f85149" />
        <HeaderStat label="Open Issues" value={openIssues} color={openIssues > 0 ? '#f85149' : '#3fb950'} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scroll, keyboardPad > 0 && { paddingBottom: keyboardPad }]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={250}
        onScroll={(e) => { _scrollCache.set(unitId, e.nativeEvent.contentOffset.y); }}
      >
        {/* Photo gallery shortcut */}
        {photoCount > 0 && (
          <TouchableOpacity style={s.galleryBtn} onPress={() => setGalleryOpen(true)} activeOpacity={0.7}>
            <Ionicons name="images-outline" size={16} color="#58a6ff" style={{ marginRight: 8 }} />
            <Text style={s.galleryBtnText}>View {photoCount} Photo{photoCount !== 1 ? 's' : ''}</Text>
            <Ionicons name="chevron-forward" size={14} color="#6e7681" style={{ marginLeft: 'auto' as any }} />
          </TouchableOpacity>
        )}

        {/* Network Info */}
        {networkEntry && (
          <>
            <SectionHeader title="Network" icon="wifi-outline" />
            <View style={s.pskBanner}>
              <Text style={s.pskText}>
                {unit.unitNumber % 3 === 0 ? 'PSK_TYPE = 1  |  Non-VFD' : 'PSK_TYPE = 2  |  VFD'}
              </Text>
            </View>
            <View style={s.card}>
              <NetRow label="BMS Path (MSG AOI)"    value={networkEntry.bmsPath} first />
              <NetRow label="BMS Source (MSG AOI)"  value={networkEntry.bmsSourceElement} last />
            </View>
          </>
        )}

        {/* Stage Checklist */}
        <SectionHeader title="Commissioning Stages" icon="checkmark-circle-outline" />
        <View style={s.card}>
          {STAGES.map((stage, idx) => {
            const stageStatus = normalizeStageStatus(unit.stages[stage.key]);
            const dateStr = stageStatus !== 'pending' && unit.stagesDates?.[stage.key]
              ? (() => { try { return format(new Date(unit.stagesDates![stage.key]!), 'MMM d'); } catch { return null; } })()
              : null;
            const stageNote = unit.stagesNotes?.[stage.key];
            const stuckReason = unit.stagesStuckReasons?.[stage.key];
            const isEditingNote = editingStageNote === stage.key;
            const isEditingDate = editingStageDate === stage.key;
            const isEditingStuck = editingStuckReason === stage.key;
            return (
              <View key={stage.key} style={[s.stageRow, idx < STAGES.length - 1 && s.stageRowBorder]}>
                <View style={s.stageRowMain}>
                  <StageStatusIcon status={stageStatus} />
                  <View style={s.stageInfo}>
                    <Text style={s.stageLabel}>{stage.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={s.stageNum}>Stage {idx + 1} of {STAGES.length}</Text>
                      {stageStatus !== 'pending' && !isEditingDate && (
                        isEditMode ? (
                          <TouchableOpacity
                            onPress={() => {
                              setStageDateValue(unit.stagesDates?.[stage.key] ? format(new Date(unit.stagesDates![stage.key]!), 'MM/dd/yyyy') : format(new Date(), 'MM/dd/yyyy'));
                              setEditingStageNote(null);
                              setEditingStageDate(stage.key);
                            }}
                            activeOpacity={0.7}
                            style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}
                          >
                            <Text style={s.stageDateText}>{dateStr ? `· ${dateStr}` : '· Set date'}</Text>
                            <Ionicons name="pencil-outline" size={10} color="#6e7681" style={{ marginLeft: 3 }} />
                          </TouchableOpacity>
                        ) : dateStr ? (
                          <Text style={[s.stageDateText, { marginLeft: 6 }]}>· {dateStr}</Text>
                        ) : null
                      )}
                    </View>
                  </View>
                  {isEditMode && (
                    <View style={s.stageBtns}>
                      {(['complete', 'inProgress', 'stuck'] as StageStatus[]).map((st) => (
                        <TouchableOpacity
                          key={st}
                          style={[s.stageBtn, stageStatus === st && { backgroundColor: stageStatusColor(st) + '33', borderColor: stageStatusColor(st) }]}
                          onPress={() => handleStageChange(stage.key, stageStatus === st ? 'pending' : st)}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.stageBtnText, { color: stageStatusColor(st) }]}>{stageStatusLabel(st)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                {isEditingDate && (
                  <View style={s.stageNoteEditArea}>
                    <TextInput
                      style={[s.stageNoteInput, { minHeight: undefined }]}
                      value={stageDateValue}
                      onChangeText={setStageDateValue}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor="#6e7681"
                      autoFocus
                    />
                    <View style={s.stageNoteActions}>
                      <TouchableOpacity
                        style={s.stageNoteSaveBtn}
                        onPress={() => {
                          const p = parse(stageDateValue, 'MM/dd/yyyy', new Date());
                          if (isValid(p)) { setStageDate(unitId, stage.key, p.toISOString()); pushToCloud().catch(() => {}); }
                          setEditingStageDate(null);
                        }}
                      >
                        <Text style={s.stageNoteSaveText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingStageDate(null)}>
                        <Text style={s.stageNoteCancelText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {isEditingNote ? (
                  <View style={s.stageNoteEditArea}>
                    <TextInput
                      style={s.stageNoteInput}
                      value={stageNoteValue}
                      onChangeText={setStageNoteValue}
                      placeholder="Add a note…"
                      placeholderTextColor="#6e7681"
                      multiline
                      autoFocus
                    />
                    <View style={s.stageNoteActions}>
                      <TouchableOpacity
                        style={s.stageNoteSaveBtn}
                        onPress={() => {
                          setStageNote(unitId, stage.key, stageNoteValue);
                          pushToCloud().catch(() => {});
                          setEditingStageNote(null);
                        }}
                      >
                        <Text style={s.stageNoteSaveText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingStageNote(null)}>
                        <Text style={s.stageNoteCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      {!!stageNote && (
                        <TouchableOpacity onPress={() => {
                          setStageNote(unitId, stage.key, '');
                          pushToCloud().catch(() => {});
                          setEditingStageNote(null);
                        }} style={{ marginLeft: 'auto' }}>
                          <Text style={s.stageNoteClearText}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : isEditMode ? (
                  <TouchableOpacity
                    style={s.stageNoteRow}
                    onPress={() => { setStageNoteValue(stageNote ?? ''); setEditingStageNote(stage.key); setEditingStageDate(null); }}
                    activeOpacity={0.7}
                  >
                    <Text style={stageNote ? s.stageNoteText : s.stageNotePlaceholder} numberOfLines={2}>
                      {stageNote || '+ Add note'}
                    </Text>
                    {stageNote ? <Ionicons name="pencil-outline" size={11} color="#6e7681" style={{ marginLeft: 4 }} /> : null}
                  </TouchableOpacity>
                ) : stageNote ? (
                  <View style={s.stageNoteRow}>
                    <Text style={s.stageNoteText} numberOfLines={2}>{stageNote}</Text>
                  </View>
                ) : null}
                {stageStatus === 'stuck' && (
                  isEditingStuck ? (
                    <View style={s.stageNoteEditArea}>
                      <TextInput
                        style={s.stageNoteInput}
                        value={stuckReasonValue}
                        onChangeText={setStuckReasonValue}
                        placeholder="Why is this stage stuck?…"
                        placeholderTextColor="#6e7681"
                        multiline
                        autoFocus
                      />
                      <View style={s.stageNoteActions}>
                        <TouchableOpacity
                          style={s.stageNoteSaveBtn}
                          onPress={() => {
                            setStageStuckReason(unitId, stage.key, stuckReasonValue);
                            pushToCloud().catch(() => {});
                            setEditingStuckReason(null);
                          }}
                        >
                          <Text style={s.stageNoteSaveText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingStuckReason(null)}>
                          <Text style={s.stageNoteCancelText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[s.stageNoteRow, s.stuckReasonRow]}
                      onPress={isEditMode ? () => { setStuckReasonValue(stuckReason ?? ''); setEditingStuckReason(stage.key); setEditingStageNote(null); setEditingStageDate(null); } : undefined}
                      activeOpacity={isEditMode ? 0.7 : 1}
                    >
                      <Ionicons name="warning-outline" size={12} color="#f85149" style={{ marginRight: 4 }} />
                      <Text style={s.stuckReasonText} numberOfLines={2}>
                        {stuckReason || (isEditMode ? 'Tap to add reason…' : 'No reason given')}
                      </Text>
                      {isEditMode && <Ionicons name="pencil-outline" size={11} color="#f85149" style={{ marginLeft: 4 }} />}
                    </TouchableOpacity>
                  )
                )}
              </View>
            );
          })}
        </View>

        {/* Component Status */}
        <SectionHeader title="Component Status" icon="construct-outline" />
        <View style={s.card}>
          {COMPONENTS.map((comp, idx) => {
            const data = unit.components[comp.key];
            const issueCount = data.issues.filter((i) => !i.deleted).length;
            const openCount = data.issues.filter((i) => !i.resolved && !i.deleted).length;
            const label = unit.customComponentLabels?.[comp.key] ?? comp.label;

            return (
              <TouchableOpacity
                key={comp.key}
                style={[s.compRow, idx < COMPONENTS.length - 1 && s.compRowBorder]}
                onPress={() => setSelectedComponent(comp.key)}
                activeOpacity={0.7}
              >
                <StatusIcon status={data.status} />
                <View style={s.compInfo}>
                  <Text style={s.compLabel}>{label}</Text>
                  {issueCount > 0 && (
                    <Text style={[s.issueMeta, { color: openCount > 0 ? '#f85149' : '#3fb950' }]}>
                      {openCount > 0
                        ? `${openCount} open issue${openCount !== 1 ? 's' : ''}`
                        : `${issueCount} resolved`}
                    </Text>
                  )}
                </View>
                <View style={s.compRight}>
                  <Text style={[s.compStatusText, { color: statusColor(data.status) }]}>
                    {data.status === 'good' ? 'Good' : data.status === 'bad' ? 'Bad' : data.status === 'inProgress' ? 'In Progress' : '—'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#6e7681" style={s.chevron} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Misc Equipment */}
        <SectionHeader title="Misc Equipment" icon="cube-outline" />
        <View style={s.card}>
          {miscItems.map((item, idx) => {
            const openCount = item.issues.filter((i) => !i.resolved && !i.deleted).length;
            return (
              <TouchableOpacity
                key={item.id}
                style={[s.compRow, s.compRowBorder]}
                onPress={() => setSelectedMiscItem(item.id)}
                activeOpacity={0.7}
              >
                <StatusIcon status={item.status} />
                <View style={s.compInfo}>
                  <Text style={[s.compLabel, !item.label && s.compLabelPlaceholder]}>
                    {item.label || 'Unnamed Equipment'}
                  </Text>
                  {item.issues.filter((i) => !i.deleted).length > 0 && (
                    <Text style={[s.issueMeta, { color: openCount > 0 ? '#f85149' : '#3fb950' }]}>
                      {openCount > 0
                        ? `${openCount} open issue${openCount !== 1 ? 's' : ''}`
                        : `${item.issues.filter((i) => !i.deleted).length} resolved`}
                    </Text>
                  )}
                </View>
                <View style={s.compRight}>
                  <Text style={[s.compStatusText, { color: statusColor(item.status) }]}>
                    {item.status === 'good' ? 'Good' : item.status === 'bad' ? 'Bad' : item.status === 'inProgress' ? 'In Progress' : '—'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#6e7681" style={s.chevron} />
                </View>
              </TouchableOpacity>
            );
          })}
          {isEditMode && (
            addingMisc ? (
              <View style={s.addMiscInputRow} onLayout={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)}>
                <TextInput
                  style={s.addMiscInput}
                  value={newMiscName}
                  onChangeText={setNewMiscName}
                  placeholder="Equipment name…"
                  placeholderTextColor="#6e7681"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    const name = newMiscName.trim();
                    if (!name) return;
                    const id = `misc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    addMiscEquip(unitId, name, id);
                    setSelectedMiscItem(id);
                    setNewMiscName('');
                    setAddingMisc(false);
                  }}
                />
                <TouchableOpacity style={s.addMiscConfirm} onPress={() => {
                  const name = newMiscName.trim();
                  if (!name) return;
                  const id = `misc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  addMiscEquip(unitId, name, id);
                  setSelectedMiscItem(id);
                  setNewMiscName('');
                  setAddingMisc(false);
                }}>
                  <Ionicons name="checkmark" size={20} color="#3fb950" />
                </TouchableOpacity>
                <TouchableOpacity style={s.addMiscCancel} onPress={() => { setNewMiscName(''); setAddingMisc(false); }}>
                  <Ionicons name="close" size={20} color="#f85149" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.addMiscRow} onPress={() => setAddingMisc(true)} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={18} color="#58a6ff" style={{ marginRight: 8 }} />
                <Text style={s.addMiscText}>Add Equipment</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </ScrollView>

      {galleryOpen && <PhotoGalleryModal unit={unit} onClose={() => setGalleryOpen(false)} />}
      {selectedComponent && (
        <ComponentModal
          unitId={unitId}
          componentKey={selectedComponent}
          onClose={() => setSelectedComponent(null)}
        />
      )}
      {selectedMiscItem && (
        <MiscEquipModal
          unitId={unitId}
          itemId={selectedMiscItem}
          onClose={() => setSelectedMiscItem(null)}
        />
      )}
    </View>
  );
}

function HeaderStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={s.headerStat}>
      <Text style={[s.headerStatValue, { color }]}>{value}</Text>
      <Text style={s.headerStatLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={16} color="#58a6ff" style={{ marginRight: 6 }} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function NetRow({ label, value, last }: { label: string; value: string; first?: boolean; last?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <TouchableOpacity style={[s.netRow, !last && s.netRowBorder]} onPress={handleCopy} activeOpacity={0.7}>
      <Text style={s.netLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {copied && <Text style={s.netCopied}>Copied  </Text>}
        <Text style={s.netValue}>{value}</Text>
      </View>
    </TouchableOpacity>
  );
}

function stageStatusColor(s: StageStatus) {
  if (s === 'complete')   return '#3fb950';
  if (s === 'inProgress') return '#d29922';
  if (s === 'stuck')      return '#f85149';
  return '#6e7681';
}

function stageStatusLabel(s: StageStatus) {
  if (s === 'complete')   return 'Complete';
  if (s === 'inProgress') return 'In Progress';
  if (s === 'stuck')      return 'Stuck';
  return 'Pending';
}

function StageStatusIcon({ status }: { status: StageStatus }) {
  if (status === 'complete')   return <Ionicons name="checkmark-circle" size={22} color="#3fb950" style={s.statusIcon} />;
  if (status === 'inProgress') return <Ionicons name="time" size={22} color="#d29922" style={s.statusIcon} />;
  if (status === 'stuck')      return <Ionicons name="alert-circle" size={22} color="#f85149" style={s.statusIcon} />;
  return <Ionicons name="ellipse-outline" size={22} color="#30363d" style={s.statusIcon} />;
}

function StatusIcon({ status }: { status: 'good' | 'bad' | 'unchecked' | 'inProgress' }) {
  if (status === 'good') return <Ionicons name="checkmark-circle" size={22} color="#3fb950" style={s.statusIcon} />;
  if (status === 'bad') return <Ionicons name="close-circle" size={22} color="#f85149" style={s.statusIcon} />;
  if (status === 'inProgress') return <Ionicons name="time" size={22} color="#d29922" style={s.statusIcon} />;
  return <Ionicons name="ellipse-outline" size={22} color="#30363d" style={s.statusIcon} />;
}

function statusColor(status: string) {
  if (status === 'good') return '#3fb950';
  if (status === 'bad') return '#f85149';
  if (status === 'inProgress') return '#d29922';
  return '#6e7681';
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1117' },
  errorText: { color: '#f85149', fontSize: 16 },
  headerBar: {
    flexDirection: 'row',
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    paddingVertical: 10,
  },
  siblingNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  siblingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 80,
  },
  siblingBtnRight: { justifyContent: 'flex-end' },
  siblingBtnDisabled: { opacity: 0.4 },
  siblingBtnText: { color: '#58a6ff', fontSize: 13, fontWeight: '600', marginHorizontal: 4 },
  siblingBtnTextDisabled: { color: '#30363d' },
  siblingCurrent: { color: '#e6edf3', fontSize: 13, fontWeight: '700' },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatValue: { fontSize: 20, fontWeight: '700' },
  headerStatLabel: { color: '#8b949e', fontSize: 10, marginTop: 1 },
  scroll: { padding: 14, paddingBottom: 40 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionTitle: { color: '#8b949e', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#21262d',
    overflow: 'hidden',
  },
  // Stage rows
  stageRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  stageRowMain: { flexDirection: 'row', alignItems: 'center' },
  stageRowBorder: { borderBottomWidth: 1, borderBottomColor: '#21262d' },
  stageInfo: { flex: 1, marginRight: 8 },
  stageLabel: { color: '#e6edf3', fontSize: 14, fontWeight: '500' },
  stageNum: { color: '#6e7681', fontSize: 11, marginTop: 2 },
  stageDateText: { color: '#6e7681', fontSize: 11, marginTop: 2 },
  stageBtns: { flexDirection: 'row', gap: 4 },
  stageBtn: {
    paddingVertical: 5, paddingHorizontal: 8,
    borderRadius: 6, borderWidth: 1, borderColor: '#30363d',
  },
  stageBtnText: { fontSize: 11, fontWeight: '700' },
  stageNoteRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingLeft: 34 },
  stageNoteText: { color: '#8b949e', fontSize: 12, flex: 1 },
  stageNotePlaceholder: { color: '#484f58', fontSize: 12 },
  stuckReasonRow: { marginTop: 4 },
  stuckReasonText: { color: '#f85149', fontSize: 12, flex: 1, opacity: 0.85 },
  stageNoteEditArea: { marginTop: 8, paddingLeft: 34 },
  stageNoteInput: {
    backgroundColor: '#0d1117', borderRadius: 6, borderWidth: 1, borderColor: '#30363d',
    color: '#e6edf3', fontSize: 13, padding: 8, minHeight: 60, textAlignVertical: 'top',
  },
  stageNoteActions: { flexDirection: 'row', gap: 12, marginTop: 6, justifyContent: 'flex-end' },
  stageNoteSaveBtn: { backgroundColor: '#58a6ff22', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 14, borderWidth: 1, borderColor: '#58a6ff' },
  stageNoteSaveText: { color: '#58a6ff', fontSize: 13, fontWeight: '600' },
  stageNoteCancelText: { color: '#6e7681', fontSize: 13, paddingVertical: 5 },
  stageNoteClearText: { color: '#f85149', fontSize: 13, paddingVertical: 5 },
  // Component rows
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  compRowBorder: { borderBottomWidth: 1, borderBottomColor: '#21262d' },
  statusIcon: { marginRight: 12 },
  compInfo: { flex: 1 },
  compLabel: { color: '#e6edf3', fontSize: 14, fontWeight: '500' },
  compLabelPlaceholder: { color: '#6e7681', fontStyle: 'italic' },
  issueMeta: { fontSize: 11, marginTop: 2 },
  addMiscRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 14 },
  addMiscText: { color: '#58a6ff', fontSize: 14, fontWeight: '600' },
  addMiscInputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14 },
  addMiscInput: { flex: 1, backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#58a6ff', borderRadius: 8, color: '#e6edf3', fontSize: 14, paddingHorizontal: 10, paddingVertical: 8 },
  addMiscConfirm: { padding: 8, marginLeft: 6 },
  addMiscCancel: { padding: 8, marginLeft: 2 },
  compRight: { flexDirection: 'row', alignItems: 'center' },
  compStatusText: { fontSize: 12, fontWeight: '600', marginRight: 4 },
  chevron: { marginLeft: 2 },
  pskBanner: { marginBottom: 6, paddingHorizontal: 4 },
  pskText: { color: '#58a6ff', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14 },
  netRowBorder: { borderBottomWidth: 1, borderBottomColor: '#21262d' },
  netLabel: { color: '#8b949e', fontSize: 13, fontWeight: '500' },
  netValue: { color: '#e6edf3', fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  netCopied: { color: '#3fb950', fontSize: 11, fontWeight: '600' },
  galleryBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161b22', borderRadius: 10, borderWidth: 1, borderColor: '#21262d',
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14,
  },
  galleryBtnText: { color: '#58a6ff', fontSize: 14, fontWeight: '600' },
});
