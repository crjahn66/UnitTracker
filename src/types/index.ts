export type Side = 'North' | 'South';

export const STAGES = [
  { key: 'wiresLabelsOhming', label: 'Wires / Labels / Ohming' },
  { key: 'plcCommChecks', label: 'PLC Comm Checks / Equipment' },
  { key: 'loopChecks', label: 'Loop Checks' },
  { key: 'commissioning', label: 'RED Group Tested' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];
export type StageStatus = 'pending' | 'inProgress' | 'complete' | 'stuck';

// Converts legacy boolean stage values (true=complete, false=pending) to StageStatus
export function normalizeStageStatus(v: unknown): StageStatus {
  if (v === true)  return 'complete';
  if (!v || v === false) return 'pending';
  return v as StageStatus;
}

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
] as const;

export type ComponentKey = (typeof COMPONENTS)[number]['key'];

export type ComponentStatus = 'unchecked' | 'good' | 'bad' | 'inProgress';

export interface Issue {
  id: string;
  componentKey: ComponentKey;
  dateFound: string;
  dateUpdated?: string;
  foundBy: string;
  responsibleParty?: string;
  notes: string;
  resolved: boolean;
  dateFixed?: string;
  fixedBy?: string;
  howFixed?: string;
  images?: string[];
  deleted?: boolean;
  deletedAt?: string;
}

export interface ComponentData {
  status: ComponentStatus;
  issues: Issue[];
  progressNote?: string;
  progressImages?: string[];
  goodNote?: string;
  goodImages?: string[];
  goodDate?: string;
  inProgressDate?: string;
  badDate?: string;
}

export type StagesData = Record<StageKey, StageStatus>;
export type ComponentsData = Record<ComponentKey, ComponentData>;

export interface MiscIssue {
  id: string;
  dateFound: string;
  dateUpdated?: string;
  foundBy: string;
  responsibleParty?: string;
  notes: string;
  resolved: boolean;
  dateFixed?: string;
  fixedBy?: string;
  howFixed?: string;
  images?: string[];
  deleted?: boolean;
  deletedAt?: string;
}

export interface MiscEquipItem {
  id: string;
  label: string;
  status: ComponentStatus;
  issues: MiscIssue[];
  progressNote?: string;
  progressImages?: string[];
  goodNote?: string;
  goodImages?: string[];
  goodDate?: string;
  inProgressDate?: string;
  badDate?: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface Unit {
  id: string;
  side: Side;
  unitNumber: number;
  stages: StagesData;
  stagesDates?: Partial<Record<StageKey, string>>;
  stagesNotes?: Partial<Record<StageKey, string>>;
  components: ComponentsData;
  miscEquipment?: MiscEquipItem[];
  customComponentLabels?: Partial<Record<ComponentKey, string>>;
  chillerAvailable?: boolean;
}

export type UnitsStore = Record<string, Unit>;

export interface GeneralIssue {
  id: string;
  dateFound: string;
  dateUpdated?: string;
  foundBy: string;
  responsibleParty?: string;
  notes: string;
  resolved: boolean;
  dateFixed?: string;
  fixedBy?: string;
  howFixed?: string;
  deleted?: boolean;
  deletedAt?: string;
}
