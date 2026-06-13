import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { UnitStackParamList } from '../navigation';
import { useStore } from '../store/useStore';
import { Unit, STAGES, COMPONENTS, WorkingParty, WORKING_PARTY_LABELS, getReadyForMaster, normalizeStageStatus, isUnitComplete, isUnitFullyGreen } from '../types';
import CopyrightFooter from '../components/CopyrightFooter';
import { useEditMode } from '../context/EditModeContext';
import { pushToCloud } from '../utils/sync';
import { getPostCommissionHealth } from '../utils/postCommissionHealth';

type Props = NativeStackScreenProps<UnitStackParamList, 'UnitList'>;
type Filter = 'issues' | 'inProgress' | 'complete' | 'chiller';

function unitStatusColor(unit: Unit): string {
  const comps = Object.values(unit.components);
  const miscItems = (unit.miscEquipment ?? []).filter((m) => !m.deleted);
  const ready = getReadyForMaster(unit);
  const openIssues = [
    ...comps.flatMap((c) => c.issues),
    ...miscItems.flatMap((m) => m.issues ?? []),
    ...ready.issues,
  ].filter((i) => !i.resolved && !i.deleted).length;
  const hasBad = comps.some((c) => c.status === 'bad') || miscItems.some((m) => m.status === 'bad');
  const hasStuck = STAGES.some((s) => normalizeStageStatus(unit.stages[s.key]) === 'stuck');
  if (ready.status === 'bad' || hasBad || openIssues > 0 || hasStuck) return '#f85149';

  if (isUnitFullyGreen(unit)) return '#3fb950';

  const hasWork = STAGES.some((s) => normalizeStageStatus(unit.stages[s.key]) !== 'pending')
    || comps.some((c) => c.status !== 'unchecked')
    || miscItems.some((m) => m.status !== 'unchecked');
  if (hasWork) return '#d29922';
  return '#30363d';
}

function hasOpenIssues(unit: Unit): boolean {
  const compIssues = Object.values(unit.components).flatMap((c) => c.issues);
  const miscIssues = (unit.miscEquipment ?? []).flatMap((m) => m.issues ?? []);
  const readyIssues = getReadyForMaster(unit).issues;
  return [...compIssues, ...miscIssues, ...readyIssues].some((i) => !i.resolved && !i.deleted);
}

function isInProgress(unit: Unit): boolean {
  if (isUnitComplete(unit)) return false;
  return STAGES.some((s) => normalizeStageStatus(unit.stages[s.key]) !== 'pending')
    || Object.values(unit.components).some((c) => c.status !== 'unchecked')
    || (unit.miscEquipment ?? []).some((m) => m.status !== 'unchecked');
}

const WORKING_PARTY_OPTIONS: WorkingParty[] = ['redGroup', 'acs', 'na'];

const UnitCard = React.memo(function UnitCard({
  unit,
  onPress,
  isEditMode,
  onWorkingPartyChange,
}: {
  unit: Unit;
  onPress: () => void;
  isEditMode: boolean;
  onWorkingPartyChange: (unitId: string, party: WorkingParty) => void;
}) {
  const comps = Object.values(unit.components);
  const stagesComplete = STAGES.filter((s) => normalizeStageStatus(unit.stages[s.key]) === 'complete').length;
  const good = comps.filter((c) => c.status === 'good').length;
  const bad = comps.filter((c) => c.status === 'bad').length;
  const miscItems = (unit.miscEquipment ?? []).filter((m) => !m.deleted);
  const miscIssues = miscItems.flatMap((m) => m.issues ?? []);
  const ready = getReadyForMaster(unit);
  const openIssues = [...comps.flatMap((c) => c.issues), ...miscIssues, ...ready.issues].filter((i) => !i.resolved && !i.deleted).length;
  const color = unitStatusColor(unit);
  const completeWithIssues = isUnitComplete(unit) && ready.status !== 'bad' && (openIssues > 0 || bad > 0 || miscItems.some((m) => m.status === 'bad'));
  const pct = Math.round(
    (stagesComplete / STAGES.length) * 70 + (good / COMPONENTS.length) * 30
  );
  const commDateStr = normalizeStageStatus(unit.stages.commissioning) === 'complete' && unit.stagesDates?.commissioning
    ? (() => { try { return format(new Date(unit.stagesDates!.commissioning!), 'MMM d, yyyy'); } catch { return null; } })()
    : null;
  const currentWorkingParty = unit.workingParty ?? 'na';
  const postCommissionHealth = getPostCommissionHealth(unit);

  return (
    <TouchableOpacity style={[s.card, { borderColor: color }]} onPress={onPress} activeOpacity={0.75}>
      {completeWithIssues && (
        <View pointerEvents="none" style={s.completeIssueSplitBg}>
          <View style={[s.completeIssueHalf, { backgroundColor: '#3fb95022' }]} />
          <View style={[s.completeIssueHalf, { backgroundColor: '#f8514922' }]} />
        </View>
      )}
      <View style={[s.cardTop, { backgroundColor: completeWithIssues ? 'transparent' : color + '28' }]}>
        <Text style={s.unitId}>{unit.id}</Text>
        <View style={s.cardTopIcons}>
          {unit.chillerAvailable === true && (
            <View style={s.chillerWrap}>
              <Text style={s.chillerBadge}>❄</Text>
              {unit.optimoMode && <Text style={s.optimoBadge}>{unit.optimoMode}</Text>}
            </View>
          )}
          {postCommissionHealth.needsAttention && (
            <View style={s.postCommissionBadge}>
              <Text style={s.postCommissionBadgeText}>!</Text>
            </View>
          )}
          {completeWithIssues ? (
            <View style={s.splitDot}>
              <View style={[s.splitDotHalf, { backgroundColor: '#3fb950' }]} />
              <View style={[s.splitDotHalf, { backgroundColor: '#f85149' }]} />
            </View>
          ) : (
            <View style={[s.dot, { backgroundColor: color }]} />
          )}
        </View>
      </View>
      <View style={s.cardBody}>
        <View style={s.workingToggleRow}>
          {WORKING_PARTY_OPTIONS.map((party) => {
            const active = currentWorkingParty === party;
            return (
              <TouchableOpacity
                key={party}
                style={[
                  s.workingToggleChip,
                  party === 'redGroup' && s.workingToggleRed,
                  party === 'acs' && s.workingToggleAcs,
                  party === 'na' && s.workingToggleNa,
                  active && s.workingToggleActive,
                  !isEditMode && s.workingToggleDisabled,
                ]}
                disabled={!isEditMode}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                onPress={(event) => {
                  event.stopPropagation();
                  onWorkingPartyChange(unit.id, party);
                }}
                activeOpacity={0.7}
              >
                <Text style={[s.workingToggleText, active && s.workingToggleTextActive]}>
                  {party === 'redGroup' ? 'RED' : WORKING_PARTY_LABELS[party]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
        <View style={s.progressRow}>
          <View style={s.progressBarBg}>
            <View style={[s.progressBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={[s.progressPct, { color }]}>{pct}%</Text>
        </View>
        {commDateStr && (
          <View style={s.commDateRow}>
            <Text style={s.commDateText}>✓ {commDateStr}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => prev.unit === next.unit);

export default function UnitListScreen({ navigation, route }: Props) {
  const { side } = route.params;
  const units = useStore((state) => state.units);
  const setWorkingParty = useStore((state) => state.setWorkingParty);
  const { isEditMode, resetTimer } = useEditMode();
  const [activeFilters, setActiveFilters] = useState<Set<Filter>>(new Set());

  const handleWorkingPartyChange = useCallback((unitId: string, party: WorkingParty) => {
    resetTimer();
    setWorkingParty(unitId, party);
    pushToCloud().catch(() => {});
  }, [resetTimer, setWorkingParty]);

  const sideUnits = useMemo(
    () =>
      Object.values(units)
        .filter((u) => u.side === side)
        .sort((a, b) => a.unitNumber - b.unitNumber),
    [units, side]
  );

  const stats = useMemo(() => {
    const complete = sideUnits.filter(isUnitComplete).length;
    const hasIssue = sideUnits.filter(hasOpenIssues).length;
    const inProgress = sideUnits.filter(isInProgress).length;
    const openIssues = sideUnits.reduce((sum, u) => {
      const compIssues = Object.values(u.components).flatMap((c) => c.issues);
      const miscIssues = (u.miscEquipment ?? []).filter((m) => !m.deleted).flatMap((m) => m.issues ?? []);
      const readyIssues = getReadyForMaster(u).issues;
      return sum + [...compIssues, ...miscIssues, ...readyIssues].filter((i) => !i.resolved && !i.deleted).length;
    }, 0);
    const chillerReady = sideUnits.filter((u) => u.chillerAvailable === true).length;
    return { complete, hasIssue, inProgress, openIssues, chillerReady };
  }, [sideUnits]);

  const toggleFilter = useCallback((key: Filter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const filteredUnits = useMemo(() => {
    if (activeFilters.size === 0) return sideUnits;
    return sideUnits.filter((u) =>
      (activeFilters.has('issues') && hasOpenIssues(u)) ||
      (activeFilters.has('inProgress') && isInProgress(u)) ||
      (activeFilters.has('complete') && isUnitComplete(u)) ||
      (activeFilters.has('chiller') && u.chillerAvailable === true)
    );
  }, [sideUnits, activeFilters]);

  const renderItem = useCallback(({ item }: { item: Unit }) => (
    <UnitCard
      unit={item}
      onPress={() => navigation.navigate('UnitDetail', { unitId: item.id })}
      isEditMode={isEditMode}
      onWorkingPartyChange={handleWorkingPartyChange}
    />
  ), [handleWorkingPartyChange, isEditMode, navigation]);

  const FILTERS: { key: Filter; label: string; color: string; count: number }[] = [
    { key: 'issues',     label: 'Issues',      color: '#f85149', count: stats.hasIssue     },
    { key: 'inProgress', label: 'In Progress', color: '#d29922', count: stats.inProgress   },
    { key: 'complete',   label: 'Complete',    color: '#3fb950', count: stats.complete     },
    { key: 'chiller',   label: '❄ Ready',    color: '#58a6ff', count: stats.chillerReady },
  ];

  return (
    <View style={s.container}>
      <View style={s.summary}>
        <SumItem label="Total" value={sideUnits.length} color="#58a6ff" />
        <SumItem label="Complete" value={stats.complete} color="#3fb950" />
        <SumItem label="Open Issues" value={stats.openIssues} color="#f85149" />
        <SumItem label="In Progress" value={stats.inProgress} color="#d29922" />
      </View>

      {/* Filter chips */}
      <View style={s.filterRow}>
        <TouchableOpacity
          style={[s.filterChip, s.filterChipAll, activeFilters.size === 0 && { backgroundColor: '#58a6ff22', borderColor: '#58a6ff' }]}
          onPress={() => setActiveFilters(new Set())}
          activeOpacity={0.7}
        >
          <Text style={[s.filterChipText, { color: activeFilters.size === 0 ? '#58a6ff' : '#6e7681' }]}>All</Text>
          <Text style={[s.filterChipCount, { color: activeFilters.size === 0 ? '#58a6ff' : '#6e7681' }]}>{sideUnits.length}</Text>
        </TouchableOpacity>
        {FILTERS.map(({ key, label, color, count }) => {
          const active = activeFilters.has(key);
          return (
            <TouchableOpacity
              key={key}
              style={[s.filterChip, { flex: 1 }, active && { backgroundColor: color + '22', borderColor: color }]}
              onPress={() => toggleFilter(key)}
              activeOpacity={0.7}
            >
              <Text style={[s.filterChipText, { color: active ? color : '#6e7681' }]}>{label}</Text>
              <Text style={[s.filterChipCount, { color: active ? color : '#6e7681' }]}>{count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        key={isEditMode ? 'edit-mode-list' : 'view-mode-list'}
        data={filteredUnits}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <Text style={s.emptyText}>No units match this filter.</Text>
        }
        ListFooterComponent={CopyrightFooter}
        extraData={isEditMode}
        renderItem={renderItem}
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#0d1117',
    gap: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#30363d',
    gap: 4,
  },
  filterChipAll: { flex: 0.65 },
  filterChipText: { fontSize: 11, fontWeight: '600' },
  filterChipCount: { fontSize: 11, fontWeight: '700' },
  list: { padding: 8 },
  emptyText: { color: '#6e7681', textAlign: 'center', marginTop: 40, fontSize: 14 },
  card: {
    flex: 1,
    margin: 5,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
  },
  completeIssueSplitBg: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  completeIssueHalf: { flex: 1 },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  unitId: { color: '#e6edf3', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  cardTopIcons: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chillerWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginLeft: 4, position: 'relative' },
  chillerBadge: { color: '#58a6ff', fontSize: 22, lineHeight: 22 },
  optimoBadge: { position: 'absolute', left: -16, top: 4, color: '#ffffff', fontSize: 16, lineHeight: 18, fontWeight: '900' },
  postCommissionBadge: {
    width: 17, height: 17, borderRadius: 8.5,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#f85149',
  },
  postCommissionBadgeText: { color: '#f85149', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  splitDot: { width: 10, height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  splitDotHalf: { flex: 1 },
  cardBody: { padding: 10 },
  workingToggleRow: { flexDirection: 'row', gap: 6, marginBottom: 11 },
  workingToggleChip: {
    flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 7,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1117',
  },
  workingToggleRed: { borderColor: '#f85149' },
  workingToggleAcs: { borderColor: '#58a6ff' },
  workingToggleNa: { borderColor: '#30363d' },
  workingToggleActive: { backgroundColor: '#30363d' },
  workingToggleDisabled: { opacity: 0.65 },
  workingToggleText: { color: '#8b949e', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  workingToggleTextActive: { color: '#ffffff' },
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
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  commDateRow: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#3fb95033', paddingTop: 5 },
  commDateText: { color: '#3fb950', fontSize: 10, fontWeight: '600' },
  progressBarBg: { flex: 1, height: 4, backgroundColor: '#21262d', borderRadius: 2, overflow: 'hidden', marginRight: 6 },
  progressBarFill: { height: 4, borderRadius: 2 },
  progressPct: { fontSize: 10, fontWeight: '700', minWidth: 26, textAlign: 'right' },
});
