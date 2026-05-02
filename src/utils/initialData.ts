import { Unit, UnitsStore, ComponentsData, StagesData, COMPONENTS, STAGES } from '../types';

const createDefaultComponents = (): ComponentsData => {
  const components = {} as ComponentsData;
  for (const { key } of COMPONENTS) {
    components[key] = { status: 'unchecked', issues: [] };
  }
  return components;
};

const createDefaultStages = (): StagesData => {
  const stages = {} as StagesData;
  for (const { key } of STAGES) {
    stages[key] = false;
  }
  return stages;
};

export const createInitialUnits = (): UnitsStore => {
  const units: UnitsStore = {};

  for (let i = 1; i <= 26; i++) {
    const id = `N-${String(i).padStart(2, '0')}`;
    units[id] = {
      id,
      side: 'North',
      unitNumber: i,
      stages: createDefaultStages(),
      components: createDefaultComponents(),
    };
  }

  for (let i = 1; i <= 25; i++) {
    const id = `S-${String(i).padStart(2, '0')}`;
    units[id] = {
      id,
      side: 'South',
      unitNumber: i,
      stages: createDefaultStages(),
      components: createDefaultComponents(),
    };
  }

  return units;
};
