export type Side = 'North' | 'South';

export const STAGES = [
  { key: 'wiresLabelsOhming', label: 'Wires / Labels / Ohming' },
  { key: 'plcCommChecks', label: 'PLC Comm Checks' },
  { key: 'loopChecks', label: 'Loop / Equipment Checks' },
  { key: 'commissioning', label: 'RED Group Tested' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];
export type StageStatus = 'pending' | 'inProgress' | 'complete' | 'stuck';

export type OptimoMode = 'O' | 'L' | 'R';

export const OPTIMO_MODE_LABELS: Record<OptimoMode, string> = {
  O: 'Off',
  L: 'Local',
  R: 'Remote',
};

export type WorkingParty = 'redGroup' | 'acs' | 'na';

export const WORKING_PARTY_LABELS: Record<WorkingParty, string> = {
  redGroup: 'Red Group',
  acs: 'ACS',
  na: 'N/A',
};

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
  { key: 'fieldServer', label: 'PSK Field Server' },
  { key: 'plc', label: 'PLC' },
  { key: 'chillerModbusGateway', label: 'Chiller Modbus Gateway' },
  { key: 'upsModbusComms', label: 'UPS Modbus COMMS' },
  { key: 'chiller', label: 'Chiller' },
  { key: 'panduit', label: 'Panduit' },
  { key: 'panelIntegrity', label: 'Panel Integrity' },
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

export interface ReadyForMasterIssue extends Omit<MiscIssue, 'responsibleParty'> {
  signOff?: boolean;
  responsibleParty?: string;
}

export interface ReadyForMasterTransition {
  id: string;
  status: ComponentStatus;
  date: string;
  signedDate?: string;
  signedBy?: string;
  notes?: string;
}

export interface ReadyForMasterData {
  status: ComponentStatus;
  issues: ReadyForMasterIssue[];
  progressNote?: string;
  progressImages?: string[];
  goodNote?: string;
  goodImages?: string[];
  goodDate?: string;
  goodSignedBy?: string;
  inProgressDate?: string;
  badDate?: string;
  badSignedBy?: string;
  badReason?: string;
  failCount?: number;
  transitionLog?: ReadyForMasterTransition[];
  completedLogResetAt?: string;
  readyStatusResetAt?: string;
  wasGood?: boolean;
}

export function createDefaultReadyForMaster(): ReadyForMasterData {
  return { status: 'unchecked', issues: [], failCount: 0, transitionLog: [] };
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
  readyForMaster?: ReadyForMasterData;
  chillerAvailable?: boolean;
  optimoMode?: OptimoMode;
  workingParty?: WorkingParty;
}

export function getReadyForMaster(unit: Pick<Unit, 'readyForMaster'>): ReadyForMasterData {
  return unit.readyForMaster ?? createDefaultReadyForMaster();
}

export function hasOpenReadyForMasterIssues(unit: Pick<Unit, 'readyForMaster'>): boolean {
  return false;
}

export function isUnitComplete(unit: Pick<Unit, 'stages'>): boolean {
  return STAGES.every((s) => normalizeStageStatus(unit.stages[s.key]) === 'complete');
}

export function isReadyForMasterComplete(unit: Pick<Unit, 'readyForMaster'>): boolean {
  return getReadyForMaster(unit).status === 'good';
}

export function isUnitFullyGreen(unit: Pick<Unit, 'stages' | 'components' | 'readyForMaster'>): boolean {
  return isUnitComplete(unit)
    && Object.values(unit.components).every((c) => c.status === 'good')
    && getReadyForMaster(unit).status === 'good'
    && !hasOpenReadyForMasterIssues(unit);
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
