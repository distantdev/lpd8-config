import { describe, expect, it } from 'vitest';
import { createFactoryBank } from './factoryDefaults';
import { detectConflicts, getControlConflicts } from './conflicts';
import {
  computeDragFill,
  computePatternPreview,
  findNextFreeCC,
  getProgramRangeLabel,
} from './patternEngine';

describe('Pattern Engine', () => {
  it('fills Knob CCs 0-7 in Prog 1, 8-15 in Prog 2, 16-23 in Prog 3, 24-31 in Prog 4', () => {
    const bank = createFactoryBank();
    const res = computePatternPreview(bank, {
      target: 'knob.cc',
      programs: [1, 2, 3, 4],
      order: 'hardware',
      rule: {
        kind: 'sequence',
        start: 0,
        step: 1,
        progMode: 'continue',
        progOffset: 8,
        skipUsed: false,
      },
    });

    expect(res.nextBank[1].knobs.map((k) => k.cc)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(res.nextBank[2].knobs.map((k) => k.cc)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(res.nextBank[3].knobs.map((k) => k.cc)).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
    expect(res.nextBank[4].knobs.map((k) => k.cc)).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);

    expect(res.summaryByProgram[1]).toBe('0–7');
    expect(res.summaryByProgram[2]).toBe('8–15');
    expect(res.summaryByProgram[3]).toBe('16–23');
    expect(res.summaryByProgram[4]).toBe('24–31');
    expect(res.changes).toHaveLength(32);
  });

  it('supports visual top-to-bottom pad traversal order (Pad 5..8 then Pad 1..4)', () => {
    const bank = createFactoryBank();
    const res = computePatternPreview(bank, {
      target: 'pad.note',
      programs: [1],
      order: 'visual',
      rule: {
        kind: 'scale',
        root: 60,
        scaleId: 'major',
        progMode: 'repeat',
        octaveStep: 1,
      },
    });

    // Top row: Pad 5, 6, 7, 8 -> C4(60), D4(62), E4(64), F4(65)
    // Bottom row: Pad 1, 2, 3, 4 -> G4(67), A4(69), B4(71), C5(72)
    const byNum = Object.fromEntries(res.nextBank[1].pads.map((p) => [p.number, p.note]));
    expect([byNum[5], byNum[6], byNum[7], byNum[8]]).toEqual([60, 62, 64, 65]);
    expect([byNum[1], byNum[2], byNum[3], byNum[4]]).toEqual([67, 69, 71, 72]);
  });

  it('skips used CCs on the same MIDI channel when skipUsed is enabled', () => {
    const bank = createFactoryBank();
    // Put P3 & P4 on separate channels so only P1 & P2 share Ch 1 (with Pad CCs 9..16)
    bank[3].channel = 3;
    bank[4].channel = 4;
    const res = computePatternPreview(bank, {
      target: 'knob.cc',
      programs: [1, 2],
      order: 'hardware',
      rule: {
        kind: 'sequence',
        start: 5,
        step: 1,
        progMode: 'continue',
        progOffset: 8,
        skipUsed: true,
      },
    });

    // Should assign 5, 6, 7, 8, then skip 9..16 (used by pads on Ch 1), continuing at 17..20
    expect(res.nextBank[1].knobs.map((k) => k.cc)).toEqual([5, 6, 7, 8, 17, 18, 19, 20]);
    expect(res.nextBank[2].knobs.map((k) => k.cc)).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);
  });

  it('handles offset, constant, shift, channel sequences, and clamping', () => {
    const bank = createFactoryBank();
    const shifted = computePatternPreview(bank, {
      target: 'pad.note',
      programs: [1],
      selectedIndices: [1, 2],
      order: 'hardware',
      rule: { kind: 'shift', delta: 100 },
    });
    expect(shifted.nextBank[1].pads[0].note).toBe(127);
    expect(shifted.nextBank[1].pads[1].note).toBe(127);
    expect(shifted.nextBank[1].pads[2].note).toBe(38); // untouched
    expect(shifted.changes[0].clamped).toBe(true);

    const channels = computePatternPreview(bank, {
      target: 'program.channel',
      programs: [1, 2, 3, 4],
      order: 'hardware',
      rule: {
        kind: 'sequence',
        start: 1,
        step: 1,
        progMode: 'continue',
        progOffset: 1,
        skipUsed: false,
      },
    });
    expect([
      channels.nextBank[1].channel,
      channels.nextBank[2].channel,
      channels.nextBank[3].channel,
      channels.nextBank[4].channel,
    ]).toEqual([1, 2, 3, 4]);
  });

  it('computes drag-to-fill incrementing across controls and across programs', () => {
    const bank = createFactoryBank();
    bank[1].knobs[6].cc = 20;

    const dragRes = computeDragFill(bank, {
      target: 'knob.cc',
      anchor: { program: 1, controlIndex: 7 },
      trail: [
        { program: 1, controlIndex: 7 }, // included anchor in pointer trail should be ignored
        { program: 1, controlIndex: 8 },
        { program: 2, controlIndex: 1 },
        { program: 2, controlIndex: 2 },
      ],
    });

    expect(dragRes.nextBank[1].knobs[6].cc).toBe(20);
    expect(dragRes.nextBank[1].knobs[7].cc).toBe(21);
    expect(dragRes.nextBank[2].knobs[0].cc).toBe(22);
    expect(dragRes.nextBank[2].knobs[1].cc).toBe(23);

    const copyRes = computeDragFill(bank, {
      target: 'knob.cc',
      anchor: { program: 1, controlIndex: 7 },
      trail: [
        { program: 1, controlIndex: 8 },
        { program: 2, controlIndex: 1 },
      ],
      copyOnly: true,
    });
    expect(copyRes.nextBank[1].knobs[7].cc).toBe(20);
    expect(copyRes.nextBank[2].knobs[0].cc).toBe(20);
  });

  it('finds next free CC on a channel and formats program summary', () => {
    const bank = createFactoryBank();
    bank[2].channel = 2;
    bank[3].channel = 3;
    bank[4].channel = 4;
    // P1 Ch 1 uses CC 1..8 (knobs) and 9..16 (pads), so CC 0 is free
    expect(findNextFreeCC(bank, 1)).toBe(0);
    bank[1].knobs[0].cc = 0; // now 0 and 2..16 are used on Ch 1; 1 is free
    expect(findNextFreeCC(bank, 1)).toBe(1);
    expect(getProgramRangeLabel(bank, 1)).toContain('Pads C2–G2');
  });
});

describe('Conflict Detector', () => {
  it('detects intra-program CC collisions, cross-program collisions, and inverted knob ranges', () => {
    const bank = createFactoryBank();
    // Create an intra-program CC conflict between K1 and Pad 1 in P1
    bank[1].knobs[0].cc = 9;
    // Create an inverted knob range on P1 K2
    bank[1].knobs[1].min = 100;
    bank[1].knobs[1].max = 20;

    const report = detectConflicts(bank);
    expect(report.intraProgram.some((c) => c.kind === 'cc' && c.value === 9)).toBe(true);
    expect(report.invertedRanges).toHaveLength(1);
    expect(report.crossProgram.length).toBeGreaterThan(0);

    const k1Conflicts = getControlConflicts(report, 1, 'knob', 1);
    expect(k1Conflicts.some((c) => c.scope === 'intra')).toBe(true);
  });
});
