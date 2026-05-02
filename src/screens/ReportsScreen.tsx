import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { STAGES, COMPONENTS } from '../types';
import { exportToExcel } from '../utils/exportExcel';

export default function ReportsScreen() {
  const units = useStore((state) => state.units);
  const [exporting, setExporting] = useState(false);

  const stats = useMemo(() => {
    const all = Object.values(units);
    const north = all.filter((u) => u.side === 'North');
    const south = all.filter((u) => u.side === 'South');

    const stageStats = STAGES.map((stage) => ({
      label: stage.label,
      northDone: north.filter((u) => u.stages[stage.key]).length,
      southDone: south.filter((u) => u.stages[stage.key]).length,
    }));

    const allIssues = all.flatMap((u) =>
      Object.values(u.components).flatMap((c) => c.issues)
    );
    const openIssues = allIssues.filter((i) => !i.resolved);

    const fullyComplete = all.filter((u) => STAGES.every((s) => u.stages[s.key])).length;
    const hasAnyWork = all.filter((u) => STAGES.some((s) => u.stages[s.key])).length;

    const compStats = COMPONENTS.map((comp) => ({
      label: comp.label,
      good: all.filter((u) => u.components[comp.key].status === 'good').length,
      bad: all.filter((u) => u.components[comp.key].status === 'bad').length,
    }));

    // Group open issues by unit for the issue list
    const issuesByUnit = openIssues.map((issue) => {
      const unit = all.find((u) =>
        Object.values(u.components).some((c) => c.issues.some((i) => i.id === issue.id))
      );
      const comp = unit
        ? COMPONENTS.find((c) => unit.components[c.key].issues.some((i) => i.id === issue.id))
        : null;
      return { issue, unitId: unit?.id ?? '?', compLabel: comp?.label ?? '?' };
    }).sort((a, b) => b.issue.dateFound.localeCompare(a.issue.dateFound));

    return { stageStats, openIssues, issuesByUnit, fullyComplete, hasAnyWork, compStats, total: all.length };
  }, [units]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportToExcel(units);
    } catch (e) {
      Alert.alert('Export Failed', String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Export button */}
      <TouchableOpacity style={s.exportBtn} onPress={handleExport} disabled={exporting} activeOpacity={0.8}>
        {exporting ? (
          <ActivityIndicator color="#0d1117" size="small" />
        ) : (
          <Ionicons name="download-outline" size={20} color="#0d1117" style={{ marginRight: 8 }} />
        )}
        <Text style={s.exportBtnText}>{exporting ? 'Generating…' : 'Export to Excel'}</Text>
      </TouchableOpacity>

      {/* Overall progress */}
      <SectionHeader title="Overall Progress" />
      <View style={s.card}>
        <StatRow label="Total Units" value={stats.total} />
        <StatRow label="Fully Commissioned" value={`${stats.fullyComplete} / ${stats.total}`} valueColor="#3fb950" />
        <StatRow label="In Progress" value={stats.hasAnyWork - stats.fullyComplete} valueColor="#d29922" />
        <StatRow label="Not Started" value={stats.total - stats.hasAnyWork} valueColor="#6e7681" />
        <StatRow label="Open Issues" value={stats.openIssues.length} valueColor={stats.openIssues.length > 0 ? '#f85149' : '#3fb950'} last />
      </View>

      {/* Stage completion */}
      <SectionHeader title="Stage Completion" />
      <View style={s.card}>
        {stats.stageStats.map((st, idx) => (
          <View key={st.label} style={[s.stageStatRow, idx < stats.stageStats.length - 1 && s.rowBorder]}>
            <Text style={s.stageStatLabel} numberOfLines={1}>{st.label}</Text>
            <View style={s.stageStatCounts}>
              <View style={s.sideStat}>
                <Text style={s.sideStatLabel}>N</Text>
                <Text style={[s.sideStatVal, { color: st.northDone === 26 ? '#3fb950' : '#d29922' }]}>
                  {st.northDone}/26
                </Text>
              </View>
              <View style={s.sideStat}>
                <Text style={s.sideStatLabel}>S</Text>
                <Text style={[s.sideStatVal, { color: st.southDone === 25 ? '#3fb950' : '#d29922' }]}>
                  {st.southDone}/25
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Component summary */}
      <SectionHeader title="Component Summary (All Units)" />
      <View style={s.card}>
        {stats.compStats.map((comp, idx) => (
          <View key={comp.label} style={[s.compStatRow, idx < stats.compStats.length - 1 && s.rowBorder]}>
            <Text style={s.compStatLabel}>{comp.label}</Text>
            <View style={s.compStatRight}>
              <Text style={[s.compStat, { color: '#3fb950' }]}>✓{comp.good}</Text>
              <Text style={[s.compStat, { color: '#f85149' }]}>✗{comp.bad}</Text>
              <Text style={[s.compStat, { color: '#6e7681' }]}>?{stats.total - comp.good - comp.bad}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Open issues */}
      {stats.issuesByUnit.length > 0 && (
        <>
          <SectionHeader title={`Open Issues (${stats.openIssues.length})`} />
          {stats.issuesByUnit.map(({ issue, unitId, compLabel }) => (
            <View key={issue.id} style={s.issueCard}>
              <View style={s.issueCardHeader}>
                <Text style={s.issueUnit}>{unitId}</Text>
                <Text style={s.issueComp}>{compLabel}</Text>
                <Text style={s.issueDate}>
                  {(() => { try { return new Date(issue.dateFound).toLocaleDateString(); } catch { return issue.dateFound; } })()}
                </Text>
              </View>
              <Text style={s.issueNotes} numberOfLines={2}>{issue.notes}</Text>
              {issue.foundBy ? <Text style={s.issueBy}>Found by: {issue.foundBy}</Text> : null}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title}</Text>;
}

function StatRow({ label, value, valueColor, last }: { label: string; value: string | number; valueColor?: string; last?: boolean }) {
  return (
    <View style={[s.statRow, !last && s.rowBorder]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  content: { padding: 16, paddingBottom: 50 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3fb950',
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 24,
  },
  exportBtnText: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
  sectionHeader: {
    color: '#8b949e',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 6,
  },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#21262d',
    marginBottom: 20,
    overflow: 'hidden',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#21262d' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  statLabel: { color: '#8b949e', fontSize: 14 },
  statValue: { color: '#e6edf3', fontSize: 14, fontWeight: '600' },
  stageStatRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  stageStatLabel: { flex: 1, color: '#e6edf3', fontSize: 13 },
  stageStatCounts: { flexDirection: 'row' },
  sideStat: { alignItems: 'center', marginLeft: 12 },
  sideStatLabel: { color: '#6e7681', fontSize: 10, fontWeight: '700' },
  sideStatVal: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  compStatRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  compStatLabel: { flex: 1, color: '#e6edf3', fontSize: 13 },
  compStatRight: { flexDirection: 'row' },
  compStat: { fontSize: 13, fontWeight: '600', minWidth: 30, textAlign: 'right', marginLeft: 10 },
  issueCard: {
    backgroundColor: '#161b22',
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: '#21262d',
    borderLeftColor: '#f85149',
    padding: 12,
    marginBottom: 8,
  },
  issueCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  issueUnit: { color: '#58a6ff', fontSize: 13, fontWeight: '700', marginRight: 8 },
  issueComp: { color: '#8b949e', fontSize: 12, flex: 1 },
  issueDate: { color: '#6e7681', fontSize: 11 },
  issueNotes: { color: '#e6edf3', fontSize: 13, marginBottom: 4 },
  issueBy: { color: '#6e7681', fontSize: 11 },
});
