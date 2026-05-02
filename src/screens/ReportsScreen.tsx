import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { STAGES, COMPONENTS } from '../types';
import { exportToExcel } from '../utils/exportExcel';
import { backupData, restoreData } from '../utils/backup';
import GeneralIssueModal from '../components/GeneralIssueModal';

export default function ReportsScreen() {
  const units         = useStore((state) => state.units);
  const generalIssues = useStore((state) => state.generalIssues);
  const loadBackup    = useStore((state) => state.loadBackup);
  const mergeImport   = useStore((state) => state.mergeImport);
  const [exporting, setExporting]           = useState(false);
  const [backingUp, setBackingUp]           = useState(false);
  const [restoring, setRestoring]           = useState(false);
  const [importing, setImporting]           = useState(false);
  const [generalModalOpen, setGeneralModalOpen] = useState(false);

  const openGeneralCount = generalIssues.filter((i) => !i.resolved).length;

  const stats = useMemo(() => {
    const all = Object.values(units);
    const north = all.filter((u) => u.side === 'North');
    const south = all.filter((u) => u.side === 'South');

    const stageStats = STAGES.map((stage) => ({
      label: stage.label,
      northDone: north.filter((u) => u.stages[stage.key]).length,
      southDone: south.filter((u) => u.stages[stage.key]).length,
    }));

    // Collect all open issues (component + misc) with their unit/label context
    const issuesByUnit: { issue: { id: string; dateFound: string; foundBy: string; notes: string; resolved: boolean }; unitId: string; compLabel: string }[] = [];

    for (const u of all) {
      for (const comp of COMPONENTS) {
        const compLabel = u.customComponentLabels?.[comp.key] ?? comp.label;
        for (const issue of u.components[comp.key].issues) {
          if (!issue.resolved) issuesByUnit.push({ issue, unitId: u.id, compLabel });
        }
      }
      for (const m of (u.miscEquipment ?? [])) {
        const compLabel = m.label || 'Misc Equipment';
        for (const issue of (m.issues ?? [])) {
          if (!issue.resolved) issuesByUnit.push({ issue, unitId: u.id, compLabel });
        }
      }
    }
    issuesByUnit.sort((a, b) => b.issue.dateFound.localeCompare(a.issue.dateFound));

    const openIssueCount = issuesByUnit.length;

    const fullyComplete = all.filter((u) => {
      const hasOpen = [
        ...Object.values(u.components).flatMap((c) => c.issues),
        ...(u.miscEquipment ?? []).flatMap((m) => m.issues ?? []),
      ].some((i) => !i.resolved);
      return STAGES.every((s) => u.stages[s.key]) && !hasOpen;
    }).length;
    const hasAnyWork = all.filter((u) => STAGES.some((s) => u.stages[s.key])).length;

    const compStats = COMPONENTS.map((comp) => ({
      label: comp.label,
      good: all.filter((u) => u.components[comp.key].status === 'good').length,
      bad: all.filter((u) => u.components[comp.key].status === 'bad').length,
    }));

    return { stageStats, openIssueCount, issuesByUnit, fullyComplete, hasAnyWork, compStats, total: all.length };
  }, [units]);

  const handleExport = async () => {
    setExporting(true);
    try { await exportToExcel(units, generalIssues); }
    catch (e) { Alert.alert('Export Failed', String(e)); }
    finally { setExporting(false); }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try { await backupData(units, generalIssues); }
    catch (e) { Alert.alert('Backup Failed', String(e)); }
    finally { setBackingUp(false); }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restoreData();
      if (!restored) { setRestoring(false); return; }
      Alert.alert(
        'Restore Backup',
        'Replace ALL current data with this backup? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setRestoring(false) },
          {
            text: 'Replace All', style: 'destructive',
            onPress: () => { loadBackup(restored.units, restored.generalIssues); setRestoring(false); Alert.alert('Restored', 'Data restored successfully.'); },
          },
        ],
        { onDismiss: () => setRestoring(false) }
      );
    } catch (e) {
      Alert.alert('Restore Failed', String(e));
      setRestoring(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const data = await restoreData();
      if (!data) { setImporting(false); return; }
      Alert.alert(
        'Merge Import',
        'This will add new issues and equipment from the file into your current data without overwriting anything.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setImporting(false) },
          {
            text: 'Merge',
            onPress: () => { mergeImport(data.units, data.generalIssues); setImporting(false); Alert.alert('Imported', 'Data merged successfully.'); },
          },
        ],
        { onDismiss: () => setImporting(false) }
      );
    } catch (e) {
      Alert.alert('Import Failed', String(e));
      setImporting(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Export button */}
      <TouchableOpacity style={s.exportBtn} onPress={handleExport} disabled={exporting} activeOpacity={0.8}>
        {exporting ? <ActivityIndicator color="#0d1117" size="small" /> : <Ionicons name="download-outline" size={20} color="#0d1117" style={{ marginRight: 8 }} />}
        <Text style={s.exportBtnText}>{exporting ? 'Generating…' : 'Export to Excel'}</Text>
      </TouchableOpacity>

      {/* Backup / Restore */}
      <View style={s.backupRow}>
        <TouchableOpacity style={[s.backupBtn, backingUp && s.btnDisabled]} onPress={handleBackup} disabled={backingUp} activeOpacity={0.8}>
          {backingUp ? <ActivityIndicator color="#58a6ff" size="small" /> : <Ionicons name="cloud-upload-outline" size={17} color="#58a6ff" style={{ marginRight: 6 }} />}
          <Text style={s.backupBtnText}>{backingUp ? 'Saving…' : 'Backup Data'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.restoreBtn, restoring && s.btnDisabled]} onPress={handleRestore} disabled={restoring} activeOpacity={0.8}>
          {restoring ? <ActivityIndicator color="#d29922" size="small" /> : <Ionicons name="cloud-download-outline" size={17} color="#d29922" style={{ marginRight: 6 }} />}
          <Text style={s.restoreBtnText}>{restoring ? 'Loading…' : 'Restore Backup'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[s.importBtn, importing && s.btnDisabled]} onPress={handleImport} disabled={importing} activeOpacity={0.8}>
        {importing ? <ActivityIndicator color="#3fb950" size="small" /> : <Ionicons name="git-merge-outline" size={17} color="#3fb950" style={{ marginRight: 6 }} />}
        <Text style={s.importBtnText}>{importing ? 'Merging…' : 'Merge Import'}</Text>
      </TouchableOpacity>

      {/* General Issues */}
      <TouchableOpacity style={s.generalIssuesBtn} onPress={() => setGeneralModalOpen(true)} activeOpacity={0.8}>
        <View style={s.generalIssuesBtnLeft}>
          <Ionicons name="warning-outline" size={20} color="#d29922" style={{ marginRight: 10 }} />
          <View>
            <Text style={s.generalIssuesBtnTitle}>General Issues</Text>
            <Text style={s.generalIssuesBtnSub}>
              {openGeneralCount > 0
                ? `${openGeneralCount} open · ${generalIssues.length} total`
                : generalIssues.length > 0
                  ? `All resolved · ${generalIssues.length} total`
                  : 'No issues logged'}
            </Text>
          </View>
        </View>
        <View style={s.generalIssuesBtnRight}>
          {openGeneralCount > 0 && (
            <View style={s.openBadge}>
              <Text style={s.openBadgeText}>{openGeneralCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color="#6e7681" />
        </View>
      </TouchableOpacity>

      {generalModalOpen && <GeneralIssueModal onClose={() => setGeneralModalOpen(false)} />}

      {/* Overall progress */}
      <SectionHeader title="Overall Progress" />
      <View style={s.card}>
        <StatRow label="Total Units" value={stats.total} />
        <StatRow label="Fully Commissioned" value={`${stats.fullyComplete} / ${stats.total}`} valueColor="#3fb950" />
        <StatRow label="In Progress" value={stats.hasAnyWork - stats.fullyComplete} valueColor="#d29922" />
        <StatRow label="Not Started" value={stats.total - stats.hasAnyWork} valueColor="#6e7681" />
        <StatRow label="Open Issues" value={stats.openIssueCount} valueColor={stats.openIssueCount > 0 ? '#f85149' : '#3fb950'} last />
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
          <SectionHeader title={`Open Issues (${stats.openIssueCount})`} />
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3fb950', borderRadius: 10, paddingVertical: 14, marginBottom: 10,
  },
  exportBtnText: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
  backupRow: { flexDirection: 'row', marginBottom: 10 },
  backupBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 12, marginRight: 8,
    borderWidth: 1, borderColor: '#58a6ff',
  },
  restoreBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 12,
    borderWidth: 1, borderColor: '#d29922',
  },
  backupBtnText: { color: '#58a6ff', fontSize: 14, fontWeight: '600' },
  restoreBtnText: { color: '#d29922', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 12, marginBottom: 24,
    borderWidth: 1, borderColor: '#3fb950',
  },
  importBtnText: { color: '#3fb950', fontSize: 14, fontWeight: '600' },
  generalIssuesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d2992244',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  generalIssuesBtnLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  generalIssuesBtnRight: { flexDirection: 'row', alignItems: 'center' },
  generalIssuesBtnTitle: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },
  generalIssuesBtnSub:   { color: '#8b949e', fontSize: 12, marginTop: 1 },
  openBadge: {
    backgroundColor: '#f85149',
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 8,
  },
  openBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
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
