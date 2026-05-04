import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { STAGES, COMPONENTS, Unit } from '../types';

function getUnitPct(unit: Unit): number {
  const stagesComplete = STAGES.filter((s) => unit.stages[s.key]).length;
  const good = Object.values(unit.components).filter((c) => c.status === 'good').length;
  return Math.round((stagesComplete / STAGES.length) * 70 + (good / COMPONENTS.length) * 30);
}

function getOpenIssueCount(unit: Unit): number {
  const compIssues = Object.values(unit.components).flatMap((c) => c.issues).filter((i) => !i.resolved && !i.deleted);
  const miscIssues = (unit.miscEquipment ?? []).flatMap((m) => m.issues ?? []).filter((i) => !i.resolved && !i.deleted);
  return compIssues.length + miscIssues.length;
}

function unitColor(pct: number, issues: number): string {
  if (issues > 0) return '#f85149';
  if (pct === 100) return '#3fb950';
  if (pct > 0) return '#d29922';
  return '#30363d';
}

export default function DashboardScreen() {
  const units = useStore((s) => s.units);
  const navigation = useNavigation<any>();

  const { sortedUnits, stats, openIssues, overallPct } = useMemo(() => {
    const all = Object.values(units).sort((a, b) =>
      a.side !== b.side ? a.side.localeCompare(b.side) : a.unitNumber - b.unitNumber
    );

    const complete = all.filter((u) => getUnitPct(u) === 100 && getOpenIssueCount(u) === 0).length;
    const inProgress = all.filter((u) => { const p = getUnitPct(u); return p > 0 && !(p === 100 && getOpenIssueCount(u) === 0); }).length;
    const totalIssues = all.reduce((n, u) => n + getOpenIssueCount(u), 0);
    const overallPct = all.length > 0 ? Math.round(all.reduce((n, u) => n + getUnitPct(u), 0) / all.length) : 0;

    const openIssues: { key: string; unitId: string; unit: Unit; compLabel: string; notes: string; foundBy: string; ageDays: number }[] = [];
    for (const unit of all) {
      for (const comp of COMPONENTS) {
        const label = unit.customComponentLabels?.[comp.key] ?? comp.label;
        for (const issue of unit.components[comp.key].issues.filter((i) => !i.resolved && !i.deleted)) {
          openIssues.push({ key: issue.id, unitId: unit.id, unit, compLabel: label, notes: issue.notes, foundBy: issue.foundBy, ageDays: Math.floor((Date.now() - new Date(issue.dateFound).getTime()) / 86400000) });
        }
      }
      for (const m of (unit.miscEquipment ?? []).filter((m) => !m.deleted)) {
        for (const issue of m.issues.filter((i) => !i.resolved && !i.deleted)) {
          openIssues.push({ key: issue.id, unitId: unit.id, unit, compLabel: m.label || 'Misc Equipment', notes: issue.notes, foundBy: issue.foundBy, ageDays: Math.floor((Date.now() - new Date(issue.dateFound).getTime()) / 86400000) });
        }
      }
    }
    openIssues.sort((a, b) => b.ageDays - a.ageDays);

    return { sortedUnits: all, stats: { total: all.length, complete, inProgress, totalIssues }, openIssues, overallPct };
  }, [units]);

  const goToUnit = (unit: Unit) => {
    navigation.navigate(unit.side === 'North' ? 'NorthTab' : 'SouthTab', {
      screen: 'UnitDetail',
      params: { unitId: unit.id },
    } as any);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Summary bar */}
      <View style={s.summaryBar}>
        <SumStat label="Total"       value={stats.total}       color="#58a6ff" />
        <SumStat label="Complete"    value={stats.complete}    color="#3fb950" />
        <SumStat label="In Progress" value={stats.inProgress}  color="#d29922" />
        <SumStat label="Open Issues" value={stats.totalIssues} color={stats.totalIssues > 0 ? '#f85149' : '#3fb950'} />
      </View>

      {/* Overall completion bar */}
      <View style={s.overallCard}>
        <View style={s.overallRow}>
          <Text style={s.overallLabel}>Overall Completion</Text>
          <Text style={s.overallPct}>{overallPct}%</Text>
        </View>
        <View style={s.overallBarBg}>
          <View style={[s.overallBarFill, { width: `${overallPct}%` as any }]} />
        </View>
      </View>

      {/* Per-unit list */}
      <SectionLabel title="Units" />
      <View style={s.listCard}>
        {sortedUnits.map((unit, idx) => {
          const pct = getUnitPct(unit);
          const issues = getOpenIssueCount(unit);
          const color = unitColor(pct, issues);
          return (
            <TouchableOpacity
              key={unit.id}
              style={[s.unitRow, idx < sortedUnits.length - 1 && s.rowBorder]}
              onPress={() => goToUnit(unit)}
              activeOpacity={0.7}
            >
              <View style={[s.sideDot, { backgroundColor: color }]} />
              <View style={s.unitInfo}>
                <View style={s.unitTopRow}>
                  <Text style={s.unitId}>{unit.id}</Text>
                  {issues > 0 && (
                    <View style={s.issueBadge}>
                      <Text style={s.issueBadgeText}>{issues}</Text>
                    </View>
                  )}
                  <Text style={[s.unitPct, { color }]}>{pct}%</Text>
                </View>
                <View style={s.barBg}>
                  <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#30363d" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Open issues */}
      {openIssues.length > 0 && (
        <>
          <SectionLabel title={`Open Issues (${openIssues.length})`} />
          {openIssues.map((item) => (
            <TouchableOpacity key={item.key} style={s.issueCard} onPress={() => goToUnit(item.unit)} activeOpacity={0.7}>
              <View style={s.issueHeader}>
                <Text style={s.issueUnitId}>{item.unitId}</Text>
                <Text style={s.issueComp} numberOfLines={1}>{item.compLabel}</Text>
                <View style={s.ageBadge}>
                  <Text style={s.ageBadgeText}>{item.ageDays}d</Text>
                </View>
              </View>
              <Text style={s.issueNotes} numberOfLines={2}>{item.notes}</Text>
              {!!item.foundBy && <Text style={s.issueBy}>{item.foundBy}</Text>}
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function SumStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.sumStat}>
      <Text style={[s.sumStatValue, { color }]}>{value}</Text>
      <Text style={s.sumStatLabel}>{label}</Text>
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return <Text style={s.sectionLabel}>{title}</Text>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  content: { paddingBottom: 50 },
  summaryBar: {
    flexDirection: 'row', backgroundColor: '#161b22',
    borderBottomWidth: 1, borderBottomColor: '#21262d', paddingVertical: 14,
  },
  sumStat: { flex: 1, alignItems: 'center' },
  sumStatValue: { fontSize: 22, fontWeight: '700' },
  sumStatLabel: { color: '#8b949e', fontSize: 11, marginTop: 2 },
  overallCard: {
    margin: 14, marginBottom: 4, backgroundColor: '#161b22',
    borderRadius: 10, borderWidth: 1, borderColor: '#21262d', padding: 14,
  },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  overallLabel: { color: '#8b949e', fontSize: 13, fontWeight: '600' },
  overallPct: { color: '#58a6ff', fontSize: 18, fontWeight: '700' },
  overallBarBg: { height: 6, backgroundColor: '#21262d', borderRadius: 3, overflow: 'hidden' },
  overallBarFill: { height: 6, backgroundColor: '#58a6ff', borderRadius: 3 },
  sectionLabel: {
    color: '#8b949e', fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', paddingHorizontal: 14, marginTop: 18, marginBottom: 8,
  },
  listCard: { backgroundColor: '#161b22', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#21262d' },
  unitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#21262d' },
  sideDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12, flexShrink: 0 },
  unitInfo: { flex: 1, marginRight: 4 },
  unitTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  unitId: { color: '#e6edf3', fontSize: 14, fontWeight: '600', marginRight: 6 },
  issueBadge: { backgroundColor: '#f85149', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginRight: 6 },
  issueBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  unitPct: { marginLeft: 'auto' as any, fontSize: 12, fontWeight: '700' },
  barBg: { height: 3, backgroundColor: '#21262d', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 3, borderRadius: 2 },
  issueCard: {
    backgroundColor: '#161b22', borderLeftWidth: 3, borderLeftColor: '#f85149',
    borderBottomWidth: 1, borderBottomColor: '#21262d',
    paddingVertical: 10, paddingHorizontal: 14,
  },
  issueHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  issueUnitId: { color: '#58a6ff', fontSize: 13, fontWeight: '700', marginRight: 8 },
  issueComp: { color: '#8b949e', fontSize: 12, flex: 1, marginRight: 6 },
  ageBadge: { backgroundColor: '#f8514922', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#f8514966' },
  ageBadgeText: { color: '#f85149', fontSize: 10, fontWeight: '600' },
  issueNotes: { color: '#e6edf3', fontSize: 13, marginBottom: 2 },
  issueBy: { color: '#6e7681', fontSize: 11 },
});
