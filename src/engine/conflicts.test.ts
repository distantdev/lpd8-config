import { describe, expect, it } from 'vitest';
import { createFactoryBank } from './factoryDefaults';
import { detectConflicts, getControlConflicts } from './conflicts';

describe('Conflict Detector', () => {
  it('flags duplicate CCs across pads and knobs within the same program', () => {
    const bank = createFactoryBank();
    // Make P2 completely distinct first, then inject a collision in P1
    bank[2].channel = 2;
    bank[3].channel = 3;
    bank[4].channel = 4;
    bank[1].knobs[2].cc = bank[1].pads[0].cc; // K3 = CC 9, Pad 1 = CC 9

    const report = detectConflicts(bank);
    expect(report.intraProgram).toHaveLength(1);
    expect(report.intraProgram[0].kind).toBe('cc');
    expect(report.intraProgram[0].value).toBe(9);
    expect(getControlConflicts(report, 1, 'knob', 3)).toHaveLength(1);
    expect(getControlConflicts(report, 1, 'pad', 1)).toHaveLength(1);
  });

  it('flags duplicate pad notes within the same program', () => {
    const bank = createFactoryBank();
    bank[2].channel = 2;
    bank[3].channel = 3;
    bank[4].channel = 4;
    bank[1].pads[0].note = 40;
    bank[1].pads[4].note = 40;

    const report = detectConflicts(bank);
    expect(report.intraProgram).toHaveLength(1);
    expect(report.intraProgram[0].kind).toBe('note');
    expect(report.intraProgram[0].value).toBe(40);
  });

  it('flags cross-program collisions only when channels match, and catches inverted knob ranges', () => {
    const bank = createFactoryBank();
    // P1..P4 all default to Channel 1 -> cross-program collisions exist
    const sameChReport = detectConflicts(bank);
    expect(sameChReport.crossProgram.length).toBeGreaterThan(0);

    // Put each program on a unique channel and invert P3 K4 range
    bank[1].channel = 1;
    bank[2].channel = 2;
    bank[3].channel = 3;
    bank[4].channel = 4;
    bank[3].knobs[3].min = 120;
    bank[3].knobs[3].max = 10;

    const isolatedReport = detectConflicts(bank);
    expect(isolatedReport.crossProgram).toHaveLength(0);
    expect(isolatedReport.intraProgram).toHaveLength(0);
    expect(isolatedReport.invertedRanges).toHaveLength(1);
    expect(isolatedReport.invertedRanges[0].locations[0]).toMatchObject({
      program: 3,
      control: 'knob',
      number: 4,
    });
  });
});
