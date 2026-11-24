import type { BankState, PadTriggerMode, ProgramNumber, TargetField } from '../types/lpd8';
import { cloneBank, CONTROL_NUMBERS, PROGRAM_NUMBERS } from './factoryDefaults';
import { generateScaleNotes, midiNoteToName } from './musicNotes';

export type TraversalOrder = 'hardware' | 'visual' | 'columns' | 'reverse';

export type PatternRule =
  | {
      kind: 'sequence';
      start: number;
      step: number;
      progMode: 'continue' | 'repeat' | 'offset';
      progOffset: number;
      skipUsed: boolean;
    }
  | {
      kind: 'scale';
      root: number;
      scaleId: string;
      progMode: 'continue' | 'repeat' | 'octave';
      octaveStep: number;
    }
  | {
      kind: 'constant';
      value: number | PadTriggerMode;
    }
  | {
      kind: 'shift';
      delta: number;
    };

export interface PatternSpec {
  target: TargetField;
  programs: ProgramNumber[];
  selectedIndices?: number[];
  order: TraversalOrder;
  rule: PatternRule;
}

export interface PatternChange {
  program: ProgramNumber;
  target: TargetField;
  controlIndex?: number;
  before: number | PadTriggerMode;
  after: number | PadTriggerMode;
  clamped?: boolean;
}

export interface PatternPreviewResult {
  nextBank: BankState;
  changes: PatternChange[];
  summaryByProgram: Record<ProgramNumber, string>;
}

const PAD_ORDERS: Record<TraversalOrder, readonly number[]> = {
  hardware: [1, 2, 3, 4, 5, 6, 7, 8],
  visual: [5, 6, 7, 8, 1, 2, 3, 4],
  columns: [5, 1, 6, 2, 7, 3, 8, 4],
  reverse: [8, 7, 6, 5, 4, 3, 2, 1],
};

const KNOB_ORDERS: Record<TraversalOrder, readonly number[]> = {
  hardware: [1, 2, 3, 4, 5, 6, 7, 8],
  visual: [1, 2, 3, 4, 5, 6, 7, 8],
  columns: [1, 5, 2, 6, 3, 7, 4, 8],
  reverse: [8, 7, 6, 5, 4, 3, 2, 1],
};

export function getTraversalOrder(kind: 'pad' | 'knob', order: TraversalOrder): number[] {
  return [...(kind === 'pad' ? PAD_ORDERS[order] : KNOB_ORDERS[order])];
}

function clamp7(val: number): { value: number; clamped: boolean } {
  const rounded = Math.round(val);
  if (rounded < 0) return { value: 0, clamped: true };
  if (rounded > 127) return { value: 127, clamped: true };
  return { value: rounded, clamped: false };
}

function clampCh(val: number): { value: number; clamped: boolean } {
  const rounded = Math.round(val);
  if (rounded < 1) return { value: 1, clamped: true };
  if (rounded > 16) return { value: 16, clamped: true };
  return { value: rounded, clamped: false };
}

function getTargetKind(target: TargetField): 'pad' | 'knob' | 'channel' {
  if (target === 'program.channel') return 'channel';
  return target.startsWith('pad.') ? 'pad' : 'knob';
}

function readControlValue(
  bank: BankState,
  program: ProgramNumber,
  target: Exclude<TargetField, 'program.channel'>,
  controlIndex: number,
): number | PadTriggerMode {
  const prog = bank[program];
  if (target.startsWith('pad.')) {
    const pad = prog.pads.find((p) => p.number === controlIndex)!;
    if (target === 'pad.note') return pad.note;
    if (target === 'pad.cc') return pad.cc;
    if (target === 'pad.pc') return pad.pc;
    return pad.mode;
  }
  const knob = prog.knobs.find((k) => k.number === controlIndex)!;
  if (target === 'knob.cc') return knob.cc;
  if (target === 'knob.min') return knob.min;
  return knob.max;
}

function writeControlValue(
  bank: BankState,
  program: ProgramNumber,
  target: Exclude<TargetField, 'program.channel'>,
  controlIndex: number,
  value: number | PadTriggerMode,
): void {
  const prog = bank[program];
  if (target.startsWith('pad.')) {
    const pad = prog.pads.find((p) => p.number === controlIndex)!;
    if (target === 'pad.note') pad.note = value as number;
    else if (target === 'pad.cc') pad.cc = value as number;
    else if (target === 'pad.pc') pad.pc = value as number;
    else pad.mode = value as PadTriggerMode;
    return;
  }
  const knob = prog.knobs.find((k) => k.number === controlIndex)!;
  if (target === 'knob.cc') knob.cc = value as number;
  else if (target === 'knob.min') knob.min = value as number;
  else knob.max = value as number;
}

function formatSummaryValues(target: TargetField, values: Array<number | PadTriggerMode>): string {
  if (values.length === 0) return '';
  if (target === 'program.channel') {
    return `Ch ${values[0]}`;
  }
  if (target === 'pad.mode') {
    const toggles = values.filter((v) => v === 'toggle').length;
    if (toggles === values.length) return `${values.length}× Toggle`;
    if (toggles === 0) return `${values.length}× Mom`;
    return `${toggles} Toggle / ${values.length - toggles} Mom`;
  }

  const nums = values as number[];
  if (nums.every((n) => n === nums[0])) {
    return target === 'pad.note' ? `${midiNoteToName(nums[0])} (${nums[0]})` : `${nums[0]}`;
  }

  const isContiguousAsc = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  const isContiguousDesc = nums.every((n, i) => i === 0 || n === nums[i - 1] - 1);

  if (isContiguousAsc || isContiguousDesc) {
    const first = nums[0];
    const last = nums[nums.length - 1];
    if (target === 'pad.note') {
      return `${midiNoteToName(first)}–${midiNoteToName(last)} (${first}–${last})`;
    }
    return `${first}–${last}`;
  }

  if (nums.length <= 4) {
    return target === 'pad.note'
      ? nums.map((n) => midiNoteToName(n)).join(', ')
      : nums.join(', ');
  }

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (target === 'pad.note') {
    return `${midiNoteToName(nums[0])}..${midiNoteToName(nums[nums.length - 1])} (${min}–${max})`;
  }
  return `${nums[0]}, ${nums[1]} … ${nums[nums.length - 1]}`;
}

function collectUsedCCs(
  bank: BankState,
  excludedTargets: Set<string>,
): Map<number, Set<number>> {
  const byChannel = new Map<number, Set<number>>();
  for (const pNum of PROGRAM_NUMBERS) {
    const prog = bank[pNum];
    if (!byChannel.has(prog.channel)) {
      byChannel.set(prog.channel, new Set());
    }
    const set = byChannel.get(prog.channel)!;

    for (const pad of prog.pads) {
      const key = `${pNum}:pad.cc:${pad.number}`;
      if (!excludedTargets.has(key)) {
        set.add(pad.cc);
      }
    }
    for (const knob of prog.knobs) {
      const key = `${pNum}:knob.cc:${knob.number}`;
      if (!excludedTargets.has(key)) {
        set.add(knob.cc);
      }
    }
  }
  return byChannel;
}

export function computePatternPreview(bank: BankState, spec: PatternSpec): PatternPreviewResult {
  const nextBank = cloneBank(bank);
  const changes: PatternChange[] = [];
  const summaryByProgram: Record<ProgramNumber, string> = { 1: '', 2: '', 3: '', 4: '' };

  const sortedPrograms = [...new Set(spec.programs)].sort((a, b) => a - b) as ProgramNumber[];
  if (sortedPrograms.length === 0) {
    return { nextBank, changes, summaryByProgram };
  }

  const kind = getTargetKind(spec.target);

  if (kind === 'channel') {
    sortedPrograms.forEach((pNum, progIdx) => {
      const before = nextBank[pNum].channel;
      let rawAfter = before;
      if (spec.rule.kind === 'sequence') {
        const offset = spec.rule.progMode === 'repeat' ? 0 : progIdx * spec.rule.step;
        rawAfter = spec.rule.start + offset;
      } else if (spec.rule.kind === 'constant') {
        rawAfter = typeof spec.rule.value === 'number' ? spec.rule.value : before;
      } else if (spec.rule.kind === 'shift') {
        rawAfter = before + spec.rule.delta;
      }
      const { value: after, clamped } = clampCh(rawAfter);
      nextBank[pNum].channel = after;
      changes.push({
        program: pNum,
        target: 'program.channel',
        before,
        after,
        clamped,
      });
      summaryByProgram[pNum] = `Ch ${after}`;
    });
    return { nextBank, changes, summaryByProgram };
  }

  const controlTarget = spec.target as Exclude<TargetField, 'program.channel'>;
  const fullOrder = getTraversalOrder(kind, spec.order);
  const selectedSet =
    spec.selectedIndices && spec.selectedIndices.length > 0
      ? new Set(spec.selectedIndices)
      : null;
  const indices = selectedSet ? fullOrder.filter((n) => selectedSet.has(n)) : fullOrder;

  if (indices.length === 0) {
    return { nextBank, changes, summaryByProgram };
  }

  // Track slots excluded from collision checking when skipUsed is active
  const excludedKeys = new Set<string>();
  for (const pNum of sortedPrograms) {
    for (const idx of indices) {
      excludedKeys.add(`${pNum}:${controlTarget}:${idx}`);
    }
  }

  const canSkipUsed =
    spec.rule.kind === 'sequence' &&
    spec.rule.skipUsed &&
    (controlTarget === 'knob.cc' || controlTarget === 'pad.cc');

  const baseUsedByChannel = canSkipUsed
    ? collectUsedCCs(bank, excludedKeys)
    : new Map<number, Set<number>>();
  const activeUsedByChannel = new Map<number, Set<number>>();
  for (const [ch, set] of baseUsedByChannel.entries()) {
    activeUsedByChannel.set(ch, new Set(set));
  }

  let scaleNotes: number[] | null = null;
  if (spec.rule.kind === 'scale' && spec.rule.progMode === 'continue') {
    scaleNotes = generateScaleNotes(
      spec.rule.root,
      spec.rule.scaleId,
      sortedPrograms.length * indices.length,
    );
  }

  let globalStepIndex = 0;

  sortedPrograms.forEach((pNum, progIdx) => {
    const progValues: Array<number | PadTriggerMode> = [];
    const channel = nextBank[pNum].channel;

    // For repeat / offset modes, reset self-collision set per program to base non-targeted CCs
    if (
      canSkipUsed &&
      spec.rule.kind === 'sequence' &&
      spec.rule.progMode !== 'continue'
    ) {
      const baseSet = baseUsedByChannel.get(channel) ?? new Set<number>();
      activeUsedByChannel.set(channel, new Set(baseSet));
    }

    let perProgScale: number[] | null = null;
    if (spec.rule.kind === 'scale' && spec.rule.progMode !== 'continue') {
      const rootOffset =
        spec.rule.progMode === 'octave' ? progIdx * 12 * spec.rule.octaveStep : 0;
      perProgScale = generateScaleNotes(
        spec.rule.root + rootOffset,
        spec.rule.scaleId,
        indices.length,
      );
    }

    let seqCursor = 0;
    if (spec.rule.kind === 'sequence') {
      if (spec.rule.progMode === 'continue') {
        seqCursor =
          progIdx === 0
            ? spec.rule.start
            : spec.rule.start + globalStepIndex * spec.rule.step;
      } else if (spec.rule.progMode === 'repeat') {
        seqCursor = spec.rule.start;
      } else {
        seqCursor = spec.rule.start + progIdx * spec.rule.progOffset;
      }
    }

    indices.forEach((ctrlIdx, localIdx) => {
      const before = readControlValue(bank, pNum, controlTarget, ctrlIdx);
      let after: number | PadTriggerMode = before;
      let clamped = false;

      if (spec.rule.kind === 'sequence') {
        let candidate = 0;

        if (canSkipUsed) {
          if (progIdx === 0 && localIdx === 0) {
            candidate = spec.rule.start;
          } else if (localIdx === 0 && spec.rule.progMode !== 'continue') {
            candidate =
              spec.rule.progMode === 'repeat'
                ? spec.rule.start
                : spec.rule.start + progIdx * spec.rule.progOffset;
          } else {
            candidate = seqCursor + spec.rule.step;
          }

          const usedSet = activeUsedByChannel.get(channel) ?? new Set<number>();
          activeUsedByChannel.set(channel, usedSet);
          const stepDir = spec.rule.step === 0 ? 1 : spec.rule.step;
          let guard = 0;
          while (
            candidate >= 0 &&
            candidate <= 127 &&
            usedSet.has(Math.round(candidate)) &&
            guard < 129
          ) {
            candidate += stepDir;
            guard += 1;
          }
          const res = clamp7(candidate);
          after = res.value;
          clamped = res.clamped;
          usedSet.add(res.value);
          seqCursor = candidate;
        } else {
          if (spec.rule.progMode !== 'continue') {
            const base =
              spec.rule.progMode === 'repeat'
                ? spec.rule.start
                : spec.rule.start + progIdx * spec.rule.progOffset;
            candidate = base + localIdx * spec.rule.step;
          } else {
            candidate = spec.rule.start + globalStepIndex * spec.rule.step;
          }
          if (controlTarget === 'pad.mode') {
            after = Math.abs(Math.round(candidate)) % 2 === 1 ? 'toggle' : 'momentary';
          } else {
            const res = clamp7(candidate);
            after = res.value;
            clamped = res.clamped;
          }
        }
        globalStepIndex += 1;
      } else if (spec.rule.kind === 'scale') {
        const noteVal =
          spec.rule.progMode === 'continue'
            ? scaleNotes![globalStepIndex]
            : perProgScale![localIdx];
        if (controlTarget === 'pad.mode') {
          after = noteVal % 2 === 1 ? 'toggle' : 'momentary';
        } else {
          const res = clamp7(noteVal);
          after = res.value;
          clamped = res.clamped;
        }
        globalStepIndex += 1;
      } else if (spec.rule.kind === 'constant') {
        if (controlTarget === 'pad.mode') {
          after =
            spec.rule.value === 'toggle' || spec.rule.value === 1
              ? 'toggle'
              : 'momentary';
        } else {
          const numVal = typeof spec.rule.value === 'number' ? spec.rule.value : 0;
          const res = clamp7(numVal);
          after = res.value;
          clamped = res.clamped;
        }
      } else if (spec.rule.kind === 'shift') {
        if (controlTarget === 'pad.mode') {
          after =
            spec.rule.delta !== 0
              ? before === 'toggle'
                ? 'momentary'
                : 'toggle'
              : before;
        } else {
          const res = clamp7((before as number) + spec.rule.delta);
          after = res.value;
          clamped = res.clamped;
        }
      }

      writeControlValue(nextBank, pNum, controlTarget, ctrlIdx, after);
      progValues.push(after);
      changes.push({
        program: pNum,
        target: controlTarget,
        controlIndex: ctrlIdx,
        before,
        after,
        clamped,
      });
    });

    summaryByProgram[pNum] = formatSummaryValues(controlTarget, progValues);
  });

  return { nextBank, changes, summaryByProgram };
}

export interface DragFillCell {
  program: ProgramNumber;
  controlIndex: number;
}

export function computeDragFill(
  bank: BankState,
  opts: {
    target: Exclude<TargetField, 'program.channel'>;
    anchor: DragFillCell;
    trail: DragFillCell[];
    step?: number;
    copyOnly?: boolean;
  },
): { nextBank: BankState; changes: PatternChange[] } {
  const nextBank = cloneBank(bank);
  const changes: PatternChange[] = [];
  const step = opts.step ?? 1;
  const anchorVal = readControlValue(
    bank,
    opts.anchor.program,
    opts.target,
    opts.anchor.controlIndex,
  );

  const seen = new Set<string>([`${opts.anchor.program}:${opts.anchor.controlIndex}`]);
  const orderedTargets: DragFillCell[] = [];
  for (const cell of opts.trail) {
    const key = `${cell.program}:${cell.controlIndex}`;
    if (!seen.has(key)) {
      seen.add(key);
      orderedTargets.push(cell);
    }
  }

  orderedTargets.forEach((cell, idx) => {
    const before = readControlValue(bank, cell.program, opts.target, cell.controlIndex);
    let after: number | PadTriggerMode;
    let clamped = false;

    if (opts.target === 'pad.mode' || opts.copyOnly) {
      after = anchorVal;
    } else {
      const res = clamp7((anchorVal as number) + (idx + 1) * step);
      after = res.value;
      clamped = res.clamped;
    }

    writeControlValue(nextBank, cell.program, opts.target, cell.controlIndex, after);
    changes.push({
      program: cell.program,
      target: opts.target,
      controlIndex: cell.controlIndex,
      before,
      after,
      clamped,
    });
  });

  return { nextBank, changes };
}

export function findNextFreeCC(bank: BankState, channel: number): number {
  const used = new Set<number>();
  for (const pNum of PROGRAM_NUMBERS) {
    const prog = bank[pNum];
    if (prog.channel !== channel) continue;
    for (const pad of prog.pads) used.add(pad.cc);
    for (const knob of prog.knobs) used.add(knob.cc);
  }

  for (let cc = 0; cc <= 127; cc++) {
    if (!used.has(cc)) return cc;
  }
  return 0;
}

export function getProgramRangeLabel(bank: BankState, program: ProgramNumber): string {
  const prog = bank[program];
  const knobCCs = prog.knobs.map((k) => k.cc);
  const padNotes = prog.pads.map((p) => p.note);

  const kLabel = formatSummaryValues('knob.cc', knobCCs);
  const pLabel = formatSummaryValues('pad.note', padNotes);
  return `Knobs CC ${kLabel} · Pads ${pLabel}`;
}

export function describePatternControlsCount(selectedIndices?: number[]): number {
  return selectedIndices && selectedIndices.length > 0
    ? selectedIndices.length
    : CONTROL_NUMBERS.length;
}
