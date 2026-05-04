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
  GeneralIssue,
  MiscEquipItem,
  MiscIssue,
  normalizeStageStatus,
} from '../types';
import { createInitialUnits } from '../utils/initialData';

interface StoreState {
  units: UnitsStore;
  generalIssues: GeneralIssue[];
  updateStage: (unitId: string, stage: StageKey, status: StageStatus) => void;
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
  addMiscEquip: (unitId: string) => void;
  updateMiscEquip: (unitId: string, itemId: string, updates: { label?: string; status?: ComponentStatus; progressNote?: string; goodNote?: string; progressImages?: string[]; goodImages?: string[] }) => void;
  deleteMiscEquip: (unitId: string, itemId: string) => void;
  addMiscIssue: (unitId: string, itemId: string, issue: MiscIssue) => void;
  updateMiscIssue: (unitId: string, itemId: string, issueId: string, updates: Partial<MiscIssue>) => void;
  deleteMiscIssue: (unitId: string, itemId: string, issueId: string) => void;
  addGeneralIssue: (issue: GeneralIssue) => void;
  updateGeneralIssue: (issueId: string, updates: Partial<GeneralIssue>) => void;
  deleteGeneralIssue: (issueId: string) => void;
  mergeImport: (importUnits: UnitsStore, importGeneralIssues: GeneralIssue[]) => void;
  loadBackup: (units: UnitsStore, generalIssues?: GeneralIssue[]) => void;
  clearAllPhotos: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      units: createInitialUnits(),
      generalIssues: [] as GeneralIssue[],

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
                      i.id === issueId ? { ...i, ...updates } : i
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
                    issues: comp.issues.map((i) => i.id === issueId ? { ...i, deleted: true } : i),
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

      addMiscEquip: (unitId) =>
        set((state) => {
          const u = state.units[unitId];
          const newItem: MiscEquipItem = {
            id: `misc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label: '',
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
                  item.id === itemId ? { ...item, deleted: true } : item
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
                    ? { ...item, issues: item.issues.map((i) => i.id === issueId ? { ...i, ...updates } : i) }
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
                    ? { ...item, issues: item.issues.map((i) => i.id === issueId ? { ...i, deleted: true } : i) }
                    : item
                ),
              },
            },
          };
        }),

      addGeneralIssue: (issue) =>
        set((state) => ({ generalIssues: [...state.generalIssues, issue] })),

      updateGeneralIssue: (issueId, updates) =>
        set((state) => ({
          generalIssues: state.generalIssues.map((i) =>
            i.id === issueId ? { ...i, ...updates } : i
          ),
        })),

      deleteGeneralIssue: (issueId) =>
        set((state) => ({
          generalIssues: state.generalIssues.map((i) => i.id === issueId ? { ...i, deleted: true } : i),
        })),

      mergeImport: (importUnits, importGeneralIssues) =>
        set((state) => {
          const merged = { ...state.units };

          // Merge two image URL arrays.
          // If local side (a) has pending local file paths, preserve them — don't let stale remote
          // https:// URLs overwrite them (can happen when a prior sync failed mid-upload).
          // Only combine https:// URLs from both sides when local is already fully uploaded.
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
                const deleted = existIssue.deleted || impIssue.deleted;
                const { deleted: _d, images: _i, ...rest } = { ...existIssue, ...impIssue };
                return { ...rest, images: mergeImages(existIssue.images, impIssue.images) ?? [], ...(deleted ? { deleted: true } : {}) };
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
                  const deleted = existIssue.deleted || impIssue.deleted;
                  const { deleted: _d, images: _i, ...rest } = { ...existIssue, ...impIssue };
                  return { ...rest, images: mergeImages(existIssue.images, impIssue.images) ?? [], ...(deleted ? { deleted: true } : {}) };
                });
                const existIds = new Set(existingMisc[idx].issues.map((i) => i.id));
                const newIssues = importItem.issues.filter((i: any) => !existIds.has(i.id));
                const miscDeleted = existingMisc[idx].deleted || importItem.deleted || undefined;
                const mergedMiscStatus = importItem.status ?? existingMisc[idx].status;
                existingMisc[idx] = {
                  ...existingMisc[idx],
                  ...(miscDeleted ? { deleted: miscDeleted } : {}),
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

            merged[uid] = {
              ...existing,
              stages: mergedStages,
              components: mergedComponents,
              miscEquipment: existingMisc,
              customComponentLabels: Object.keys(mergedLabels).length ? mergedLabels : undefined,
            };
          }

          // Merge general issues — propagate deleted flag, add new ones
          const importGeneralMap = new Map(importGeneralIssues.map((i) => [i.id, i]));
          const mergedGeneral = state.generalIssues.map((i) => {
            const imp = importGeneralMap.get(i.id);
            if (!imp) return i;
            const deleted = i.deleted || imp.deleted || undefined;
            return { ...i, ...(deleted ? { deleted } : {}) };
          });
          const existGeneralIds = new Set(state.generalIssues.map((i) => i.id));
          const newGeneral = importGeneralIssues.filter((i) => !existGeneralIds.has(i.id));

          return { units: merged, generalIssues: [...mergedGeneral, ...newGeneral] };
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
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
