import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Unit,
  UnitsStore,
  StageKey,
  StageStatus,
  ComponentKey,
  ComponentStatus,
  Issue,
  IssueUpdate,
  GeneralIssue,
  MiscEquipItem,
  MiscIssue,
  COMPONENTS,
  normalizeStageStatus,
} from '../types';
import { createInitialUnits } from '../utils/initialData';

// Debounce AsyncStorage writes — avoids a blocking I/O call on every keystroke.
// Reads are still synchronous/immediate; only setItem is deferred.
let _persistWriteTimer: ReturnType<typeof setTimeout>;
const debouncedStorage = {
  getItem: (name: string) => AsyncStorage.getItem(name),
  setItem: (name: string, value: string) => {
    clearTimeout(_persistWriteTimer);
    _persistWriteTimer = setTimeout(() => AsyncStorage.setItem(name, value), 300);
    return Promise.resolve();
  },
  removeItem: (name: string) => AsyncStorage.removeItem(name),
};

interface StoreState {
  units: UnitsStore;
  generalIssues: GeneralIssue[];
  // Per-device UI preference: last name picked in any "Found By" field.
  // Local-only — NOT included in mergeImport / pushToCloud (different devices
  // belong to different techs and should keep their own defaults).
  lastFoundBy?: string;
  setLastFoundBy: (name: string) => void;
  /**
   * Idempotently ensure every unit has an entry for every key in COMPONENTS.
   * New units (created from initialData) already have all keys; this exists
   * to backfill units that were persisted before a new component was added
   * to the list. Safe to call repeatedly — no-op when nothing is missing.
   */
  ensureAllComponentsPresent: () => void;
  updateStage: (unitId: string, stage: StageKey, status: StageStatus) => void;
  setStageNote: (unitId: string, stage: StageKey, note: string) => void;
  updateComponentStatus: (unitId: string, component: ComponentKey, status: ComponentStatus) => void;
  setComponentProgressNote: (unitId: string, component: ComponentKey, note: string) => void;
  setComponentGoodNote: (unitId: string, component: ComponentKey, note: string) => void;
  setComponentProgressImages: (unitId: string, component: ComponentKey, images: string[]) => void;
  setComponentGoodImages: (unitId: string, component: ComponentKey, images: string[]) => void;
  addIssue: (unitId: string, issue: Issue) => void;
  updateIssue: (unitId: string, componentKey: ComponentKey, issueId: string, updates: Partial<Issue>) => void;
  deleteIssue: (unitId: string, componentKey: ComponentKey, issueId: string) => void;
  resetUnit: (unitId: string) => void;
  setCustomComponentLabel: (unitId: string, componentKey: ComponentKey, label: string) => void;
  addMiscEquip: (unitId: string, label: string, id?: string) => void;
  updateMiscEquip: (unitId: string, itemId: string, updates: { label?: string; status?: ComponentStatus; progressNote?: string; goodNote?: string; progressImages?: string[]; goodImages?: string[]; deleted?: boolean; deletedAt?: string | undefined }) => void;
  deleteMiscEquip: (unitId: string, itemId: string) => void;
  addMiscIssue: (unitId: string, itemId: string, issue: MiscIssue) => void;
  updateMiscIssue: (unitId: string, itemId: string, issueId: string, updates: Partial<MiscIssue>) => void;
  deleteMiscIssue: (unitId: string, itemId: string, issueId: string) => void;
  setStageStuckReason: (unitId: string, stage: StageKey, reason: string) => void;
  setStageDate: (unitId: string, stage: StageKey, date: string) => void;
  setComponentStatusDate: (unitId: string, component: ComponentKey, date: string) => void;
  setMiscEquipStatusDate: (unitId: string, itemId: string, date: string) => void;
  addIssueUpdate: (unitId: string, componentKey: ComponentKey, issueId: string, update: IssueUpdate) => void;
  editIssueUpdate: (unitId: string, componentKey: ComponentKey, issueId: string, updateId: string, changes: Pick<IssueUpdate, 'note' | 'updatedBy'>) => void;
  deleteIssueUpdate: (unitId: string, componentKey: ComponentKey, issueId: string, updateId: string) => void;
  addMiscIssueUpdate: (unitId: string, itemId: string, issueId: string, update: IssueUpdate) => void;
  editMiscIssueUpdate: (unitId: string, itemId: string, issueId: string, updateId: string, changes: Pick<IssueUpdate, 'note' | 'updatedBy'>) => void;
  deleteMiscIssueUpdate: (unitId: string, itemId: string, issueId: string, updateId: string) => void;
  addGeneralIssue: (issue: GeneralIssue) => void;
  updateGeneralIssue: (issueId: string, updates: Partial<GeneralIssue>) => void;
  addGeneralIssueUpdate: (issueId: string, update: IssueUpdate) => void;
  editGeneralIssueUpdate: (issueId: string, updateId: string, changes: Pick<IssueUpdate, 'note' | 'updatedBy'>) => void;
  deleteGeneralIssueUpdate: (issueId: string, updateId: string) => void;
  deleteGeneralIssue: (issueId: string) => void;
  setChillerAvailable: (unitId: string, available: boolean) => void;
  mergeImport: (importUnits: UnitsStore, importGeneralIssues: GeneralIssue[]) => void;
  mergeAdditive: (importUnits: UnitsStore, importGeneralIssues: GeneralIssue[]) => void;
  loadBackup: (units: UnitsStore, generalIssues?: GeneralIssue[]) => void;
  clearAllPhotos: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      units: createInitialUnits(),
      generalIssues: [] as GeneralIssue[],
      lastFoundBy: undefined,

      setLastFoundBy: (name) => set({ lastFoundBy: name || undefined }),

      ensureAllComponentsPresent: () =>
        set((state) => {
          let anyChanged = false;
          const newUnits: UnitsStore = {};
          for (const [uid, unit] of Object.entries(state.units)) {
            let unitChanged = false;
            const components: any = { ...unit.components };
            for (const { key } of COMPONENTS) {
              if (!components[key]) {
                components[key] = { status: 'unchecked', issues: [] };
                unitChanged = true;
              }
            }
            newUnits[uid] = unitChanged ? { ...unit, components } : unit;
            if (unitChanged) anyChanged = true;
          }
          return anyChanged ? { units: newUnits } : state;
        }),

      updateStage: (unitId, stage, status) =>
        set((state) => {
          const u = state.units[unitId];
          const dates = { ...(u.stagesDates ?? {}) };
          if (status !== 'pending') { dates[stage] = new Date().toISOString(); }
          else { delete dates[stage]; }
          return {
            units: {
              ...state.units,
              [unitId]: { ...u, stages: { ...u.stages, [stage]: status }, stagesDates: dates },
            },
          };
        }),

      setStageNote: (unitId, stage, note) =>
        set((state) => {
          const u = state.units[unitId];
          const notes = { ...(u.stagesNotes ?? {}) };
          const updatedAt = { ...(u.stagesNotesUpdatedAt ?? {}) };
          notes[stage] = note.trim();
          updatedAt[stage] = new Date().toISOString();
          return { units: { ...state.units, [unitId]: { ...u, stagesNotes: notes, stagesNotesUpdatedAt: updatedAt } } };
        }),

      updateComponentStatus: (unitId, component, status) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...state.units[unitId],
                components: {
                  ...state.units[unitId].components,
                  [component]: {
                    ...state.units[unitId].components[component],
                    status,
                    goodDate:        status === 'good'       ? now : undefined,
                    inProgressDate:  status === 'inProgress' ? now : undefined,
                    badDate:         status === 'bad'        ? now : undefined,
                  },
                },
              },
            },
          };
        }),

      setComponentProgressNote: (unitId, component, note) =>
        set((state) => ({
          units: {
            ...state.units,
            [unitId]: {
              ...state.units[unitId],
              components: {
                ...state.units[unitId].components,
                [component]: { ...state.units[unitId].components[component], progressNote: note || undefined },
              },
            },
          },
        })),

      setComponentGoodNote: (unitId, component, note) =>
        set((state) => ({
          units: {
            ...state.units,
            [unitId]: {
              ...state.units[unitId],
              components: {
                ...state.units[unitId].components,
                [component]: { ...state.units[unitId].components[component], goodNote: note || undefined },
              },
            },
          },
        })),

      setComponentProgressImages: (unitId, component, images) =>
        set((state) => ({
          units: {
            ...state.units,
            [unitId]: {
              ...state.units[unitId],
              components: {
                ...state.units[unitId].components,
                [component]: { ...state.units[unitId].components[component], progressImages: images.length ? images : undefined },
              },
            },
          },
        })),

      setComponentGoodImages: (unitId, component, images) =>
        set((state) => ({
          units: {
            ...state.units,
            [unitId]: {
              ...state.units[unitId],
              components: {
                ...state.units[unitId].components,
                [component]: { ...state.units[unitId].components[component], goodImages: images.length ? images : undefined },
              },
            },
          },
        })),

      addIssue: (unitId, issue) =>
        set((state) => {
          const comp = state.units[unitId].components[issue.componentKey];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...state.units[unitId],
                components: {
                  ...state.units[unitId].components,
                  [issue.componentKey]: {
                    ...comp,
                    issues: [...comp.issues, issue],
                  },
                },
              },
            },
          };
        }),

      updateIssue: (unitId, componentKey, issueId, updates) =>
        set((state) => {
          const comp = state.units[unitId].components[componentKey];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...state.units[unitId],
                components: {
                  ...state.units[unitId].components,
                  [componentKey]: {
                    ...comp,
                    issues: comp.issues.map((i) =>
                      i.id === issueId ? { ...i, dateUpdated: new Date().toISOString(), ...updates } : i
                    ),
                  },
                },
              },
            },
          };
        }),

      deleteIssue: (unitId, componentKey, issueId) =>
        set((state) => {
          const comp = state.units[unitId].components[componentKey];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...state.units[unitId],
                components: {
                  ...state.units[unitId].components,
                  [componentKey]: {
                    ...comp,
                    issues: comp.issues.map((i) => i.id === issueId ? { ...i, deleted: true, deletedAt: new Date().toISOString() } : i),
                  },
                },
              },
            },
          };
        }),

      resetUnit: (unitId) =>
        set((state) => {
          const existing = state.units[unitId];
          const fresh = createInitialUnits()[unitId];
          return {
            units: {
              ...state.units,
              [unitId]: { ...fresh, id: existing.id, side: existing.side, unitNumber: existing.unitNumber, miscEquipment: [] },
            },
          };
        }),

      setCustomComponentLabel: (unitId, componentKey, label) =>
        set((state) => {
          const existing = state.units[unitId].customComponentLabels ?? {};
          const trimmed = label.trim();
          const updated = { ...existing };
          if (trimmed) {
            updated[componentKey] = trimmed;
          } else {
            delete updated[componentKey];
          }
          return {
            units: {
              ...state.units,
              [unitId]: { ...state.units[unitId], customComponentLabels: updated },
            },
          };
        }),

      addMiscEquip: (unitId, label, id) =>
        set((state) => {
          const u = state.units[unitId];
          const newItem: MiscEquipItem = {
            id: id ?? `misc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label,
            status: 'unchecked',
            issues: [],
          };
          return {
            units: {
              ...state.units,
              [unitId]: { ...u, miscEquipment: [...(u.miscEquipment ?? []), newItem] },
            },
          };
        }),

      updateMiscEquip: (unitId, itemId, updates) =>
        set((state) => {
          const u = state.units[unitId];
          const extraUpdates: { goodDate?: string; inProgressDate?: string; badDate?: string } = {};
          if ('status' in updates) {
            const now = new Date().toISOString();
            extraUpdates.goodDate       = updates.status === 'good'       ? now : undefined;
            extraUpdates.inProgressDate = updates.status === 'inProgress' ? now : undefined;
            extraUpdates.badDate        = updates.status === 'bad'        ? now : undefined;
          }
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...u,
                miscEquipment: (u.miscEquipment ?? []).map((item) =>
                  item.id === itemId ? { ...item, ...updates, ...extraUpdates } : item
                ),
              },
            },
          };
        }),

      deleteMiscEquip: (unitId, itemId) =>
        set((state) => {
          const u = state.units[unitId];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...u,
                miscEquipment: (u.miscEquipment ?? []).map((item) =>
                  item.id === itemId ? { ...item, deleted: true, deletedAt: new Date().toISOString() } : item
                ),
              },
            },
          };
        }),

      addMiscIssue: (unitId, itemId, issue) =>
        set((state) => {
          const u = state.units[unitId];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...u,
                miscEquipment: (u.miscEquipment ?? []).map((item) =>
                  item.id === itemId
                    ? { ...item, issues: [...item.issues, issue] }
                    : item
                ),
              },
            },
          };
        }),

      updateMiscIssue: (unitId, itemId, issueId, updates) =>
        set((state) => {
          const u = state.units[unitId];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...u,
                miscEquipment: (u.miscEquipment ?? []).map((item) =>
                  item.id === itemId
                    ? { ...item, issues: item.issues.map((i) => i.id === issueId ? { ...i, dateUpdated: new Date().toISOString(), ...updates } : i) }
                    : item
                ),
              },
            },
          };
        }),

      deleteMiscIssue: (unitId, itemId, issueId) =>
        set((state) => {
          const u = state.units[unitId];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...u,
                miscEquipment: (u.miscEquipment ?? []).map((item) =>
                  item.id === itemId
                    ? { ...item, issues: item.issues.map((i) => i.id === issueId ? { ...i, deleted: true, deletedAt: new Date().toISOString() } : i) }
                    : item
                ),
              },
            },
          };
        }),

      setStageStuckReason: (unitId, stage, reason) =>
        set((state) => {
          const u = state.units[unitId];
          const reasons = { ...(u.stagesStuckReasons ?? {}) };
          const updatedAt = { ...(u.stagesStuckReasonsUpdatedAt ?? {}) };
          reasons[stage] = reason.trim(); // '' signals intentional clear
          updatedAt[stage] = new Date().toISOString();
          return { units: { ...state.units, [unitId]: { ...u, stagesStuckReasons: reasons, stagesStuckReasonsUpdatedAt: updatedAt } } };
        }),

      setStageDate: (unitId, stage, date) =>
        set((state) => {
          const u = state.units[unitId];
          const dates = { ...(u.stagesDates ?? {}) };
          if (date) { dates[stage] = date; } else { delete dates[stage]; }
          return { units: { ...state.units, [unitId]: { ...u, stagesDates: dates } } };
        }),

      setComponentStatusDate: (unitId, component, date) =>
        set((state) => {
          const comp = state.units[unitId].components[component];
          const s = comp.status;
          const d = date || undefined;
          const dateUpdates = s === 'good' ? { goodDate: d } : s === 'inProgress' ? { inProgressDate: d } : s === 'bad' ? { badDate: d } : {};
          return {
            units: {
              ...state.units,
              [unitId]: { ...state.units[unitId], components: { ...state.units[unitId].components, [component]: { ...comp, ...dateUpdates } } },
            },
          };
        }),

      setMiscEquipStatusDate: (unitId, itemId, date) =>
        set((state) => {
          const u = state.units[unitId];
          const d = date || undefined;
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...u,
                miscEquipment: (u.miscEquipment ?? []).map((item) => {
                  if (item.id !== itemId) return item;
                  const s = item.status;
                  const dateUpdates = s === 'good' ? { goodDate: d } : s === 'inProgress' ? { inProgressDate: d } : s === 'bad' ? { badDate: d } : {};
                  return { ...item, ...dateUpdates };
                }),
              },
            },
          };
        }),

      setChillerAvailable: (unitId, available) =>
        set((state) => ({
          units: {
            ...state.units,
            [unitId]: {
              ...state.units[unitId],
              chillerAvailable: available,
            },
          },
        })),

      addIssueUpdate: (unitId, componentKey, issueId, update) =>
        set((state) => {
          const comp = state.units[unitId].components[componentKey];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...state.units[unitId],
                components: {
                  ...state.units[unitId].components,
                  [componentKey]: {
                    ...comp,
                    issues: comp.issues.map((i) =>
                      i.id === issueId
                        ? { ...i, dateUpdated: update.date, updates: [...(i.updates ?? []), update] }
                        : i
                    ),
                  },
                },
              },
            },
          };
        }),

      editIssueUpdate: (unitId, componentKey, issueId, updateId, changes) =>
        set((state) => {
          const comp = state.units[unitId].components[componentKey];
          return {
            units: { ...state.units, [unitId]: { ...state.units[unitId], components: { ...state.units[unitId].components, [componentKey]: { ...comp, issues: comp.issues.map((i) => i.id === issueId ? { ...i, updates: (i.updates ?? []).map((u) => u.id === updateId ? { ...u, ...changes } : u) } : i) } } } },
          };
        }),

      deleteIssueUpdate: (unitId, componentKey, issueId, updateId) =>
        set((state) => {
          const comp = state.units[unitId].components[componentKey];
          return {
            units: { ...state.units, [unitId]: { ...state.units[unitId], components: { ...state.units[unitId].components, [componentKey]: { ...comp, issues: comp.issues.map((i) => i.id === issueId ? { ...i, updates: (i.updates ?? []).filter((u) => u.id !== updateId) } : i) } } } },
          };
        }),

      addMiscIssueUpdate: (unitId, itemId, issueId, update) =>
        set((state) => {
          const u = state.units[unitId];
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...u,
                miscEquipment: (u.miscEquipment ?? []).map((item) =>
                  item.id === itemId
                    ? {
                        ...item,
                        issues: item.issues.map((i) =>
                          i.id === issueId
                            ? { ...i, dateUpdated: update.date, updates: [...(i.updates ?? []), update] }
                            : i
                        ),
                      }
                    : item
                ),
              },
            },
          };
        }),

      editMiscIssueUpdate: (unitId, itemId, issueId, updateId, changes) =>
        set((state) => {
          const u = state.units[unitId];
          return {
            units: { ...state.units, [unitId]: { ...u, miscEquipment: (u.miscEquipment ?? []).map((item) => item.id === itemId ? { ...item, issues: item.issues.map((i) => i.id === issueId ? { ...i, updates: (i.updates ?? []).map((upd) => upd.id === updateId ? { ...upd, ...changes } : upd) } : i) } : item) } },
          };
        }),

      deleteMiscIssueUpdate: (unitId, itemId, issueId, updateId) =>
        set((state) => {
          const u = state.units[unitId];
          return {
            units: { ...state.units, [unitId]: { ...u, miscEquipment: (u.miscEquipment ?? []).map((item) => item.id === itemId ? { ...item, issues: item.issues.map((i) => i.id === issueId ? { ...i, updates: (i.updates ?? []).filter((upd) => upd.id !== updateId) } : i) } : item) } },
          };
        }),

      addGeneralIssue: (issue) =>
        set((state) => ({ generalIssues: [...state.generalIssues, issue] })),

      updateGeneralIssue: (issueId, updates) =>
        set((state) => ({
          generalIssues: state.generalIssues.map((i) =>
            i.id === issueId ? { ...i, dateUpdated: new Date().toISOString(), ...updates } : i
          ),
        })),

      addGeneralIssueUpdate: (issueId, update) =>
        set((state) => ({
          generalIssues: state.generalIssues.map((i) =>
            i.id === issueId
              ? { ...i, dateUpdated: update.date, updates: [...(i.updates ?? []), update] }
              : i
          ),
        })),

      editGeneralIssueUpdate: (issueId, updateId, changes) =>
        set((state) => ({
          generalIssues: state.generalIssues.map((i) =>
            i.id === issueId
              ? { ...i, updates: (i.updates ?? []).map((u) => u.id === updateId ? { ...u, ...changes } : u) }
              : i
          ),
        })),

      deleteGeneralIssueUpdate: (issueId, updateId) =>
        set((state) => ({
          generalIssues: state.generalIssues.map((i) =>
            i.id === issueId
              ? { ...i, updates: (i.updates ?? []).filter((u) => u.id !== updateId) }
              : i
          ),
        })),

      deleteGeneralIssue: (issueId) =>
        set((state) => ({
          generalIssues: state.generalIssues.map((i) => i.id === issueId ? { ...i, deleted: true, deletedAt: new Date().toISOString() } : i),
        })),

      mergeImport: (importUnits, importGeneralIssues) =>
        set((state) => {
          const merged = { ...state.units };

          // Merge two image URL arrays.
          // If local side (a) has pending local file paths, preserve them — don't let stale remote
          // https:// URLs overwrite them (can happen when a prior sync failed mid-upload).
          // Only combine https:// URLs from both sides when local is already fully uploaded.
          const mergeIssueUpdates = (a: any[] | undefined, b: any[] | undefined): any[] | undefined => {
            if (!a?.length && !b?.length) return undefined;
            const map = new Map<string, any>();
            for (const u of (a ?? [])) map.set(u.id, u);
            for (const u of (b ?? [])) map.set(u.id, u);
            const result = [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
            return result.length ? result : undefined;
          };

          const mergeImages = (a: string[] = [], b: string[] = []): string[] | undefined => {
            const aLocal = a.filter(u => !u.startsWith('https://'));
            const aRemote = a.filter(u => u.startsWith('https://'));
            if (aLocal.length > 0) {
              // Local has pending uploads — keep them; skip remote (may be stale)
              const result = [...aLocal, ...aRemote];
              return result.length ? result : undefined;
            }
            // Both sides are remote https:// — union them
            const all = [...new Set([...aRemote, ...b.filter(u => u.startsWith('https://'))])];
            return all.length ? all : undefined;
          };

          // Resolve deleted state by comparing each side's deletion timestamp against
          // the freshest live activity for the entity. Live activity newer than the
          // most recent deletion resurrects the entity; otherwise the latest tombstone
          // wins. Legacy rows without `deletedAt` are treated as epoch (any live
          // dateUpdated will resurrect them) so existing stuck tombstones recover on
          // first merge after deploy.
          const resolveDeletion = (
            local: { deleted?: boolean; deletedAt?: string },
            imp: { deleted?: boolean; deletedAt?: string },
            liveActivityAt: string | undefined,
          ): { deleted?: true; deletedAt?: string } => {
            const localDel = local.deleted ? (local.deletedAt ?? '0') : null;
            const impDel = imp.deleted ? (imp.deletedAt ?? '0') : null;
            if (!localDel && !impDel) return {};
            const latestDel = (localDel && impDel)
              ? (localDel > impDel ? localDel : impDel)
              : (localDel || impDel)!;
            if (liveActivityAt && liveActivityAt > latestDel) return {};
            return latestDel === '0'
              ? { deleted: true }
              : { deleted: true, deletedAt: latestDel };
          };

          for (const [uid, importUnit] of Object.entries(importUnits)) {
            if (!merged[uid]) { merged[uid] = importUnit as any; continue; }

            const existing = merged[uid];
            const imp = importUnit as any;

            // Merge stages — remote wins so unchecking propagates
            const mergedStages = { ...existing.stages };
            for (const key of Object.keys(existing.stages) as StageKey[]) {
              const raw = imp.stages?.[key] ?? existing.stages[key];
              mergedStages[key] = normalizeStageStatus(raw);
            }

            // Merge components — issues, status, notes, images
            const mergedComponents = { ...existing.components };
            for (const comp of (Object.keys(existing.components) as ComponentKey[])) {
              const existComp = existing.components[comp];
              const impComp = imp.components?.[comp] ?? {};

              const impIssueMap = new Map<string, any>((impComp.issues ?? []).map((i: any) => [i.id, i]));
              const mergedIssues = existComp.issues.map((existIssue: any) => {
                const impIssue = impIssueMap.get(existIssue.id);
                if (!impIssue) return existIssue;
                const { deleted: _d, deletedAt: _dA, images: _i, updates: _u, ...rest } = { ...existIssue, ...impIssue };
                const dateUpdated = (existIssue.dateUpdated && impIssue.dateUpdated)
                  ? (existIssue.dateUpdated > impIssue.dateUpdated ? existIssue.dateUpdated : impIssue.dateUpdated)
                  : (existIssue.dateUpdated ?? impIssue.dateUpdated);
                const delResult = resolveDeletion(existIssue, impIssue, dateUpdated);
                const mergedUpdates = mergeIssueUpdates(existIssue.updates, impIssue.updates);
                return { ...rest, images: mergeImages(existIssue.images, impIssue.images) ?? [], ...delResult, ...(dateUpdated ? { dateUpdated } : {}), ...(mergedUpdates ? { updates: mergedUpdates } : {}) };
              });
              const existIds = new Set(existComp.issues.map((i: any) => i.id));
              const newIssues = (impComp.issues ?? []).filter((i: any) => !existIds.has(i.id));

              const mergedStatus = impComp.status ?? existComp.status;
              mergedComponents[comp] = {
                status: mergedStatus,
                issues: [...mergedIssues, ...newIssues],
                progressNote: 'progressNote' in impComp ? impComp.progressNote : existComp.progressNote,
                goodNote: 'goodNote' in impComp ? impComp.goodNote : existComp.goodNote,
                goodDate:       mergedStatus === 'good'       ? (impComp.goodDate       ?? existComp.goodDate)       : undefined,
                inProgressDate: mergedStatus === 'inProgress' ? (impComp.inProgressDate ?? existComp.inProgressDate) : undefined,
                badDate:        mergedStatus === 'bad'        ? (impComp.badDate        ?? existComp.badDate)        : undefined,
                progressImages: mergeImages(existComp.progressImages, impComp.progressImages),
                goodImages: mergeImages(existComp.goodImages, impComp.goodImages),
              };
            }

            // Merge misc equipment — match by ID first, then label (case-insensitive)
            const existingMisc = [...(existing.miscEquipment ?? [])];
            for (const importItem of (imp.miscEquipment ?? [])) {
              let idx = existingMisc.findIndex((m) => m.id && importItem.id && m.id === importItem.id);
              if (idx === -1) idx = existingMisc.findIndex((m) => m.label.toLowerCase() === importItem.label.toLowerCase());
              if (idx === -1) {
                existingMisc.push(importItem);
              } else {
                const impMiscIssueMap = new Map<string, any>(importItem.issues.map((i: any) => [i.id, i]));
                const mergedMiscIssues = existingMisc[idx].issues.map((existIssue: any) => {
                  const impIssue = impMiscIssueMap.get(existIssue.id);
                  if (!impIssue) return existIssue;
                  const { deleted: _d, deletedAt: _dA, images: _i, updates: _u, ...rest } = { ...existIssue, ...impIssue };
                  const dateUpdated = (existIssue.dateUpdated && impIssue.dateUpdated)
                    ? (existIssue.dateUpdated > impIssue.dateUpdated ? existIssue.dateUpdated : impIssue.dateUpdated)
                    : (existIssue.dateUpdated ?? impIssue.dateUpdated);
                  const delResult = resolveDeletion(existIssue, impIssue, dateUpdated);
                  const mergedUpdates = mergeIssueUpdates(existIssue.updates, impIssue.updates);
                  return { ...rest, images: mergeImages(existIssue.images, impIssue.images) ?? [], ...delResult, ...(dateUpdated ? { dateUpdated } : {}), ...(mergedUpdates ? { updates: mergedUpdates } : {}) };
                });
                const existIds = new Set(existingMisc[idx].issues.map((i) => i.id));
                const newIssues = importItem.issues.filter((i: any) => !existIds.has(i.id));
                // Resurrection: compare the latest deletion timestamp against the freshest
                // dateUpdated of any live child issue. If a live child was touched after the
                // tombstone, the deletion is stale and the parent comes back. Otherwise the
                // tombstone wins. Solves the race the previous "live wins" heuristic had with
                // delete-then-immediate-sync.
                const liveActivityAt = [...mergedMiscIssues, ...newIssues]
                  .filter((i: any) => !i.deleted)
                  .map((i: any) => i.dateUpdated)
                  .filter((d: string | undefined): d is string => !!d)
                  .sort()
                  .pop();
                const miscDelResult = resolveDeletion(existingMisc[idx], importItem, liveActivityAt);
                const mergedMiscStatus = importItem.status ?? existingMisc[idx].status;
                // Strip deleted/deletedAt from the spread so resolveDeletion's outcome wins:
                // if it returned {} (resurrected), neither field is set on the merged item.
                const { deleted: _md, deletedAt: _mdA, ...miscRest } = existingMisc[idx];
                existingMisc[idx] = {
                  ...miscRest,
                  ...miscDelResult,
                  status: mergedMiscStatus,
                  issues: [...mergedMiscIssues, ...newIssues],
                  progressNote: 'progressNote' in importItem ? importItem.progressNote : existingMisc[idx].progressNote,
                  goodNote: 'goodNote' in importItem ? importItem.goodNote : existingMisc[idx].goodNote,
                  goodDate:       mergedMiscStatus === 'good'       ? (importItem.goodDate       ?? existingMisc[idx].goodDate)       : undefined,
                  inProgressDate: mergedMiscStatus === 'inProgress' ? (importItem.inProgressDate ?? existingMisc[idx].inProgressDate) : undefined,
                  badDate:        mergedMiscStatus === 'bad'        ? (importItem.badDate        ?? existingMisc[idx].badDate)        : undefined,
                  progressImages: mergeImages(existingMisc[idx].progressImages, importItem.progressImages),
                  goodImages: mergeImages(existingMisc[idx].goodImages, importItem.goodImages),
                };
              }
            }

            // Merge custom labels — remote wins
            const mergedLabels = { ...(existing.customComponentLabels ?? {}), ...(imp.customComponentLabels ?? {}) };

            // Merge stage notes — timestamp-based CRDT: newer write wins.
            // '' in stagesNotes means explicitly cleared. stagesNotesUpdatedAt tracks when.
            const mergedStagesNotes: Partial<Record<StageKey, string>> = { ...(existing.stagesNotes ?? {}) };
            const mergedStagesNotesUpdatedAt: Partial<Record<StageKey, string>> = { ...(existing.stagesNotesUpdatedAt ?? {}) };
            for (const key of Object.keys(existing.stages) as StageKey[]) {
              const hasRemoteNote = key in (imp.stagesNotes ?? {});
              const hasRemoteAt = key in (imp.stagesNotesUpdatedAt ?? {});
              if (!hasRemoteNote && !hasRemoteAt) continue;
              const localAt = existing.stagesNotesUpdatedAt?.[key];
              const remoteAt = imp.stagesNotesUpdatedAt?.[key];
              // If both sides have timestamps, newer wins
              // If only remote has a timestamp, remote wins (it's a newer-format record)
              // If neither has a timestamp, fall back to '' guard (legacy records)
              const remoteIsNewer = remoteAt && (!localAt || remoteAt > localAt);
              const noTimestamps = !localAt && !remoteAt;
              if (remoteIsNewer || (noTimestamps && hasRemoteNote)) {
                const remoteNote = imp.stagesNotes?.[key];
                if (remoteNote) {
                  mergedStagesNotes[key] = remoteNote;
                } else {
                  // Remote cleared ('' or absent with timestamp) — honor the clear
                  delete mergedStagesNotes[key];
                }
                if (remoteAt) mergedStagesNotesUpdatedAt[key] = remoteAt;
              }
              // else local is newer or same — keep existing local value
            }

            // Merge stage dates — remote wins
            const mergedStagesDates: Partial<Record<StageKey, string>> = { ...(existing.stagesDates ?? {}), ...(imp.stagesDates ?? {}) };

            // Merge stuck reasons — timestamp-based CRDT (mirrors stagesNotes logic)
            const mergedStagesStuckReasons: Partial<Record<StageKey, string>> = { ...(existing.stagesStuckReasons ?? {}) };
            const mergedStagesStuckReasonsUpdatedAt: Partial<Record<StageKey, string>> = { ...(existing.stagesStuckReasonsUpdatedAt ?? {}) };
            for (const key of Object.keys(existing.stages) as StageKey[]) {
              const hasRemote = key in (imp.stagesStuckReasons ?? {}) || key in (imp.stagesStuckReasonsUpdatedAt ?? {});
              if (!hasRemote) continue;
              const localAt = existing.stagesStuckReasonsUpdatedAt?.[key];
              const remoteAt = imp.stagesStuckReasonsUpdatedAt?.[key];
              const remoteIsNewer = remoteAt && (!localAt || remoteAt > localAt);
              const noTimestamps = !localAt && !remoteAt;
              if (remoteIsNewer || (noTimestamps && key in (imp.stagesStuckReasons ?? {}))) {
                const remoteVal = imp.stagesStuckReasons?.[key];
                if (remoteVal) { mergedStagesStuckReasons[key] = remoteVal; }
                else { delete mergedStagesStuckReasons[key]; }
                if (remoteAt) mergedStagesStuckReasonsUpdatedAt[key] = remoteAt;
              }
            }

            merged[uid] = {
              ...existing,
              stages: mergedStages,
              stagesDates: Object.keys(mergedStagesDates).length ? mergedStagesDates : undefined,
              stagesNotes: Object.keys(mergedStagesNotes).length ? mergedStagesNotes : undefined,
              stagesNotesUpdatedAt: Object.keys(mergedStagesNotesUpdatedAt).length ? mergedStagesNotesUpdatedAt : undefined,
              stagesStuckReasons: Object.keys(mergedStagesStuckReasons).length ? mergedStagesStuckReasons : undefined,
              stagesStuckReasonsUpdatedAt: Object.keys(mergedStagesStuckReasonsUpdatedAt).length ? mergedStagesStuckReasonsUpdatedAt : undefined,
              components: mergedComponents,
              miscEquipment: existingMisc,
              customComponentLabels: Object.keys(mergedLabels).length ? mergedLabels : undefined,
              ...('chillerAvailable' in imp && { chillerAvailable: imp.chillerAvailable }),
            };
          }

          // Merge general issues — resolve deleted via timestamps, add new ones
          const importGeneralMap = new Map(importGeneralIssues.map((i) => [i.id, i]));
          const mergedGeneral = state.generalIssues.map((i) => {
            const imp = importGeneralMap.get(i.id);
            if (!imp) return i;
            const dateUpdated = (i.dateUpdated && imp.dateUpdated)
              ? (i.dateUpdated > imp.dateUpdated ? i.dateUpdated : imp.dateUpdated)
              : (i.dateUpdated ?? imp.dateUpdated);
            const delResult = resolveDeletion(i, imp, dateUpdated);
            const { deleted: _gd, deletedAt: _gdA, updates: _gu, ...impRest } = imp as any;
            const { deleted: _ld, deletedAt: _ldA, updates: _lu, ...localRest } = i as any;
            const mergedUpdates = mergeIssueUpdates(i.updates, imp.updates);
            return { ...localRest, ...impRest, ...delResult, ...(dateUpdated ? { dateUpdated } : {}), ...(mergedUpdates ? { updates: mergedUpdates } : {}) };
          });
          const existGeneralIds = new Set(state.generalIssues.map((i) => i.id));
          const newGeneral = importGeneralIssues.filter((i) => !existGeneralIds.has(i.id));

          return { units: merged, generalIssues: [...mergedGeneral, ...newGeneral] };
        }),

      // Used by web auto-push (pushToCloud): pull in items the cloud has that
      // local doesn't (new APK issues, misc items, photos) without overwriting
      // any field local already has. Local is treated as authoritative for
      // status, notes, dates, and deletion state because the user just made
      // those changes — using mergeImport here would clobber them with stale
      // cloud values from before the user's edit.
      mergeAdditive: (importUnits, importGeneralIssues) =>
        set((state) => {
          const merged: UnitsStore = { ...state.units };

          const unionPhotos = (a: string[] | undefined, b: string[] | undefined): string[] | undefined => {
            const all = [...new Set([...(a ?? []), ...(b ?? [])])].filter(Boolean);
            return all.length ? all : undefined;
          };

          for (const [uid, importUnit] of Object.entries(importUnits)) {
            if (!merged[uid]) { merged[uid] = importUnit as any; continue; }
            const existing = merged[uid];
            const imp = importUnit as any;

            // Components: add missing issues + union photos. Never touch status, notes, dates.
            const mergedComponents = { ...existing.components };
            for (const comp of (Object.keys(existing.components) as ComponentKey[])) {
              const existComp = existing.components[comp];
              const impComp = imp.components?.[comp];
              if (!impComp) continue;
              const existIds = new Set(existComp.issues.map((i) => i.id));
              const newIssues = (impComp.issues ?? []).filter((i: any) => !existIds.has(i.id));
              mergedComponents[comp] = {
                ...existComp,
                issues: newIssues.length ? [...existComp.issues, ...newIssues] : existComp.issues,
                progressImages: unionPhotos(existComp.progressImages, impComp.progressImages),
                goodImages: unionPhotos(existComp.goodImages, impComp.goodImages),
              };
            }

            // Misc equipment: add missing items + missing issues + union photos.
            const existingMisc = [...(existing.miscEquipment ?? [])];
            for (const importItem of (imp.miscEquipment ?? [])) {
              let idx = existingMisc.findIndex((m) => m.id && importItem.id && m.id === importItem.id);
              if (idx === -1) idx = existingMisc.findIndex((m) => m.label.toLowerCase() === importItem.label.toLowerCase());
              if (idx === -1) {
                existingMisc.push(importItem);
              } else {
                const existIds = new Set(existingMisc[idx].issues.map((i) => i.id));
                const newIssues = importItem.issues.filter((i: any) => !existIds.has(i.id));
                existingMisc[idx] = {
                  ...existingMisc[idx],
                  issues: newIssues.length ? [...existingMisc[idx].issues, ...newIssues] : existingMisc[idx].issues,
                  progressImages: unionPhotos(existingMisc[idx].progressImages, importItem.progressImages),
                  goodImages: unionPhotos(existingMisc[idx].goodImages, importItem.goodImages),
                };
              }
            }

            merged[uid] = { ...existing, components: mergedComponents, miscEquipment: existingMisc };
          }

          // General issues: add missing only.
          const existGeneralIds = new Set(state.generalIssues.map((i) => i.id));
          const newGeneral = importGeneralIssues.filter((i) => !existGeneralIds.has(i.id));
          const mergedGeneral = newGeneral.length
            ? [...state.generalIssues, ...newGeneral]
            : state.generalIssues;

          return { units: merged, generalIssues: mergedGeneral };
        }),

      clearAllPhotos: () =>
        set((state) => {
          const units = JSON.parse(JSON.stringify(state.units));
          for (const unit of Object.values(units) as any[]) {
            for (const comp of Object.values(unit.components) as any[]) {
              comp.progressImages = undefined;
              comp.goodImages = undefined;
              for (const issue of (comp.issues ?? [])) issue.images = undefined;
            }
            for (const item of (unit.miscEquipment ?? []) as any[]) {
              item.progressImages = undefined;
              item.goodImages = undefined;
              for (const issue of (item.issues ?? [])) issue.images = undefined;
            }
          }
          return { units };
        }),

      loadBackup: (units, generalIssues = []) => set({ units, generalIssues }),
    }),
    {
      name: 'unit-tracker-v1',
      storage: createJSONStorage(() => debouncedStorage),
      // Synchronously backfill missing component keys during hydration, BEFORE
      // any React component reads the store. Without this, units persisted
      // under an older COMPONENTS list crash any consumer that does
      // `unit.components[newKey].issues` (e.g. Dashboard's useMemo).
      // The default zustand merge is shallow `{...current, ...persisted}`;
      // we do the same then patch up units.
      merge: (persisted: any, current: StoreState): StoreState => {
        const merged = { ...current, ...(persisted ?? {}) } as StoreState;
        if (merged.units && typeof merged.units === 'object') {
          const fixedUnits: UnitsStore = {};
          for (const [uid, u] of Object.entries(merged.units)) {
            const unit = u as Unit;
            if (!unit?.components) { fixedUnits[uid] = unit; continue; }
            const components: any = { ...unit.components };
            for (const { key } of COMPONENTS) {
              if (!components[key]) {
                components[key] = { status: 'unchecked', issues: [] };
              }
            }
            fixedUnits[uid] = { ...unit, components };
          }
          merged.units = fixedUnits;
        }
        return merged;
      },
      // On web, strip image arrays before writing to localStorage to avoid
      // QuotaExceededError. Images are always retrievable from Supabase on
      // next sync; stripping them here only affects what's cached between
      // page loads, not the in-memory store for the current session.
      ...(typeof document !== 'undefined' && {
        partialize: (state: StoreState) => ({
          ...state,
          units: Object.fromEntries(
            Object.entries(state.units).map(([uid, unit]) => [
              uid,
              {
                ...unit,
                components: Object.fromEntries(
                  Object.entries(unit.components).map(([ck, comp]) => [
                    ck,
                    {
                      ...comp,
                      progressImages: undefined,
                      goodImages: undefined,
                      issues: comp.issues.map((iss) => ({ ...iss, images: undefined })),
                    },
                  ])
                ),
                miscEquipment: (unit.miscEquipment ?? []).map((item) => ({
                  ...item,
                  progressImages: undefined,
                  goodImages: undefined,
                  issues: item.issues.map((iss) => ({ ...iss, images: undefined })),
                })),
              },
            ])
          ),
        }),
      }),
    }
  )
);
