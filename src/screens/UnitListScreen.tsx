import React, { useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { UnitStackParamList } from '../navigation';
import { useStore } from '../store/useStore';
import { Unit, STAGES, COMPONENTS } from '../types';

type Props = NativeStackScreenProps<UnitStackParamList, 'UnitList'>;

function unitStatusColor(unit: Unit): string {
  const comps = Object.values(unit.components);
  const miscItems = (unit.miscEquipment ?? []).filter((m) => !m.deleted);
  const miscIssues = miscItems.flatMap((m) => m.issues ?? []);
  const openIssues = [...comps.flatMap((c) => c.issues), ...miscIssues].filter((i) => !i.resolved && !i.deleted).length;
  const hasBad = comps.some((c) => c.status === 'bad') || miscItems.some((m) => m.status === 'bad');
  if (hasBad || openIssues > 0) return '#f85149';

  const stagesComplete = STAGES.filter((s) => unit.stages[s.key]).length;
  if (stagesComplete === STAGES.length) return '#3fb950';

  const hasWork = stagesComplete > 0
    || comps.some((c) => c.status !== 'unchecked')
    || miscItems.some((m) => m.status !== 'unchecked');
  if (hasWork) return '#d29922';
  return '#30363d';
}

function UnitCard({ unit, onPress }: { unit: Unit; onPress: () => void }) {
  const comps = Object.values(unit.components);
  const stagesComplete = STAGES.filter((s) => unit.stages[s.key]).length;
  const good = comps.filter((c) => c.status === 'good').length;
  const bad = comps.filter((c) => c.status === 'bad').length;
  const miscIssues = (unit.miscEquipment ?? []).filter((m) => !m.deleted).flatMap((m) => m.issues ?? []);
  const openIssues = [...comps.flatMap((c) => c.issues), ...miscIssues].filter((i) => !i.resolved && !i.deleted).length;
  const color = unitStatusColor(unit);

  return (
    <TouchableOpacity style={[s.card, { borderColor: color }]} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.cardTop, { backgroundColor: color + '28' }]}>
        <Text style={s.unitId}>{unit.id}</Text>
        <View style={[s.dot, { backgroundColor: color }]} />
      </View>
      <View style={s.cardBody}>
        <Text style={s.stageLabel}>
          Stages <Text style={[s.stageCount, { color }]}>{stagesComplete}/{STAGES.length}</Text>
        </Text>
        <Text style={s.compRow}>
          <Text style={s.good}>✓{good} </Text>
          <Text style={s.bad}>✗{bad} </Text>
          <Text style={s.unch}>?{COMPONENTS.length - good - bad}</Text>
        </Text>
        {openIssues > 0 && (
          <View style={s.issuePill}>
            <Text style={s.issueText}>{openIssues} open issue{openIssues !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function UnitListScreen({ navigation, route }: Props) {
  const { side } = route.params;
  const units = useStore((state) => state.units);

  const sideUnits = useMemo(
    () =>
      Object.values(units)
        .filter((u) => u.side === side)
        .sort((a, b) => a.unitNumber - b.unitNumber),
    [units, side]
  );

  const stats = useMemo(() => {
    const complete = sideUnits.filter((u) =>
      STAGES.every((st) => u.stages[st.key])
    ).length;
    const hasIssue = sideUnits.filter((u) => {
      const compIssues = Object.values(u.components).flatMap((c) => c.issues);
      const miscIssues = (u.miscEquipment ?? []).flatMap((m) => m.issues ?? []);
      return [...compIssues, ...miscIssues].some((i) => !i.resolved && !i.deleted);
    }).length;
    const inProgress = sideUnits.filter((u) => {
      if (STAGES.every((st) => u.stages[st.key])) return false;
      return STAGES.some((st) => u.stages[st.key])
        || Object.values(u.components).some((c) => c.status !== 'unchecked')
        || (u.miscEquipment ?? []).some((m) => m.status !== 'unchecked');
    }).length;
    return { complete, hasIssue, inProgress };
  }, [sideUnits]);

  return (
    <View style={s.container}>
      <View style={s.summary}>
        <SumItem label="Total" value={sideUnits.length} color="#58a6ff" />
        <SumItem label="Complete" value={stats.complete} color="#3fb950" />
        <SumItem label="Open Issues" value={stats.hasIssue} color="#f85149" />
        <SumItem label="In Progress" value={stats.inProgress} color="#d29922" />
      </View>
      <FlatList
        data={sideUnits}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <UnitCard
            unit={item}
            onPress={() => navigation.navigate('UnitDetail', { unitId: item.id })}
          />
        )}
      />
    </View>
  );
}

function SumItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.sumItem}>
      <Text style={[s.sumValue, { color }]}>{value}</Text>
      <Text style={s.sumLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  summary: {
    flexDirection: 'row',
    backgroundColor: '#161b22',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  sumItem: { flex: 1, alignItems: 'center' },
  sumValue: { fontSize: 22, fontWeight: '700' },
  sumLabel: { color: '#8b949e', fontSize: 11, marginTop: 2 },
  list: { padding: 8 },
  card: {
    flex: 1,
    margin: 5,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  unitId: { color: '#e6edf3', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardBody: { padding: 10 },
  stageLabel: { color: '#8b949e', fontSize: 12, marginBottom: 4 },
  stageCount: { fontWeight: '700' },
  compRow: { fontSize: 12, marginBottom: 2 },
  good: { color: '#3fb950', fontWeight: '600' },
  bad: { color: '#f85149', fontWeight: '600' },
  unch: { color: '#6e7681' },
  issuePill: {
    marginTop: 6,
    backgroundColor: '#f8514922',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#f85149',
  },
  issueText: { color: '#f85149', fontSize: 10, textAlign: 'center', fontWeight: '600' },
});
