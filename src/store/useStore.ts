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
} from '../types';
import { createInitialUnits } from '../utils/initialData';

interface StoreState {
  units: UnitsStore;
  updateStage: (unitId: string, stage: StageKey, value: boolean) => void;
  updateComponentStatus: (unitId: string, component: ComponentKey, status: ComponentStatus) => void;
  addIssue: (unitId: string, issue: Issue) => void;
  updateIssue: (unitId: string, componentKey: ComponentKey, issueId: string, updates: Partial<Issue>) => void;
  deleteIssue: (unitId: string, componentKey: ComponentKey, issueId: string) => void;
  resetUnit: (unitId: string) => void;
  setCustomComponentLabel: (unitId: string, componentKey: ComponentKey, label: string) => void;
  loadBackup: (units: UnitsStore) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      units: createInitialUnits(),

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
              [unitId]: { ...fresh, id: existing.id, side: existing.side, unitNumber: existing.unitNumber },
            },
          };
        }),

      setCustomComponentLabel: (unitId, componentKey, label) =>
        set((state) => ({
          units: {
            ...state.units,
            [unitId]: {
              ...state.units[unitId],
              customComponentLabels: {
                ...(state.units[unitId].customComponentLabels ?? {}),
                [componentKey]: label.trim() || undefined,
              },
            },
          },
        })),

      loadBackup: (units) => set({ units }),
    }),
    {
      name: 'unit-tracker-v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
