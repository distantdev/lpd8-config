import type { BankState, KnobConfig, PadConfig, ProgramConfig, ProgramNumber } from '../types/lpd8';

export const PROGRAM_NUMBERS: readonly ProgramNumber[] = [1, 2, 3, 4] as const;
export const CONTROL_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Verified factory defaults from hardware LPD8 Mk1 SysEx dump:
 * Channel 1, Pads 1-8 = Note 36-43, PC 0-7, CC 9-16, Momentary
 * Knobs 1-8 = CC 1-8, Min 0, Max 127
 */
export function createFactoryProgram(program: ProgramNumber): ProgramConfig {
  const pads: PadConfig[] = CONTROL_NUMBERS.map((num, idx) => ({
    number: num,
    note: 36 + idx,
    pc: idx,
    cc: 9 + idx,
    mode: 'momentary',
  }));

  const knobs: KnobConfig[] = CONTROL_NUMBERS.map((num, idx) => ({
    number: num,
    cc: 1 + idx,
    min: 0,
    max: 127,
  }));

  return {
    program,
    channel: 1,
    pads,
    knobs,
  };
}

export function createFactoryBank(): BankState {
  return {
    1: createFactoryProgram(1),
    2: createFactoryProgram(2),
    3: createFactoryProgram(3),
    4: createFactoryProgram(4),
  };
}

export function cloneProgram(program: ProgramConfig): ProgramConfig {
  return {
    program: program.program,
    channel: program.channel,
    pads: program.pads.map((p) => ({ ...p })),
    knobs: program.knobs.map((k) => ({ ...k })),
  };
}

export function cloneBank(bank: BankState): BankState {
  return {
    1: cloneProgram(bank[1]),
    2: cloneProgram(bank[2]),
    3: cloneProgram(bank[3]),
    4: cloneProgram(bank[4]),
  };
}

export function countProgramDiffs(a: ProgramConfig, b: ProgramConfig): number {
  let diffs = 0;
  if (a.channel !== b.channel) {
    diffs += 1;
  }

  for (let i = 0; i < 8; i++) {
    const pa = a.pads[i];
    const pb = b.pads[i];
    if (!pa || !pb) {
      diffs += 4;
    } else {
      if (pa.note !== pb.note) diffs += 1;
      if (pa.pc !== pb.pc) diffs += 1;
      if (pa.cc !== pb.cc) diffs += 1;
      if (pa.mode !== pb.mode) diffs += 1;
    }

    const ka = a.knobs[i];
    const kb = b.knobs[i];
    if (!ka || !kb) {
      diffs += 3;
    } else {
      if (ka.cc !== kb.cc) diffs += 1;
      if (ka.min !== kb.min) diffs += 1;
      if (ka.max !== kb.max) diffs += 1;
    }
  }

  return diffs;
}

export function programsEqual(a: ProgramConfig, b: ProgramConfig): boolean {
  return a.program === b.program && countProgramDiffs(a, b) === 0;
}
