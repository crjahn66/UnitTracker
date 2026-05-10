import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { STAGES, COMPONENTS, Unit, normalizeStageStatus } from '../types';

type UnitStatus = 'issues' | 'complete' | 'inProgress' | 'notStarted';

function getUnitPct(unit: Unit): number {
  const stagesComplete = STAGES.filter((s) => normalizeStageStatus(unit.stages[s.key]) === 'complete').length;
  const good = Object.values(unit.components).filter((c) => c.status === 'good').length;
  return Math.round((stagesComplete / STAGES.length) * 70 + (good / COMPONENTS.length) * 30);
}

function getOpenIssueCount(unit: Unit): number {
  const compIssues = Object.values(unit.components).flatMap((c) => c.issues).filter((i) => !i.resolved && !i.deleted);
  const miscIssues = (unit.miscEquipment ?? []).flatMap((m) => m.issues ?? []).filter((i) => !i.resolved && !i.deleted);
  return compIssues.length + miscIssues.length;
}

function getOpenCompIssueCount(unit: Unit): number {
  return Object.values(unit.components).flatMap((c) => c.issues).filter((i) => !i.resolved && !i.deleted).length;
}

function hasBadComponentStatus(unit: Unit): boolean {
  return Object.values(unit.components).some((c) => c.status === 'bad');
}

function hasStuckStage(unit: Unit): boolean {
  return STAGES.some((s) => normalizeStageStatus(unit.stages[s.key]) === 'stuck');
}

// A unit has "issues" if any of: open component issues, bad component status,
// or any commissioning stage is stuck. These all roll into the same red state.
function unitHasIssues(unit: Unit): boolean {
  return getOpenCompIssueCount(unit) > 0 || hasBadComponentStatus(unit) || hasStuckStage(unit);
}

function isUnitComplete(unit: Unit): boolean {
  return STAGES.every((s) => normalizeStageStatus(unit.stages[s.key]) === 'complete') && getOpenCompIssueCount(unit) === 0;
}

// Priority: issues > complete > in-progress > not-started
function getUnitStatus(unit: Unit): UnitStatus {
  if (unitHasIssues(unit)) return 'issues';
  if (isUnitComplete(unit)) return 'complete';
  if (getUnitPct(unit) > 0) return 'inProgress';
  return 'notStarted';
}

const STATUS_COLOR: Record<UnitStatus, string> = {
  issues:     '#f85149',
  complete:   '#3fb950',
  inProgress: '#d29922',
  notStarted: '#30363d',
};

function unitColor(unit: Unit): string {
  return STATUS_COLOR[getUnitStatus(unit)];
}

export default function DashboardScreen() {
  const units = useStore((s) => s.units);
  const navigation = useNavigation<any>();

  const [searchText, setSearchText] = useState('');
  const [sideFilter, setSideFilter] = useState<'all' | 'North' | 'South'>('all');
  const [showAllUnits, setShowAllUnits] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    if (text) {
      clearTimerRef.current = setTimeout(() => setSearchText(''), 5 * 60 * 1000);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchText('');
    if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
  }, []);

  useEffect(() => () => { if (clearTimerRef.current) clearTimeout(clearTimerRef.current); }, []);

  const { sortedUnits, northUnits, southUnits, stats, openIssues, overallPct, sidePcts, sideDone } = useMemo(() => {
    const all = Object.values(units).sort((a, b) =>
      a.side !== b.side ? a.side.localeCompare(b.side) : a.unitNumber - b.unitNumber
    );

    const complete = all.filter(isUnitComplete).length;
    const inProgress = all.filter((u) => { const p = getUnitPct(u); return p > 0 && !isUnitComplete(u); }).length;
    const totalIssues = all.reduce((n, u) => n + getOpenIssueCount(u), 0);
    const chillerReady = all.filter((u) => u.chillerAvailable === true).length;
    const overallPct = all.length > 0 ? Math.round(all.reduce((n, u) => n + getUnitPct(u), 0) / all.length) : 0;

    const northUnits = all.filter((u) => u.side === 'North').sort((a, b) => a.unitNumber - b.unitNumber);
    const southUnits = all.filter((u) => u.side === 'South').sort((a, b) => a.unitNumber - b.unitNumber);
    const sidePct = (arr: Unit[]) => arr.length === 0 ? 0 : Math.round(arr.reduce((n, u) => n + getUnitPct(u), 0) / arr.length);
    const sideDoneCount = (arr: Unit[]) => arr.filter(isUnitComplete).length;
    const sidePcts = { N: sidePct(northUnits), S: sidePct(southUnits) };
    const sideDone = { N: sideDoneCount(northUnits), S: sideDoneCount(southUnits) };

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

    return { sortedUnits: all, northUnits, southUnits, stats: { total: all.length, complete, inProgress, totalIssues, chillerReady }, openIssues, overallPct, sidePcts, sideDone };
  }, [units]);

  // Detail list: when not showing all, hide complete units. Order is numerical (by side, then unit number).
  const detailUnits = useMemo(
    () => showAllUnits ? sortedUnits : sortedUnits.filter((u) => !isUnitComplete(u)),
    [sortedUnits, showAllUnits],
  );

  const filteredIssues = useMemo(() => {
    let result = openIssues;
    if (sideFilter !== 'all') result = result.filter((item) => item.unit.side === sideFilter);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter((item) =>
        item.unitId.toLowerCase().includes(q) ||
        item.compLabel.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q) ||
        item.foundBy.toLowerCase().includes(q)
      );
    }
    return result;
  }, [openIssues, searchText, sideFilter]);

  const isFiltering = !!searchText || sideFilter !== 'all';

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
        <SumStat label="Total"       value={stats.total}         color="#58a6ff" />
        <SumStat label="Complete"    value={stats.complete}      color="#3fb950" />
        <SumStat label="In Progress" value={stats.inProgress}    color="#d29922" />
        <SumStat label="Open Issues" value={stats.totalIssues}   color={stats.totalIssues > 0 ? '#f85149' : '#3fb950'} />
        <SumStat label="❄ Ready"    value={stats.chillerReady}  color="#58a6ff" />
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
        <View style={s.sideSplitRow}>
          <Text style={s.sideSplitText}>N: <Text style={s.sideSplitPct}>{sidePcts.N}%</Text></Text>
          <Text style={s.sideSplitText}>S: <Text style={s.sideSplitPct}>{sidePcts.S}%</Text></Text>
        </View>
      </View>

      {/* Fleet Grid — at-a-glance status of all units */}
      <FleetGrid title="North" units={northUnits} doneCount={sideDone.N} onUnitPress={goToUnit} />
      <FleetGrid title="South" units={southUnits} doneCount={sideDone.S} onUnitPress={goToUnit} />

      {/* Issue search + side filter — only shown when there are open issues */}
      {openIssues.length > 0 && (
        <View style={s.searchBlock}>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={16} color="#6e7681" style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              value={searchText}
              onChangeText={handleSearchChange}
              placeholder="Search issues…"
              placeholderTextColor="#6e7681"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!searchText && (
              <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#6e7681" />
              </TouchableOpacity>
            )}
          </View>
          <View style={s.sideFilterRow}>
            {(['all', 'North', 'South'] as const).map((opt) => {
              const active = sideFilter === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[s.sideChip, active && s.sideChipActive]}
                  onPress={() => setSideFilter(opt)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.sideChipText, active && s.sideChipTextActive]}>
                    {opt === 'all' ? 'All' : opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Per-unit list — hidden while filtering issues */}
      {!isFiltering && (
        <View style={s.unitsHeaderRow}>
          <Text style={s.sectionLabelInline}>
            {showAllUnits ? `All Units (${sortedUnits.length})` : `In Progress (${detailUnits.length})`}
          </Text>
          <TouchableOpacity onPress={() => setShowAllUnits((v) => !v)} hitSlop={8} activeOpacity={0.7}>
            <Text style={s.toggleLink}>
              {showAllUnits ? 'Hide complete' : 'Show all units'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {!isFiltering && detailUnits.length === 0 && (
        <View style={s.emptyCard}>
          <Ionicons name="checkmark-circle" size={20} color="#3fb950" style={{ marginRight: 8 }} />
          <Text style={s.emptyText}>All units complete 🎉</Text>
        </View>
      )}
      {!isFiltering && detailUnits.length > 0 && <View style={s.listCard}>
        {detailUnits.map((unit, idx) => {
          const pct = getUnitPct(unit);
          const allIssues = getOpenIssueCount(unit);
          const color = unitColor(unit);
          return (
            <TouchableOpacity
              key={unit.id}
              style={[s.unitRow, idx < detailUnits.length - 1 && s.rowBorder]}
              onPress={() => goToUnit(unit)}
              activeOpacity={0.7}
            >
              <View style={[s.sideDot, { backgroundColor: color }]} />
              <View style={s.unitInfo}>
                <View style={s.unitTopRow}>
                  <Text style={s.unitId}>{unit.id}</Text>
                  {unit.chillerAvailable === true && (
                    <View style={s.chillerWrap}>
                      <Text style={s.chillerBadge}>❄</Text>
                    </View>
                  )}
                  {allIssues > 0 && (
                    <View style={s.issueBadge}>
                      <Text style={s.issueBadgeText}>{allIssues}</Text>
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
      </View>}

      {/* Open issues */}
      {openIssues.length > 0 && (
        <>
          <SectionLabel title={isFiltering ? `Issues (${filteredIssues.length} of ${openIssues.length})` : `Open Issues (${openIssues.length})`} />
          {filteredIssues.map((item) => (
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

function FleetGrid({
  title, units, doneCount, onUnitPress,
}: {
  title: string;
  units: Unit[];
  doneCount: number;
  onUnitPress: (u: Unit) => void;
}) {
  if (units.length === 0) return null;
  return (
    <View style={s.gridCard}>
      <View style={s.gridHeader}>
        <Text style={s.gridTitle}>{title}</Text>
        <Text style={s.gridDoneCount}>{doneCount} of {units.length} done</Text>
      </View>
      <View style={s.gridWrap}>
        {units.map((unit) => {
          const status = getUnitStatus(unit);
          const color = STATUS_COLOR[status];
          const opacity = status === 'notStarted' ? 0.55 : 1;
          return (
            <TouchableOpacity
              key={unit.id}
              style={[s.gridCell, { backgroundColor: color, opacity }]}
              onPress={() => onUnitPress(unit)}
              activeOpacity={0.7}
            >
              <Text style={s.gridCellText}>{unit.unitNumber}</Text>
              {unit.chillerAvailable === true && (
                <Text style={s.gridCellChiller}>❄</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.gridLegend}>
        <Legend color={STATUS_COLOR.complete}   text="Done" />
        <Legend color={STATUS_COLOR.inProgress} text="In Prog" />
        <Legend color={STATUS_COLOR.issues}     text="Issues" />
        <Legend color={STATUS_COLOR.notStarted} text="Not Started" dim />
      </View>
    </View>
  );
}

function Legend({ color, text, dim }: { color: string; text: string; dim?: boolean }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendSwatch, { backgroundColor: color, opacity: dim ? 0.55 : 1 }]} />
      <Text style={s.legendText}>{text}</Text>
    </View>
  );
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
  sideSplitRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sideSplitText: { color: '#6e7681', fontSize: 11, fontWeight: '600' },
  sideSplitPct: { color: '#c9d1d9', fontSize: 12, fontWeight: '700' },
  sectionLabel: {
    color: '#8b949e', fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', paddingHorizontal: 14, marginTop: 18, marginBottom: 8,
  },
  sectionLabelInline: {
    color: '#8b949e', fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase',
  },
  unitsHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, marginTop: 18, marginBottom: 8,
  },
  toggleLink: { color: '#58a6ff', fontSize: 12, fontWeight: '600' },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#161b22', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#21262d',
    paddingVertical: 22,
  },
  emptyText: { color: '#3fb950', fontSize: 14, fontWeight: '600' },

  gridCard: {
    margin: 14, marginTop: 8, marginBottom: 0, padding: 12,
    backgroundColor: '#161b22', borderRadius: 10, borderWidth: 1, borderColor: '#21262d',
  },
  gridHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  gridTitle: { color: '#e6edf3', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  gridDoneCount: { color: '#8b949e', fontSize: 11, fontWeight: '600' },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gridCell: {
    width: 32, height: 32, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  gridCellText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  gridCellChiller: {
    position: 'absolute', bottom: -1, right: 2,
    color: '#cfe1ff', fontSize: 9,
  },
  gridLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendSwatch: { width: 10, height: 10, borderRadius: 2, marginRight: 4 },
  legendText: { color: '#6e7681', fontSize: 10, fontWeight: '600' },
  listCard: { backgroundColor: '#161b22', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#21262d' },
  unitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#21262d' },
  sideDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12, flexShrink: 0 },
  unitInfo: { flex: 1, marginRight: 4 },
  unitTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  unitId: { color: '#e6edf3', fontSize: 14, fontWeight: '600', marginRight: 6 },
  chillerWrap: { width: 24, height: 20, alignItems: 'center', justifyContent: 'center', marginRight: 4, overflow: 'hidden' },
  chillerBadge: { color: '#58a6ff', fontSize: 20, lineHeight: 20 },
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
  searchBlock: { marginHorizontal: 14, marginTop: 14, marginBottom: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161b22', borderRadius: 10,
    borderWidth: 1, borderColor: '#30363d',
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 6,
  },
  searchInput: { flex: 1, color: '#e6edf3', fontSize: 14, paddingVertical: 0 },
  sideFilterRow: { flexDirection: 'row', gap: 6 },
  sideChip: {
    flex: 1, alignItems: 'center', paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#30363d',
  },
  sideChipActive: { backgroundColor: '#58a6ff22', borderColor: '#58a6ff' },
  sideChipText: { color: '#6e7681', fontSize: 12, fontWeight: '600' },
  sideChipTextActive: { color: '#58a6ff' },
});
