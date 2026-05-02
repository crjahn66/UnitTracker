import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Unit,
  UnitsStore,
  StageKey,
  ComponentKey,
  ComponentStatus,
  Issue,
  GeneralIssue,
  MiscEquipItem,
  MiscIssue,
} from '../types';
import { createInitialUnits } from '../utils/initialData';

interface StoreState {
  units: UnitsStore;
  generalIssues: GeneralIssue[];
  updateStage: (unitId: string, stage: StageKey, value: boolean) => void;
  updateComponentStatus: (unitId: string, component: ComponentKey, status: ComponentStatus) => void;
  addIssue: (unitId: string, issue: Issue) => void;
  updateIssue: (unitId: string, componentKey: ComponentKey, issueId: string, updates: Partial<Issue>) => void;
  deleteIssue: (unitId: string, componentKey: ComponentKey, issueId: string) => void;
  resetUnit: (unitId: string) => void;
  setCustomComponentLabel: (unitId: string, componentKey: ComponentKey, label: string) => void;
  addMiscEquip: (unitId: string) => void;
  updateMiscEquip: (unitId: string, itemId: string, updates: { label?: string; status?: ComponentStatus }) => void;
  deleteMiscEquip: (unitId: string, itemId: string) => void;
  addMiscIssue: (unitId: string, itemId: string, issue: MiscIssue) => void;
  updateMiscIssue: (unitId: string, itemId: string, issueId: string, updates: Partial<MiscIssue>) => void;
  deleteMiscIssue: (unitId: string, itemId: string, issueId: string) => void;
  addGeneralIssue: (issue: GeneralIssue) => void;
  updateGeneralIssue: (issueId: string, updates: Partial<GeneralIssue>) => void;
  deleteGeneralIssue: (issueId: string) => void;
  mergeImport: (importUnits: UnitsStore, importGeneralIssues: GeneralIssue[]) => void;
  loadBackup: (units: UnitsStore, generalIssues?: GeneralIssue[]) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      units: createInitialUnits(),
      generalIssues: [] as GeneralIssue[],

      updateStage: (unitId, stage, value) =>
        set((state) => ({
          units: {
            ...state.units,
            [unitId]: {
              ...state.units[unitId],
              stages: { ...state.units[unitId].stages, [stage]: value },
            },
          },
        })),

      updateComponentStatus: (unitId, component, status) =>
        set((state) => ({
          units: {
            ...state.units,
            [unitId]: {
              ...state.units[unitId],
              components: {
                ...state.units[unitId].components,
                [component]: {
                  ...state.units[unitId].components[component],
                  status,
                },
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
                    issues: comp.issues.filter((i) => i.id !== issueId),
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
          return {
            units: {
              ...state.units,
              [unitId]: {
                ...u,
                miscEquipment: (u.miscEquipment ?? []).map((item) =>
                  item.id === itemId ? { ...item, ...updates } : item
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
                miscEquipment: (u.miscEquipment ?? []).filter((item) => item.id !== itemId),
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
                    ? { ...item, issues: item.issues.filter((i) => i.id !== issueId) }
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
          generalIssues: state.generalIssues.filter((i) => i.id !== issueId),
        })),

      mergeImport: (importUnits, importGeneralIssues) =>
        set((state) => {
          const merged = { ...state.units };

          for (const [uid, importUnit] of Object.entries(importUnits)) {
            if (!merged[uid]) { merged[uid] = importUnit as any; continue; }

            const existing = merged[uid];

            // Merge component issues — skip any ID already present
            const mergedComponents = { ...existing.components };
            for (const comp of (Object.keys(existing.components) as ComponentKey[])) {
              const existIds = new Set(existing.components[comp].issues.map((i) => i.id));
              const newIssues = ((importUnit as any).components?.[comp]?.issues ?? []).filter((i: any) => !existIds.has(i.id));
              const importStatus = (importUnit as any).components?.[comp]?.status;
              const mergedStatus = existing.components[comp].status !== 'unchecked'
                ? existing.components[comp].status
                : (importStatus ?? 'unchecked');
              mergedComponents[comp] = {
                status: mergedStatus,
                issues: [...existing.components[comp].issues, ...newIssues],
              };
            }

            // Merge misc equipment — match by label (case-insensitive)
            const existingMisc = [...(existing.miscEquipment ?? [])];
            for (const importItem of ((importUnit as any).miscEquipment ?? [])) {
              const idx = existingMisc.findIndex((m) => m.label.toLowerCase() === importItem.label.toLowerCase());
              if (idx === -1) {
                existingMisc.push(importItem);
              } else {
                const existIds = new Set(existingMisc[idx].issues.map((i) => i.id));
                const newIssues = importItem.issues.filter((i: any) => !existIds.has(i.id));
                existingMisc[idx] = { ...existingMisc[idx], issues: [...existingMisc[idx].issues, ...newIssues] };
              }
            }

            merged[uid] = { ...existing, components: mergedComponents, miscEquipment: existingMisc };
          }

          // Merge general issues — skip IDs already present
          const existGeneralIds = new Set(state.generalIssues.map((i) => i.id));
          const newGeneral = importGeneralIssues.filter((i) => !existGeneralIds.has(i.id));

          return { units: merged, generalIssues: [...state.generalIssues, ...newGeneral] };
        }),

      loadBackup: (units, generalIssues = []) => set({ units, generalIssues }),
    }),
    {
      name: 'unit-tracker-v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
