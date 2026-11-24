export type ProgramNumber = 1 | 2 | 3 | 4;

export type PadTriggerMode = 'momentary' | 'toggle';

export interface PadConfig {
  number: number; // 1..8
  note: number; // 0..127
  pc: number; // 0..127
  cc: number; // 0..127
  mode: PadTriggerMode;
}

export interface KnobConfig {
  number: number; // 1..8
  cc: number; // 0..127
  min: number; // 0..127
  max: number; // 0..127
}

export interface ProgramConfig {
  program: ProgramNumber;
  channel: number; // 1..16 (encoded 0x00..0x0F in SysEx)
  pads: PadConfig[];
  knobs: KnobConfig[];
}

export type BankState = Record<ProgramNumber, ProgramConfig>;

export type HardwareSnapshot = Partial<Record<ProgramNumber, ProgramConfig>>;

export type PadLayer = 'note' | 'cc' | 'pc' | 'mode' | 'all';

export type KnobLayer = 'cc' | 'range' | 'all';

export type TargetField =
  | 'knob.cc'
  | 'knob.min'
  | 'knob.max'
  | 'pad.note'
  | 'pad.cc'
  | 'pad.pc'
  | 'pad.mode'
  | 'program.channel';

export interface MidiLogEntry {
  id: number;
  timestamp: number;
  direction: 'tx' | 'rx' | 'info' | 'error';
  label: string;
  bytes?: number[];
}

export interface DeviceIdentity {
  manufacturerId: number;
  familyId: number;
  productId: number;
  versionByte: number;
  modelName: string;
  isMk1: boolean;
}

export interface FlashResult {
  program: ProgramNumber;
  written: boolean;
  verified: boolean | null;
  error?: string;
}

export interface LiveMidiActivity {
  kind: 'note' | 'cc' | 'pc';
  channel: number; // 1..16
  number: number; // note#, cc#, or pc#
  value: number; // velocity or CC value
  active: boolean;
  timestamp: number;
}

export type ControlSelection = {
  kind: 'pad' | 'knob';
  program: ProgramNumber;
  number: number;
};
