export type Side = 'North' | 'South';

export const STAGES = [
  { key: 'wiresLabelsOhming', label: 'Wires / Labels / Ohming' },
  { key: 'plcCommChecks', label: 'PLC Comm Checks / Equipment' },
  { key: 'loopChecks', label: 'Loop Checks' },
  { key: 'commissioning', label: 'Commissioning' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];

export const COMPONENTS = [
  { key: 'supplyIsoValve', label: 'Supply Iso Valve' },
  { key: 'returnIsoValve', label: 'Return Iso Valve' },
  { key: 'bypassValve', label: 'Bypass Valve' },
  { key: 'transmitters', label: 'Transmitters' },
  { key: 'primePump', label: 'Prime Pump' },
  { key: 'secondPump', label: 'Second Pump' },
  { key: 'flowMeter', label: 'Flow Meter' },
  { key: 'gfci', label: 'GFCI' },
  { key: 'flowSwitch', label: 'Flow Switch' },
  { key: 'chillerInterlocks', label: 'Chiller Interlocks' },
  { key: 'fieldServer', label: 'Field Server' },
  { key: 'plc', label: 'PLC' },
  { key: 'micsEquip', label: 'MICS Equip' },
] as const;

export type ComponentKey = (typeof COMPONENTS)[number]['key'];

export type ComponentStatus = 'unchecked' | 'good' | 'bad';

export interface Issue {
  id: string;
  componentKey: ComponentKey;
  dateFound: string;
  foundBy: string;
  notes: string;
  resolved: boolean;
  dateFixed?: string;
  fixedBy?: string;
  howFixed?: string;
}

export interface ComponentData {
  status: ComponentStatus;
  issues: Issue[];
}

export type StagesData = Record<StageKey, boolean>;
export type ComponentsData = Record<ComponentKey, ComponentData>;

export interface Unit {
  id: string;
  side: Side;
  unitNumber: number;
  stages: StagesData;
  components: ComponentsData;
}

export type UnitsStore = Record<string, Unit>;
