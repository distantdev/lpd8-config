import type {
  DeviceIdentity,
  KnobConfig,
  PadConfig,
  ProgramConfig,
  ProgramNumber,
} from '../types/lpd8';
import { CONTROL_NUMBERS } from '../engine/factoryDefaults';

export const SYSEX_START = 0xF0;
export const SYSEX_END = 0xF7;

export const LPD8_MANUFACTURER_ID = 0x47;
export const LPD8_DEVICE_ID = 0x7F;
export const LPD8_MK1_MODEL_ID = 0x75;
export const LPD8_MK2_MODEL_ID = 0x4C;
export const LPD8_WIRELESS_MODEL_ID = 0x3F;

export const CMD_WRITE_PROGRAM = 0x61;
export const CMD_ACTIVATE_PROGRAM = 0x62;
export const CMD_REQUEST_PROGRAM = 0x63;
export const CMD_ACTIVE_PROGRAM = 0x64;

export const PROGRAM_PAYLOAD_LENGTH = 0x3A; // 58 bytes
export const PROGRAM_SYSEX_LENGTH = 66;

export function clamp7Bit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(127, Math.round(value)));
}

export function clampChannel(channel: number): number {
  if (!Number.isFinite(channel)) return 1;
  return Math.max(1, Math.min(16, Math.round(channel)));
}

export function clampProgram(program: number): ProgramNumber {
  if (!Number.isFinite(program)) return 1;
  const rounded = Math.max(1, Math.min(4, Math.round(program)));
  return rounded as ProgramNumber;
}

export function encodeRequestProgram(program: ProgramNumber): Uint8Array {
  return new Uint8Array([
    SYSEX_START,
    LPD8_MANUFACTURER_ID,
    LPD8_DEVICE_ID,
    LPD8_MK1_MODEL_ID,
    CMD_REQUEST_PROGRAM,
    0x00,
    0x01,
    clampProgram(program),
    SYSEX_END,
  ]);
}

export function encodeWriteProgram(config: ProgramConfig): Uint8Array {
  const bytes = new Uint8Array(PROGRAM_SYSEX_LENGTH);
  bytes[0] = SYSEX_START;
  bytes[1] = LPD8_MANUFACTURER_ID;
  bytes[2] = LPD8_DEVICE_ID;
  bytes[3] = LPD8_MK1_MODEL_ID;
  bytes[4] = CMD_WRITE_PROGRAM;
  bytes[5] = 0x00;
  bytes[6] = PROGRAM_PAYLOAD_LENGTH;
  bytes[7] = clampProgram(config.program);
  bytes[8] = clampChannel(config.channel) - 1;

  for (let i = 0; i < 8; i++) {
    const padNum = CONTROL_NUMBERS[i];
    const pad = config.pads.find((p) => p.number === padNum) ?? config.pads[i];
    const offset = 9 + i * 4;
    bytes[offset] = clamp7Bit(pad?.note ?? 36 + i);
    bytes[offset + 1] = clamp7Bit(pad?.pc ?? i);
    bytes[offset + 2] = clamp7Bit(pad?.cc ?? 9 + i);
    bytes[offset + 3] = pad?.mode === 'toggle' ? 0x01 : 0x00;
  }

  for (let i = 0; i < 8; i++) {
    const knobNum = CONTROL_NUMBERS[i];
    const knob = config.knobs.find((k) => k.number === knobNum) ?? config.knobs[i];
    const offset = 41 + i * 3;
    bytes[offset] = clamp7Bit(knob?.cc ?? 1 + i);
    bytes[offset + 1] = clamp7Bit(knob?.min ?? 0);
    bytes[offset + 2] = clamp7Bit(knob?.max ?? 127);
  }

  bytes[65] = SYSEX_END;
  return bytes;
}

export function encodeGetActiveProgram(): Uint8Array {
  return new Uint8Array([
    SYSEX_START,
    LPD8_MANUFACTURER_ID,
    LPD8_DEVICE_ID,
    LPD8_MK1_MODEL_ID,
    CMD_ACTIVE_PROGRAM,
    0x00,
    0x00,
    SYSEX_END,
  ]);
}

export function encodeActivateProgram(program: ProgramNumber): Uint8Array {
  return new Uint8Array([
    SYSEX_START,
    LPD8_MANUFACTURER_ID,
    LPD8_DEVICE_ID,
    LPD8_MK1_MODEL_ID,
    CMD_ACTIVATE_PROGRAM,
    0x00,
    0x01,
    clampProgram(program),
    SYSEX_END,
  ]);
}

export function encodeIdentityRequest(): Uint8Array {
  return new Uint8Array([SYSEX_START, 0x7E, 0x00, 0x06, 0x01, SYSEX_END]);
}

export function decodeProgramResponse(data: Uint8Array | number[]): ProgramConfig | null {
  if (data.length !== PROGRAM_SYSEX_LENGTH) return null;
  if (data[0] !== SYSEX_START || data[65] !== SYSEX_END) return null;
  if (
    data[1] !== LPD8_MANUFACTURER_ID ||
    data[2] !== LPD8_DEVICE_ID ||
    data[3] !== LPD8_MK1_MODEL_ID
  ) {
    return null;
  }
  if (data[4] !== CMD_REQUEST_PROGRAM && data[4] !== CMD_WRITE_PROGRAM) {
    return null;
  }
  if (data[5] !== 0x00 || data[6] !== PROGRAM_PAYLOAD_LENGTH) {
    return null;
  }

  const progRaw = data[7];
  if (progRaw < 1 || progRaw > 4) return null;

  const chRaw = data[8];
  if (chRaw < 0 || chRaw > 15) return null;

  const pads: PadConfig[] = [];
  for (let i = 0; i < 8; i++) {
    const offset = 9 + i * 4;
    pads.push({
      number: i + 1,
      note: clamp7Bit(data[offset]),
      pc: clamp7Bit(data[offset + 1]),
      cc: clamp7Bit(data[offset + 2]),
      mode: data[offset + 3] === 0x01 ? 'toggle' : 'momentary',
    });
  }

  const knobs: KnobConfig[] = [];
  for (let i = 0; i < 8; i++) {
    const offset = 41 + i * 3;
    knobs.push({
      number: i + 1,
      cc: clamp7Bit(data[offset]),
      min: clamp7Bit(data[offset + 1]),
      max: clamp7Bit(data[offset + 2]),
    });
  }

  return {
    program: progRaw as ProgramNumber,
    channel: chRaw + 1,
    pads,
    knobs,
  };
}

export function decodeActiveProgramResponse(data: Uint8Array | number[]): ProgramNumber | null {
  if (data.length !== 9) return null;
  if (data[0] !== SYSEX_START || data[8] !== SYSEX_END) return null;
  if (
    data[1] !== LPD8_MANUFACTURER_ID ||
    data[2] !== LPD8_DEVICE_ID ||
    data[3] !== LPD8_MK1_MODEL_ID ||
    data[4] !== CMD_ACTIVE_PROGRAM ||
    data[5] !== 0x00 ||
    data[6] !== 0x01
  ) {
    return null;
  }

  const prog = data[7];
  if (prog < 1 || prog > 4) return null;
  return prog as ProgramNumber;
}

export function decodeIdentityResponse(data: Uint8Array | number[]): DeviceIdentity | null {
  if (data.length < 15) return null;
  if (data[0] !== SYSEX_START || data[data.length - 1] !== SYSEX_END) return null;
  if (data[1] !== 0x7E || data[3] !== 0x06 || data[4] !== 0x02) return null;

  const manufacturerId = data[5];
  const familyId = data[6] | (data[7] << 7);
  const productId = data[8] | (data[9] << 7);
  const versionByte = data[12];
  const isMk1 = manufacturerId === LPD8_MANUFACTURER_ID && data[6] === LPD8_MK1_MODEL_ID;

  let modelName = 'Unknown MIDI Device';
  if (manufacturerId === LPD8_MANUFACTURER_ID) {
    if (data[6] === LPD8_MK1_MODEL_ID) {
      modelName = 'LPD8 (Mk1)';
    } else if (data[6] === LPD8_MK2_MODEL_ID) {
      modelName = 'LPD8 Mk2 (Unsupported)';
    } else if (data[6] === LPD8_WIRELESS_MODEL_ID) {
      modelName = 'LPD8 Wireless (Unsupported)';
    } else {
      modelName = `MIDI Device (0x${data[6].toString(16).toUpperCase().padStart(2, '0')})`;
    }
  }

  return {
    manufacturerId,
    familyId,
    productId,
    versionByte,
    modelName,
    isMk1,
  };
}

export function formatHexBytes(bytes: Uint8Array | number[]): string {
  const arr = Array.from(bytes);
  return arr.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

export function parseSyxBuffer(buffer: Uint8Array): ProgramConfig[] {
  const results: ProgramConfig[] = [];
  let start = -1;

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte === SYSEX_START) {
      start = i;
    } else if (byte === SYSEX_END && start !== -1) {
      const slice = buffer.subarray(start, i + 1);
      const decoded = decodeProgramResponse(slice);
      if (decoded) {
        results.push(decoded);
      }
      start = -1;
    }
  }

  return results;
}

export function buildSyxBuffer(programs: ProgramConfig[]): Uint8Array {
  const packets = programs.map((p) => encodeWriteProgram(p));
  const totalLen = packets.reduce((sum, p) => sum + p.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const packet of packets) {
    merged.set(packet, offset);
    offset += packet.length;
  }
  return merged;
}

export interface SysexByteDescription {
  section: 'header' | 'slot' | 'channel' | 'pad' | 'knob' | 'end';
  label: string;
  detail: string;
}

export function describeSysexByte(index: number, value: number): SysexByteDescription {
  if (index === 0) {
    return { section: 'header', label: 'SOX', detail: 'SysEx Start (0xF0)' };
  }
  if (index === 1) {
    return { section: 'header', label: 'Mfr', detail: 'Manufacturer ID (0x47)' };
  }
  if (index === 2) {
    return { section: 'header', label: 'Dev', detail: 'Device ID / Omni (0x7F)' };
  }
  if (index === 3) {
    return { section: 'header', label: 'Model', detail: 'LPD8 Mk1 Model ID (0x75)' };
  }
  if (index === 4) {
    return {
      section: 'header',
      label: 'Cmd',
      detail: value === CMD_WRITE_PROGRAM ? 'Write Program (0x61)' : `Program Dump (0x${value.toString(16).toUpperCase()})`,
    };
  }
  if (index === 5) {
    return { section: 'header', label: 'LenH', detail: 'Payload Length MSB (0x00)' };
  }
  if (index === 6) {
    return { section: 'header', label: 'LenL', detail: 'Payload Length LSB (0x3A = 58 bytes)' };
  }
  if (index === 7) {
    return { section: 'slot', label: `Prog ${value}`, detail: `Program Slot ${value} (0x0${value})` };
  }
  if (index === 8) {
    return { section: 'channel', label: `Ch ${value + 1}`, detail: `Global MIDI Channel ${value + 1} (0x${value.toString(16).toUpperCase().padStart(2, '0')})` };
  }
  if (index >= 9 && index <= 40) {
    const rel = index - 9;
    const padNum = Math.floor(rel / 4) + 1;
    const fieldIdx = rel % 4;
    if (fieldIdx === 0) {
      return { section: 'pad', label: `P${padNum} Note`, detail: `Pad ${padNum} MIDI Note = ${value}` };
    }
    if (fieldIdx === 1) {
      return { section: 'pad', label: `P${padNum} PC`, detail: `Pad ${padNum} Program Change = ${value}` };
    }
    if (fieldIdx === 2) {
      return { section: 'pad', label: `P${padNum} CC`, detail: `Pad ${padNum} CC = ${value}` };
    }
    return {
      section: 'pad',
      label: `P${padNum} Mode`,
      detail: `Pad ${padNum} Mode = ${value === 1 ? 'Toggle (1)' : 'Momentary (0)'}`,
    };
  }
  if (index >= 41 && index <= 64) {
    const rel = index - 41;
    const knobNum = Math.floor(rel / 3) + 1;
    const fieldIdx = rel % 3;
    if (fieldIdx === 0) {
      return { section: 'knob', label: `K${knobNum} CC`, detail: `Knob ${knobNum} CC = ${value}` };
    }
    if (fieldIdx === 1) {
      return { section: 'knob', label: `K${knobNum} Min`, detail: `Knob ${knobNum} Min = ${value}` };
    }
    return { section: 'knob', label: `K${knobNum} Max`, detail: `Knob ${knobNum} Max = ${value}` };
  }
  return { section: 'end', label: 'EOX', detail: 'SysEx End (0xF7)' };
}
