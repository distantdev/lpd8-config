import type { BankState, ProgramNumber } from '../types/lpd8';
import { PROGRAM_NUMBERS } from './factoryDefaults';
import { midiNoteToName } from './musicNotes';

export interface ConflictLocation {
  program: ProgramNumber;
  control: 'pad' | 'knob';
  number: number;
  field: 'cc' | 'note' | 'min' | 'max';
}

export interface ConflictItem {
  id: string;
  scope: 'intra' | 'cross' | 'range';
  severity: 'warning' | 'info';
  channel: number;
  kind: 'cc' | 'note' | 'range';
  value: number;
  message: string;
  locations: ConflictLocation[];
}

export interface ConflictReport {
  intraProgram: ConflictItem[];
  crossProgram: ConflictItem[];
  invertedRanges: ConflictItem[];
  all: ConflictItem[];
}

function formatLocation(loc: ConflictLocation): string {
  const prefix = loc.control === 'pad' ? `Pad ${loc.number}` : `K${loc.number}`;
  return `P${loc.program} ${prefix}`;
}

export function detectConflicts(bank: BankState): ConflictReport {
  const intraProgram: ConflictItem[] = [];
  const crossProgram: ConflictItem[] = [];
  const invertedRanges: ConflictItem[] = [];

  const crossCC = new Map<string, ConflictLocation[]>();
  const crossNotes = new Map<string, ConflictLocation[]>();

  for (const pNum of PROGRAM_NUMBERS) {
    const prog = bank[pNum];
    const intraCC = new Map<number, ConflictLocation[]>();
    const intraNotes = new Map<number, ConflictLocation[]>();

    for (const pad of prog.pads) {
      const ccLoc: ConflictLocation = {
        program: pNum,
        control: 'pad',
        number: pad.number,
        field: 'cc',
      };
      if (!intraCC.has(pad.cc)) intraCC.set(pad.cc, []);
      intraCC.get(pad.cc)!.push(ccLoc);

      const ccKey = `${prog.channel}:${pad.cc}`;
      if (!crossCC.has(ccKey)) crossCC.set(ccKey, []);
      crossCC.get(ccKey)!.push(ccLoc);

      const noteLoc: ConflictLocation = {
        program: pNum,
        control: 'pad',
        number: pad.number,
        field: 'note',
      };
      if (!intraNotes.has(pad.note)) intraNotes.set(pad.note, []);
      intraNotes.get(pad.note)!.push(noteLoc);

      const noteKey = `${prog.channel}:${pad.note}`;
      if (!crossNotes.has(noteKey)) crossNotes.set(noteKey, []);
      crossNotes.get(noteKey)!.push(noteLoc);
    }

    for (const knob of prog.knobs) {
      const ccLoc: ConflictLocation = {
        program: pNum,
        control: 'knob',
        number: knob.number,
        field: 'cc',
      };
      if (!intraCC.has(knob.cc)) intraCC.set(knob.cc, []);
      intraCC.get(knob.cc)!.push(ccLoc);

      const ccKey = `${prog.channel}:${knob.cc}`;
      if (!crossCC.has(ccKey)) crossCC.set(ccKey, []);
      crossCC.get(ccKey)!.push(ccLoc);

      if (knob.min > knob.max) {
        invertedRanges.push({
          id: `range:p${pNum}:k${knob.number}`,
          scope: 'range',
          severity: 'info',
          channel: prog.channel,
          kind: 'range',
          value: knob.min,
          message: `P${pNum} K${knob.number} has inverted range (${knob.min} → ${knob.max})`,
          locations: [
            { program: pNum, control: 'knob', number: knob.number, field: 'min' },
            { program: pNum, control: 'knob', number: knob.number, field: 'max' },
          ],
        });
      }
    }

    for (const [ccVal, locs] of intraCC.entries()) {
      if (locs.length > 1) {
        intraProgram.push({
          id: `intra:cc:p${pNum}:${ccVal}`,
          scope: 'intra',
          severity: 'warning',
          channel: prog.channel,
          kind: 'cc',
          value: ccVal,
          message: `Program ${pNum} duplicate CC ${ccVal} on ${locs.map(formatLocation).join(', ')}`,
          locations: locs,
        });
      }
    }

    for (const [noteVal, locs] of intraNotes.entries()) {
      if (locs.length > 1) {
        intraProgram.push({
          id: `intra:note:p${pNum}:${noteVal}`,
          scope: 'intra',
          severity: 'warning',
          channel: prog.channel,
          kind: 'note',
          value: noteVal,
          message: `Program ${pNum} duplicate Note ${midiNoteToName(noteVal)} (${noteVal}) on ${locs
            .map(formatLocation)
            .join(', ')}`,
          locations: locs,
        });
      }
    }
  }

  for (const [key, locs] of crossCC.entries()) {
    const distinctProgs = new Set(locs.map((l) => l.program));
    if (distinctProgs.size > 1) {
      const [chStr, ccStr] = key.split(':');
      const ch = Number(chStr);
      const ccVal = Number(ccStr);
      crossProgram.push({
        id: `cross:cc:ch${ch}:${ccVal}`,
        scope: 'cross',
        severity: 'info',
        channel: ch,
        kind: 'cc',
        value: ccVal,
        message: `Ch ${ch} CC ${ccVal} shared across ${locs.map(formatLocation).join(', ')}`,
        locations: locs,
      });
    }
  }

  for (const [key, locs] of crossNotes.entries()) {
    const distinctProgs = new Set(locs.map((l) => l.program));
    if (distinctProgs.size > 1) {
      const [chStr, noteStr] = key.split(':');
      const ch = Number(chStr);
      const noteVal = Number(noteStr);
      crossProgram.push({
        id: `cross:note:ch${ch}:${noteVal}`,
        scope: 'cross',
        severity: 'info',
        channel: ch,
        kind: 'note',
        value: noteVal,
        message: `Ch ${ch} Note ${midiNoteToName(noteVal)} (${noteVal}) shared across ${locs
          .map(formatLocation)
          .join(', ')}`,
        locations: locs,
      });
    }
  }

  return {
    intraProgram,
    crossProgram,
    invertedRanges,
    all: [...intraProgram, ...crossProgram, ...invertedRanges],
  };
}

export function getControlConflicts(
  report: ConflictReport,
  program: ProgramNumber,
  control: 'pad' | 'knob',
  number: number,
): ConflictItem[] {
  return report.all.filter((item) =>
    item.locations.some(
      (loc) => loc.program === program && loc.control === control && loc.number === number,
    ),
  );
}
