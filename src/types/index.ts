export type Side = 'North' | 'South';

export const STAGES = [
  { key: 'wiresLabelsOhming', label: 'Wires / Labels / Ohming' },
  { key: 'plcCommChecks', label: 'PLC Comm Checks' },
  { key: 'loopChecks', label: 'Loop / Equipment Checks' },
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
  { key: 'supplyIsoValve', label: 'Supply Iso Valve / ABZ Actuator' },
  { key: 'returnIsoValve', label: 'Return Iso Valve / ABZ Actuator' },
  { key: 'bypassValve', label: 'Bypass Valve / Belimo Actuator' },
  { key: 'transmitters', label: 'Transmitters' },
  { key: 'primePump', label: 'Primary Pump' },
  { key: 'secondPump', label: 'Secondary Pump' },
  { key: 'flowMeter', label: 'Supply Flow Meter' },
  { key: 'gfci', label: 'Supply Flow Meter GFCI' },
  { key: 'flowSwitch', label: 'Flow Switch' },
  { key: 'chillerInterlocks', label: 'Chiller Interlocks' },
  { key: 'fieldServer', label: 'Field Server' },
  { key: 'plc', label: 'PLC' },
] as const;

export type ComponentKey = (typeof COMPONENTS)[number]['key'];

export type ComponentStatus = 'unchecked' | 'good' | 'bad' | 'inProgress';

export interface IssueUpdate {
  id: string;
  date: string;
  note: string;
  updatedBy: string;
}

export interface Issue {
  id: string;
  componentKey: ComponentKey;
  dateFound: string;
  dateUpdated?: string;
  foundBy: string;
  responsibleParty?: string;
  notes: string;
  suggestedResolution?: string;
  resolved: boolean;
  dateFixed?: string;
  fixedBy?: string;
  howFixed?: string;
  images?: string[];
  updates?: IssueUpdate[];
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
  suggestedResolution?: string;
  resolved: boolean;
  dateFixed?: string;
  fixedBy?: string;
  howFixed?: string;
  images?: string[];
  updates?: IssueUpdate[];
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
  stagesNotesUpdatedAt?: Partial<Record<StageKey, string>>;
  stagesStuckReasons?: Partial<Record<StageKey, string>>;
  stagesStuckReasonsUpdatedAt?: Partial<Record<StageKey, string>>;
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
  suggestedResolution?: string;
  resolved: boolean;
  dateFixed?: string;
  fixedBy?: string;
  howFixed?: string;
  updates?: IssueUpdate[];
  deleted?: boolean;
  deletedAt?: string;
}
