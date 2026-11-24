import type { BankState, KnobConfig, PadConfig, ProgramConfig, ProgramNumber } from '../types/lpd8';
import { CONTROL_NUMBERS, createFactoryBank, PROGRAM_NUMBERS } from './factoryDefaults';
import { buildSyxBuffer, clamp7Bit, clampChannel, parseSyxBuffer } from '../midi/sysex';

const STORAGE_KEY = 'lpd8_easy_mapper_bank_v1';

interface PersistedEnvelope {
  version: 1;
  savedAt: string;
  source?: string;
  bank: BankState;
}

function sanitizePad(raw: unknown, idx: number): PadConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<PadConfig>;
  return {
    number: idx + 1,
    note: clamp7Bit(typeof obj.note === 'number' ? obj.note : 36 + idx),
    pc: clamp7Bit(typeof obj.pc === 'number' ? obj.pc : idx),
    cc: clamp7Bit(typeof obj.cc === 'number' ? obj.cc : 9 + idx),
    mode: obj.mode === 'toggle' ? 'toggle' : 'momentary',
  };
}

function sanitizeKnob(raw: unknown, idx: number): KnobConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<KnobConfig>;
  return {
    number: idx + 1,
    cc: clamp7Bit(typeof obj.cc === 'number' ? obj.cc : 1 + idx),
    min: clamp7Bit(typeof obj.min === 'number' ? obj.min : 0),
    max: clamp7Bit(typeof obj.max === 'number' ? obj.max : 127),
  };
}

function sanitizeProgram(raw: unknown, program: ProgramNumber): ProgramConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<ProgramConfig>;
  const rawPads = Array.isArray(obj.pads) ? obj.pads : [];
  const rawKnobs = Array.isArray(obj.knobs) ? obj.knobs : [];

  return {
    program,
    channel: clampChannel(typeof obj.channel === 'number' ? obj.channel : 1),
    pads: CONTROL_NUMBERS.map((num, idx) => {
      const match = rawPads.find((p) => p && p.number === num) ?? rawPads[idx];
      return sanitizePad(match, idx);
    }),
    knobs: CONTROL_NUMBERS.map((num, idx) => {
      const match = rawKnobs.find((k) => k && k.number === num) ?? rawKnobs[idx];
      return sanitizeKnob(match, idx);
    }),
  };
}

export function validateAndSanitizeBank(raw: unknown): BankState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate =
    'bank' in raw && (raw as PersistedEnvelope).bank
      ? (raw as PersistedEnvelope).bank
      : (raw as Partial<BankState>);

  if (!candidate || typeof candidate !== 'object') return null;

  const hasAnyProgram = PROGRAM_NUMBERS.some((p) => Boolean((candidate as Record<number, unknown>)[p]));
  if (!hasAnyProgram) return null;

  const result = createFactoryBank();
  for (const pNum of PROGRAM_NUMBERS) {
    const slot = (candidate as Record<number, unknown>)[pNum];
    if (slot) {
      result[pNum] = sanitizeProgram(slot, pNum);
    }
  }
  return result;
}

export function loadSavedBank(): BankState {
  if (typeof localStorage === 'undefined') {
    return createFactoryBank();
  }
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return createFactoryBank();
    const parsed: unknown = JSON.parse(text);
    return validateAndSanitizeBank(parsed) ?? createFactoryBank();
  } catch {
    return createFactoryBank();
  }
}

export function saveBankToLocalStorage(bank: BankState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const envelope: PersistedEnvelope = {
      version: 1,
      savedAt: new Date().toISOString(),
      bank,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function exportBankJson(bank: BankState): string {
  const envelope: PersistedEnvelope = {
    version: 1,
    savedAt: new Date().toISOString(),
    source: 'https://lpd8.distantnebula.com',
    bank,
  };
  return JSON.stringify(envelope, null, 2);
}

export function importBankJson(jsonText: string): BankState {
  const parsed: unknown = JSON.parse(jsonText);
  const validated = validateAndSanitizeBank(parsed);
  if (!validated) {
    throw new Error('Invalid LPD8 bank JSON file.');
  }
  return validated;
}

export function downloadBlob(data: BlobPart, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportProgramsAsSyx(programs: ProgramConfig[], filename: string): void {
  const buffer = buildSyxBuffer(programs);
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  downloadBlob(copy, filename, 'application/octet-stream');
}

export function importSyxIntoBank(
  currentBank: BankState,
  bytes: Uint8Array,
  targetSlotOverride?: ProgramNumber,
): { nextBank: BankState; importedPrograms: ProgramNumber[] } {
  const decoded = parseSyxBuffer(bytes);
  if (decoded.length === 0) {
    throw new Error('No valid LPD8 Mk1 SysEx program packets found in file.');
  }

  const nextBank: BankState = {
    1: sanitizeProgram(currentBank[1], 1),
    2: sanitizeProgram(currentBank[2], 2),
    3: sanitizeProgram(currentBank[3], 3),
    4: sanitizeProgram(currentBank[4], 4),
  };
  const importedPrograms: ProgramNumber[] = [];

  if (decoded.length === 1 && targetSlotOverride) {
    nextBank[targetSlotOverride] = { ...decoded[0], program: targetSlotOverride };
    importedPrograms.push(targetSlotOverride);
  } else {
    for (const prog of decoded) {
      nextBank[prog.program] = prog;
      importedPrograms.push(prog.program);
    }
  }

  return { nextBank, importedPrograms };
}
