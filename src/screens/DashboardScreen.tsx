import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { STAGES, COMPONENTS, Unit, getReadyForMaster, normalizeStageStatus, isUnitComplete, isUnitFullyGreen } from '../types';
import CopyrightFooter from '../components/CopyrightFooter';
import { getPostCommissionHealth } from '../utils/postCommissionHealth';

type UnitStatus = 'issues' | 'completeWithIssues' | 'complete' | 'inProgress' | 'notStarted';

function getUnitPct(unit: Unit): number {
  const stagesComplete = STAGES.filter((s) => normalizeStageStatus(unit.stages[s.key]) === 'complete').length;
  const good = Object.values(unit.components).filter((c) => c.status === 'good').length;
  return Math.round((stagesComplete / STAGES.length) * 70 + (good / COMPONENTS.length) * 30);
}

function getOpenIssueCount(unit: Unit): number {
  const compIssues = Object.values(unit.components).flatMap((c) => c.issues).filter((i) => !i.resolved && !i.deleted);
  const miscIssues = (unit.miscEquipment ?? []).filter((m) => !m.deleted).flatMap((m) => m.issues ?? []).filter((i) => !i.resolved && !i.deleted);
  const readyIssues = getReadyForMaster(unit).issues.filter((i) => !i.resolved && !i.deleted);
  return compIssues.length + miscIssues.length + readyIssues.length;
}

function hasBadComponentStatus(unit: Unit): boolean {
  return Object.values(unit.components).some((c) => c.status === 'bad');
}

function hasBadMiscStatus(unit: Unit): boolean {
  return (unit.miscEquipment ?? []).filter((m) => !m.deleted).some((m) => m.status === 'bad');
}

function hasStuckStage(unit: Unit): boolean {
  return STAGES.some((s) => normalizeStageStatus(unit.stages[s.key]) === 'stuck');
}

function hasBadReadyForMaster(unit: Unit): boolean {
  // RFM bad makes the card red on its own — no logged issue required.
  return getReadyForMaster(unit).status === 'bad';
}

// A unit has "issues" if any of: open component/misc issues, bad component/misc status,
// or any commissioning stage is stuck. These all roll into the same red state.
function unitHasIssues(unit: Unit): boolean {
  return getOpenIssueCount(unit) > 0 || hasBadComponentStatus(unit) || hasBadMiscStatus(unit) || hasStuckStage(unit) || hasBadReadyForMaster(unit);
}

// Priority: complete-with-issues > issues > complete > in-progress > not-started
function getUnitStatus(unit: Unit): UnitStatus {
  if (hasBadReadyForMaster(unit)) return 'issues';
  if (isUnitFullyGreen(unit)) return 'complete';
  if (isUnitComplete(unit) && unitHasIssues(unit)) return 'completeWithIssues';
  if (unitHasIssues(unit)) return 'issues';
  if (getUnitPct(unit) > 0) return 'inProgress';
  return 'notStarted';
}

const STATUS_COLOR: Record<UnitStatus, string> = {
  issues:     '#f85149',
  completeWithIssues: '#3fb950',
  complete:   '#3fb950',
  inProgress: '#d29922',
  notStarted: '#30363d',
};

function unitColor(unit: Unit): string {
  return STATUS_COLOR[getUnitStatus(unit)];
}

export default function DashboardScreen() {
  const units = useStore((s) => s.units);
  const generalIssues = useStore((s) => s.generalIssues);
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

  const { sortedUnits, northUnits, southUnits, workingUnits, stats, openIssues, overallPct, sidePcts, sideDone } = useMemo(() => {
    const all = Object.values(units).sort((a, b) =>
      a.side !== b.side ? a.side.localeCompare(b.side) : a.unitNumber - b.unitNumber
    );

    const complete = all.filter(isUnitFullyGreen).length;
    const inProgress = all.filter((u) => { const p = getUnitPct(u); return p > 0 && !isUnitFullyGreen(u); }).length;
    const openGeneralCount = generalIssues.filter((i) => !i.resolved && !i.deleted).length;
    const totalIssues = all.reduce((n, u) => n + getOpenIssueCount(u), 0) + openGeneralCount;
    const chillerReady = all.filter((u) => u.chillerAvailable === true).length;
    const postCommissionIssues = all.filter((u) => getPostCommissionHealth(u).needsAttention).length;
    const overallPct = all.length > 0 ? Math.round(all.reduce((n, u) => n + getUnitPct(u), 0) / all.length) : 0;

    const northUnits = all.filter((u) => u.side === 'North').sort((a, b) => a.unitNumber - b.unitNumber);
    const southUnits = all.filter((u) => u.side === 'South').sort((a, b) => a.unitNumber - b.unitNumber);
    const sidePct = (arr: Unit[]) => arr.length === 0 ? 0 : Math.round(arr.reduce((n, u) => n + getUnitPct(u), 0) / arr.length);
    const sideDoneCount = (arr: Unit[]) => arr.filter(isUnitFullyGreen).length;
    const sidePcts = { N: sidePct(northUnits), S: sidePct(southUnits) };
    const sideDone = { N: sideDoneCount(northUnits), S: sideDoneCount(southUnits) };
    const workingUnits = {
      North: northUnits.filter((u) => u.workingParty === 'redGroup' || u.workingParty === 'acs'),
      South: southUnits.filter((u) => u.workingParty === 'redGroup' || u.workingParty === 'acs'),
    };

    const openIssues: { key: string; unitId: string; unit: Unit; compLabel: string; notes: string; foundBy: string; ageDays: number; componentKey?: string; miscItemId?: string }[] = [];
    for (const unit of all) {
      for (const comp of COMPONENTS) {
        const label = unit.customComponentLabels?.[comp.key] ?? comp.label;
        for (const issue of unit.components[comp.key].issues.filter((i) => !i.resolved && !i.deleted)) {
          openIssues.push({ key: issue.id, unitId: unit.id, unit, compLabel: label, notes: issue.notes, foundBy: issue.foundBy, ageDays: Math.floor((Date.now() - new Date(issue.dateFound).getTime()) / 86400000), componentKey: comp.key });
        }
      }
      for (const m of (unit.miscEquipment ?? []).filter((m) => !m.deleted)) {
        for (const issue of m.issues.filter((i) => !i.resolved && !i.deleted)) {
          openIssues.push({ key: issue.id, unitId: unit.id, unit, compLabel: m.label || 'Misc Equipment', notes: issue.notes, foundBy: issue.foundBy, ageDays: Math.floor((Date.now() - new Date(issue.dateFound).getTime()) / 86400000), miscItemId: m.id });
        }
      }
      for (const issue of getReadyForMaster(unit).issues.filter((i) => !i.resolved && !i.deleted)) {
        openIssues.push({ key: issue.id, unitId: unit.id, unit, compLabel: 'Ready for Master', notes: issue.notes, foundBy: issue.foundBy, ageDays: Math.floor((Date.now() - new Date(issue.dateFound).getTime()) / 86400000) });
      }
    }
    openIssues.sort((a, b) => b.ageDays - a.ageDays);

    return { sortedUnits: all, northUnits, southUnits, workingUnits, stats: { total: all.length, complete, inProgress, totalIssues, chillerReady, postCommissionIssues }, openIssues, overallPct, sidePcts, sideDone };
  }, [units, generalIssues]);

  // Detail list: when not showing all, hide complete units. Order is numerical (by side, then unit number).
  const detailUnits = useMemo(
    () => showAllUnits ? sortedUnits : sortedUnits.filter((u) => !isUnitFullyGreen(u)),
    [sortedUnits, showAllUnits],
  );
  const detailNorth = useMemo(() => detailUnits.filter((u) => u.side === 'North'), [detailUnits]);
  const detailSouth = useMemo(() => detailUnits.filter((u) => u.side === 'South'), [detailUnits]);

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

  const goToUnit = (unit: Unit, openComponent?: string, openMiscItem?: string) => {
    navigation.navigate(unit.side === 'North' ? 'NorthTab' : 'SouthTab', {
      screen: 'UnitDetail',
      params: { unitId: unit.id, openComponent, openMiscItem },
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
        <SumStat label="RFM Issues" value={stats.postCommissionIssues} color={stats.postCommissionIssues > 0 ? '#f85149' : '#3fb950'} />
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

      <WorkingUnitsPanel workingUnits={workingUnits} onUnitPress={goToUnit} />

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
      {!isFiltering && detailUnits.length > 0 && (
        <View style={s.twoColRow}>
          <DetailColumn title="North" units={detailNorth} onUnitPress={goToUnit} />
          <DetailColumn title="South" units={detailSouth} onUnitPress={goToUnit} />
        </View>
      )}

      {/* Open issues */}
      {openIssues.length > 0 && (
        <>
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
          <SectionLabel title={isFiltering ? `Issues (${filteredIssues.length} of ${openIssues.length})` : `Open Issues (${openIssues.length})`} />
          {filteredIssues.map((item) => (
            <TouchableOpacity key={item.key} style={s.issueCard} onPress={() => goToUnit(item.unit, item.componentKey, item.miscItemId)} activeOpacity={0.7}>
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
      <CopyrightFooter />
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
          const postCommissionHealth = getPostCommissionHealth(unit);
          return (
            <TouchableOpacity
              key={unit.id}
              style={[s.gridCell, { backgroundColor: color, opacity }]}
              onPress={() => onUnitPress(unit)}
              activeOpacity={0.7}
            >
              {status === 'completeWithIssues' && (
                <View pointerEvents="none" style={s.gridSplitBg}>
                  <View style={[s.gridSplitHalf, { backgroundColor: STATUS_COLOR.complete }]} />
                  <View style={[s.gridSplitHalf, { backgroundColor: STATUS_COLOR.issues }]} />
                </View>
              )}
              <Text style={s.gridCellText}>{unit.unitNumber}</Text>
              {postCommissionHealth.needsAttention && (
                <View style={s.gridHealthBadge}>
                  <Text style={s.gridHealthBadgeText}>!</Text>
                </View>
              )}
              {unit.chillerAvailable === true && (
                <>
                  {unit.optimoMode && <Text style={s.gridCellOptimo}>{unit.optimoMode}</Text>}
                  <View style={s.gridCellChillerWrap}>
                    <Text style={s.gridCellChiller}>❄</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.gridLegend}>
        <Legend color={STATUS_COLOR.complete}   text="Done" />
        <SplitLegend text="Done + Issues" />
        <BadgeLegend text="Ready for Master Issue" />
        <Legend color={STATUS_COLOR.inProgress} text="In Prog" />
        <Legend color={STATUS_COLOR.issues}     text="Issues" />
        <Legend color={STATUS_COLOR.notStarted} text="Not Started" dim />
      </View>
    </View>
  );
}

function SplitLegend({ text }: { text: string }) {
  return (
    <View style={s.legendItem}>
      <View style={s.legendSplitSwatch}>
        <View style={[s.legendSplitHalf, { backgroundColor: STATUS_COLOR.complete }]} />
        <View style={[s.legendSplitHalf, { backgroundColor: STATUS_COLOR.issues }]} />
      </View>
      <Text style={s.legendText}>{text}</Text>
    </View>
  );
}

function BadgeLegend({ text }: { text: string }) {
  return (
    <View style={s.legendItem}>
      <View style={s.legendBadgeSwatch}>
        <Text style={s.legendBadgeText}>!</Text>
      </View>
      <Text style={s.legendText}>{text}</Text>
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

const STAGE_SEG_COLOR: Record<string, string> = {
  complete: '#3fb950',
  inProgress: '#d29922',
  stuck: '#f85149',
  pending: '#30363d',
};

function WorkingUnitsPanel({
  workingUnits,
  onUnitPress,
}: {
  workingUnits: Record<'North' | 'South', Unit[]>;
  onUnitPress: (unit: Unit) => void;
}) {
  const total = workingUnits.North.length + workingUnits.South.length;
  return (
    <View style={s.workingCard}>
      <View style={s.workingHeaderRow}>
        <Text style={s.workingTitle}>Active Work</Text>
        <Text style={s.workingCount}>{total} active</Text>
      </View>
      {total === 0 ? (
        <Text style={s.workingEmpty}>No units currently assigned to Red Group or ACS.</Text>
      ) : (
        <View style={s.workingColumns}>
          <WorkingColumn title="North" units={workingUnits.North} onUnitPress={onUnitPress} />
          <WorkingColumn title="South" units={workingUnits.South} onUnitPress={onUnitPress} />
        </View>
      )}
    </View>
  );
}

function WorkingColumn({ title, units, onUnitPress }: { title: 'North' | 'South'; units: Unit[]; onUnitPress: (unit: Unit) => void }) {
  return (
    <View style={s.workingColumn}>
      <View style={s.workingColumnHeader}>
        <Text style={s.workingColumnTitle}>{title} ({units.length})</Text>
      </View>
      {units.length === 0 ? (
        <Text style={s.workingColumnEmpty}>None</Text>
      ) : (
        <View style={s.workingChipWrap}>
          {units.map((unit) => {
            const isRedGroup = unit.workingParty === 'redGroup';
            const color = isRedGroup ? '#f85149' : '#58a6ff';
            const prefix = isRedGroup ? 'RG' : 'ACS';
            const label = `${prefix}-${String(unit.unitNumber).padStart(2, '0')}`;
            return (
              <TouchableOpacity key={unit.id} style={[s.workingUnitChip, { borderColor: color }]} onPress={() => onUnitPress(unit)} activeOpacity={0.7}>
                <Text style={[s.workingUnitText, { color }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

function StageSegmentBar({ unit }: { unit: Unit }) {
  return (
    <View style={s.segBar}>
      {STAGES.map((stg) => {
        const status = normalizeStageStatus(unit.stages[stg.key]);
        return (
          <View
            key={stg.key}
            style={[s.segCell, { backgroundColor: STAGE_SEG_COLOR[status] ?? STAGE_SEG_COLOR.pending }]}
          />
        );
      })}
    </View>
  );
}

function CompactUnitRow({ unit, onPress, lastInColumn }: { unit: Unit; onPress: (u: Unit) => void; lastInColumn: boolean }) {
  const pct = getUnitPct(unit);
  const allIssues = getOpenIssueCount(unit);
  const color = unitColor(unit);
  const completeWithIssues = getUnitStatus(unit) === 'completeWithIssues';
  const postCommissionHealth = getPostCommissionHealth(unit);
  return (
    <TouchableOpacity
      style={[s.compactRow, !lastInColumn && s.rowBorder]}
      onPress={() => onPress(unit)}
      activeOpacity={0.7}
    >
      {completeWithIssues ? (
        <View style={s.sideSplitDotSm}>
          <View style={[s.sideSplitDotHalfSm, { backgroundColor: STATUS_COLOR.complete }]} />
          <View style={[s.sideSplitDotHalfSm, { backgroundColor: STATUS_COLOR.issues }]} />
        </View>
      ) : (
        <View style={[s.sideDotSm, { backgroundColor: color }]} />
      )}
      <Text style={[s.compactId, { color }]}>{unit.unitNumber}</Text>
      {unit.chillerAvailable === true && (
        <View style={s.compactChillerWrap}>
          <Text style={s.compactChiller}>❄</Text>
          {unit.optimoMode && <Text style={s.compactOptimoBadge}>{unit.optimoMode}</Text>}
        </View>
      )}
      <StageSegmentBar unit={unit} />
      <Text style={s.compactPct}>{pct}%</Text>
      {allIssues > 0 && (
        <View style={s.compactIssueBadge}>
          <Text style={s.compactIssueText}>{allIssues}</Text>
        </View>
      )}
      {postCommissionHealth.needsAttention && (
        <View style={s.compactHealthBadge}>
          <Text style={s.compactHealthText}>!</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function DetailColumn({ title, units, onUnitPress }: { title: string; units: Unit[]; onUnitPress: (u: Unit) => void }) {
  return (
    <View style={s.detailCol}>
      <Text style={s.detailColHeader}>{title} ({units.length})</Text>
      <View style={s.detailColCard}>
        {units.length === 0 ? (
          <View style={s.colEmpty}>
            <Ionicons name="checkmark-circle" size={14} color="#3fb950" style={{ marginRight: 4 }} />
            <Text style={s.colEmptyText}>All done</Text>
          </View>
        ) : (
          units.map((u, i) => (
            <CompactUnitRow key={u.id} unit={u} onPress={onUnitPress} lastInColumn={i === units.length - 1} />
          ))
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  content: { paddingBottom: 50 },
  summaryBar: {
    flexDirection: 'row', backgroundColor: '#161b22',
    borderBottomWidth: 1, borderBottomColor: '#21262d', paddingVertical: 8,
  },
  sumStat: { flex: 1, alignItems: 'center' },
  sumStatValue: { fontSize: 19, fontWeight: '700' },
  sumStatLabel: { color: '#8b949e', fontSize: 10, marginTop: 1 },
  overallCard: {
    marginHorizontal: 14, marginTop: 10, marginBottom: 2, backgroundColor: '#161b22',
    borderRadius: 10, borderWidth: 1, borderColor: '#21262d', padding: 10,
  },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
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
    margin: 14, marginTop: 6, marginBottom: 0, padding: 10,
    backgroundColor: '#161b22', borderRadius: 10, borderWidth: 1, borderColor: '#21262d',
  },
  gridHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  gridTitle: { color: '#e6edf3', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  gridDoneCount: { color: '#8b949e', fontSize: 11, fontWeight: '600' },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gridCell: {
    width: 32, height: 32, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
    overflow: 'hidden',
  },
  gridSplitBg: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  gridSplitHalf: { flex: 1 },
  gridCellText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  gridCellChillerWrap: {
    position: 'absolute', bottom: -1, right: 2,
    width: 14, height: 14,
  },
  gridCellChiller: {
    color: '#cfe1ff', fontSize: 9,
    lineHeight: 14, textAlign: 'center',
  },
  gridCellOptimo: {
    position: 'absolute', bottom: -1, left: 2,
    color: '#ffffff', fontSize: 9, lineHeight: 14, fontWeight: '900',
  },
  gridHealthBadge: {
    position: 'absolute', top: 1, right: 1,
    minWidth: 10, height: 10, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#f85149',
  },
  gridHealthBadgeText: { color: '#f85149', fontSize: 8, lineHeight: 9, fontWeight: '900' },
  gridLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendSwatch: { width: 10, height: 10, borderRadius: 2, marginRight: 4 },
  legendSplitSwatch: { width: 10, height: 10, borderRadius: 2, marginRight: 4, overflow: 'hidden', flexDirection: 'row' },
  legendSplitHalf: { flex: 1 },
  legendBadgeSwatch: { width: 10, height: 10, borderRadius: 5, marginRight: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f85149' },
  legendBadgeText: { color: '#f85149', fontSize: 7, lineHeight: 8, fontWeight: '900' },
  legendText: { color: '#6e7681', fontSize: 10, fontWeight: '600' },

  workingCard: {
    margin: 14, marginTop: 6, marginBottom: 0, padding: 8,
    backgroundColor: '#161b22', borderRadius: 10, borderWidth: 1, borderColor: '#21262d',
  },
  workingHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  workingTitle: { color: '#e6edf3', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  workingCount: { color: '#8b949e', fontSize: 11, fontWeight: '600' },
  workingEmpty: { color: '#6e7681', fontSize: 12, fontWeight: '600' },
  workingColumns: { flexDirection: 'row', gap: 6 },
  workingColumn: { flex: 1, minWidth: 0 },
  workingColumnHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  workingColumnTitle: { color: '#8b949e', fontSize: 10, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  workingColumnEmpty: { color: '#6e7681', fontSize: 11, fontWeight: '600', paddingVertical: 6 },
  workingChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  workingUnitChip: { borderWidth: 1, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 4, backgroundColor: '#0d1117' },
  workingUnitText: { color: '#e6edf3', fontSize: 10, fontWeight: '800' },

  twoColRow: { flexDirection: 'row', paddingHorizontal: 10, gap: 8 },
  detailCol: { flex: 1 },
  detailColHeader: {
    color: '#8b949e', fontSize: 10, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 6, paddingHorizontal: 4,
  },
  detailColCard: {
    backgroundColor: '#161b22', borderRadius: 8,
    borderWidth: 1, borderColor: '#21262d',
    overflow: 'hidden',
  },
  colEmpty: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14,
  },
  colEmptyText: { color: '#3fb950', fontSize: 11, fontWeight: '600' },
  compactRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, paddingHorizontal: 8, gap: 5,
  },
  sideDotSm: { width: 6, height: 6, borderRadius: 3 },
  sideSplitDotSm: { width: 6, height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
  sideSplitDotHalfSm: { flex: 1 },
  compactId: { fontSize: 12, fontWeight: '700', minWidth: 18 },
  compactChillerWrap: { position: 'relative', width: 14, height: 14, marginRight: -2 },
  compactChiller: { color: '#58a6ff', fontSize: 11, lineHeight: 14, textAlign: 'center' },
  compactOptimoBadge: { position: 'absolute', left: -2, bottom: -3, color: '#ffffff', fontSize: 8, fontWeight: '900' },
  segBar: { flex: 1, flexDirection: 'row', gap: 2, alignItems: 'center' },
  segCell: { flex: 1, height: 6, borderRadius: 1.5 },
  compactPct: { color: '#c9d1d9', fontSize: 11, fontWeight: '600', minWidth: 28, textAlign: 'right' },
  compactIssueBadge: { backgroundColor: '#f85149', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1 },
  compactIssueText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  compactHealthBadge: { borderRadius: 7, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: '#f85149' },
  compactHealthText: { color: '#f85149', fontSize: 8, fontWeight: '900' },
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
