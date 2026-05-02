import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { UnitStackParamList } from '../navigation';
import { useStore } from '../store/useStore';
import { STAGES, COMPONENTS, ComponentKey, StageKey } from '../types';
import ComponentModal from '../components/ComponentModal';
import MiscEquipModal from '../components/MiscEquipModal';

type Props = NativeStackScreenProps<UnitStackParamList, 'UnitDetail'>;

export default function UnitDetailScreen({ route }: Props) {
  const { unitId } = route.params;
  const unit = useStore((state) => state.units[unitId]);
  const updateStage = useStore((state) => state.updateStage);

  const [selectedComponent, setSelectedComponent] = useState<ComponentKey | null>(null);
  const [selectedMiscItem, setSelectedMiscItem] = useState<string | null>(null);
  const addMiscEquip = useStore((state) => state.addMiscEquip);

  const handleStageToggle = useCallback(
    (key: StageKey, current: boolean) => {
      if (current) {
        Alert.alert(
          'Unmark Stage',
          `Are you sure you want to unmark "${STAGES.find((s) => s.key === key)?.label}"?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Unmark', style: 'destructive', onPress: () => updateStage(unitId, key, false) },
          ]
        );
      } else {
        Alert.alert(
          'Confirm Stage Complete',
          `Mark "${STAGES.find((s) => s.key === key)?.label}" as complete?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Confirm', onPress: () => updateStage(unitId, key, true) },
          ]
        );
      }
    },
    [unitId, updateStage]
  );

  if (!unit) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Unit not found</Text>
      </View>
    );
  }

  const stagesComplete = STAGES.filter((st) => unit.stages[st.key]).length;
  const allComps = Object.values(unit.components);
  const miscItems = unit.miscEquipment ?? [];
  const goodCount = allComps.filter((c) => c.status === 'good').length + miscItems.filter((m) => m.status === 'good').length;
  const badCount = allComps.filter((c) => c.status === 'bad').length + miscItems.filter((m) => m.status === 'bad').length;
  const openIssues = allComps.flatMap((c) => c.issues).filter((i) => !i.resolved).length
    + miscItems.flatMap((m) => m.issues).filter((i) => !i.resolved).length;

  return (
    <View style={s.container}>
      {/* Header summary strip */}
      <View style={s.headerBar}>
        <HeaderStat label="Stages" value={`${stagesComplete}/${STAGES.length}`} color="#58a6ff" />
        <HeaderStat label="Good" value={goodCount} color="#3fb950" />
        <HeaderStat label="Bad" value={badCount} color="#f85149" />
        <HeaderStat label="Open Issues" value={openIssues} color={openIssues > 0 ? '#f85149' : '#3fb950'} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Stage Checklist */}
        <SectionHeader title="Commissioning Stages" icon="checkmark-circle-outline" />
        <View style={s.card}>
          {STAGES.map((stage, idx) => {
            const done = unit.stages[stage.key];
            return (
              <TouchableOpacity
                key={stage.key}
                style={[s.stageRow, idx < STAGES.length - 1 && s.stageRowBorder]}
                onPress={() => handleStageToggle(stage.key, done)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, done && s.checkboxDone]}>
                  {done && <Ionicons name="checkmark" size={16} color="#0d1117" />}
                </View>
                <View style={s.stageInfo}>
                  <Text style={[s.stageLabel, done && s.stageLabelDone]}>{stage.label}</Text>
                  <Text style={s.stageNum}>Stage {idx + 1} of {STAGES.length}</Text>
                </View>
                <Text style={[s.stageStatus, { color: done ? '#3fb950' : '#6e7681' }]}>
                  {done ? 'Complete' : 'Pending'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Component Status */}
        <SectionHeader title="Component Status" icon="construct-outline" />
        <View style={s.card}>
          {COMPONENTS.map((comp, idx) => {
            const data = unit.components[comp.key];
            const issueCount = data.issues.length;
            const openCount = data.issues.filter((i) => !i.resolved).length;
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
            const openCount = item.issues.filter((i) => !i.resolved).length;
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
                  {item.issues.length > 0 && (
                    <Text style={[s.issueMeta, { color: openCount > 0 ? '#f85149' : '#3fb950' }]}>
                      {openCount > 0
                        ? `${openCount} open issue${openCount !== 1 ? 's' : ''}`
                        : `${item.issues.length} resolved`}
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
          <TouchableOpacity style={s.addMiscRow} onPress={() => addMiscEquip(unitId)} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={18} color="#58a6ff" style={{ marginRight: 8 }} />
            <Text style={s.addMiscText}>Add Equipment</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  stageRowBorder: { borderBottomWidth: 1, borderBottomColor: '#21262d' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#30363d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxDone: { backgroundColor: '#3fb950', borderColor: '#3fb950' },
  stageInfo: { flex: 1 },
  stageLabel: { color: '#e6edf3', fontSize: 15, fontWeight: '500' },
  stageLabelDone: { color: '#8b949e' },
  stageNum: { color: '#6e7681', fontSize: 11, marginTop: 2 },
  stageStatus: { fontSize: 12, fontWeight: '600' },
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
  compRight: { flexDirection: 'row', alignItems: 'center' },
  compStatusText: { fontSize: 12, fontWeight: '600', marginRight: 4 },
  chevron: { marginLeft: 2 },
});
