import { describe, expect, it } from 'vitest';
import { createFactoryProgram } from '../engine/factoryDefaults';
import {
  buildSyxBuffer,
  decodeActiveProgramResponse,
  decodeIdentityResponse,
  decodeProgramResponse,
  describeSysexByte,
  encodeActivateProgram,
  encodeGetActiveProgram,
  encodeIdentityRequest,
  encodeRequestProgram,
  encodeWriteProgram,
  formatHexBytes,
  parseSyxBuffer,
} from './sysex';
import { VirtualLpd8 } from './virtualLpd8';

function parseHexString(hex: string): Uint8Array {
  const tokens = hex.trim().split(/\s+/);
  return new Uint8Array(tokens.map((t) => Number.parseInt(t, 16)));
}

describe('LPD8 Mk1 SysEx Protocol', () => {
  it('encodes exact request/control SysEx commands', () => {
    expect(formatHexBytes(encodeRequestProgram(1))).toBe('F0 47 7F 75 63 00 01 01 F7');
    expect(formatHexBytes(encodeRequestProgram(4))).toBe('F0 47 7F 75 63 00 01 04 F7');
    expect(formatHexBytes(encodeGetActiveProgram())).toBe('F0 47 7F 75 64 00 00 F7');
    expect(formatHexBytes(encodeActivateProgram(2))).toBe('F0 47 7F 75 62 00 01 02 F7');
    expect(formatHexBytes(encodeIdentityRequest())).toBe('F0 7E 00 06 01 F7');
  });

  it('decodes real hardware factory dump from mungewell/mpd-utils (recall_4.lpd8)', () => {
    const dumpHex = [
      'f0 47 7f 75 63 00 3a 04 00 24 00 09 00 25 01 0a',
      '00 26 02 0b 00 27 03 0c 00 28 04 0d 00 29 05 0e',
      '00 2a 06 0f 00 2b 07 10 00 01 00 7f 02 00 7f 03',
      '00 7f 04 00 7f 05 00 7f 06 00 7f 07 00 7f 08 00',
      '7f f7',
    ].join(' ');

    const bytes = parseHexString(dumpHex);
    expect(bytes.length).toBe(66);

    const decoded = decodeProgramResponse(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(createFactoryProgram(4));
  });

  it('decodes and encodes charlesfleche/lpd8editor SYSEX.md example accurately', () => {
    const responseHex =
      'F0 47 7F 75 63 00 3A 01 06 0C 0D 0E 00 0F 10 11 00 12 13 14 01 15 16 17 00 00 01 02 00 03 04 05 00 06 07 08 00 09 0A 0B 00 18 19 1A 1B 1C 1D 1E 1F 20 21 22 23 24 25 26 27 28 29 2A 2B 2C 2D 2E 2F F7';
    const expectedWriteHex =
      'F0 47 7F 75 61 00 3A 04 06 0C 0D 0E 00 0F 10 11 00 12 13 14 01 15 16 17 00 00 01 02 00 03 04 05 00 06 07 08 00 09 0A 0B 00 18 19 1A 1B 1C 1D 1E 1F 20 21 22 23 24 25 26 27 28 29 2A 2B 2C 2D 2E 2F F7';

    const decoded = decodeProgramResponse(parseHexString(responseHex));
    expect(decoded).not.toBeNull();
    expect(decoded!.program).toBe(1);
    expect(decoded!.channel).toBe(7); // 0x06 -> Channel 7
    expect(decoded!.pads[0]).toEqual({ number: 1, note: 12, pc: 13, cc: 14, mode: 'momentary' });
    expect(decoded!.pads[2]).toEqual({ number: 3, note: 18, pc: 19, cc: 20, mode: 'toggle' });
    expect(decoded!.knobs[0]).toEqual({ number: 1, cc: 0x18, min: 0x19, max: 0x1a });
    expect(decoded!.knobs[7]).toEqual({ number: 8, cc: 0x2d, min: 0x2e, max: 0x2f });

    const rewritten = encodeWriteProgram({ ...decoded!, program: 4 });
    expect(formatHexBytes(rewritten)).toBe(expectedWriteHex);
  });

  it('decodes active program response and device identity response', () => {
    const active = decodeActiveProgramResponse(parseHexString('F0 47 7F 75 64 00 01 04 F7'));
    expect(active).toBe(4);

    expect(decodeActiveProgramResponse(parseHexString('F0 47 7F 75 64 00 01 05 F7'))).toBeNull();

    const idHex =
      'F0 7E 00 06 02 47 75 00 19 00 00 00 66 7F 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 F7';
    const identity = decodeIdentityResponse(parseHexString(idHex));
    expect(identity).toEqual({
      manufacturerId: 0x47,
      familyId: 0x75,
      productId: 0x19,
      versionByte: 0x66,
      modelName: 'LPD8 (Mk1)',
      isMk1: true,
    });

    const mk2Identity = decodeIdentityResponse(
      parseHexString('F0 7E 00 06 02 47 4C 00 19 00 00 00 01 00 00 F7'),
    );
    expect(mk2Identity?.isMk1).toBe(false);
    expect(mk2Identity?.modelName).toContain('Mk2');
  });

  it('clamps out-of-range values to 7-bit MIDI bounds when encoding', () => {
    const dirty = createFactoryProgram(2);
    dirty.channel = 99;
    dirty.pads[0].note = 255;
    dirty.pads[0].cc = -5;
    dirty.knobs[0].cc = 200;
    dirty.knobs[0].min = -10;
    dirty.knobs[0].max = 300;

    const encoded = encodeWriteProgram(dirty);
    expect(encoded.length).toBe(66);
    for (let i = 1; i < 65; i++) {
      expect(encoded[i]).toBeGreaterThanOrEqual(0);
      expect(encoded[i]).toBeLessThanOrEqual(127);
    }

    const decoded = decodeProgramResponse(encoded)!;
    expect(decoded.channel).toBe(16);
    expect(decoded.pads[0].note).toBe(127);
    expect(decoded.pads[0].cc).toBe(0);
    expect(decoded.knobs[0]).toEqual({ number: 1, cc: 127, min: 0, max: 127 });
  });

  it('builds and parses multi-program .syx files', () => {
    const p1 = createFactoryProgram(1);
    p1.knobs[0].cc = 0;
    const p2 = createFactoryProgram(2);
    p2.channel = 5;
    p2.pads[7].mode = 'toggle';

    const buffer = buildSyxBuffer([p1, p2]);
    expect(buffer.length).toBe(132);

    const parsed = parseSyxBuffer(buffer);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(p1);
    expect(parsed[1]).toEqual(p2);
  });

  it('describes every byte position accurately for the SysEx inspector', () => {
    expect(describeSysexByte(0, 0xf0).section).toBe('header');
    expect(describeSysexByte(7, 2).label).toBe('Prog 2');
    expect(describeSysexByte(8, 9).label).toBe('Ch 10');
    expect(describeSysexByte(9, 36).label).toBe('P1 Note');
    expect(describeSysexByte(40, 1).label).toBe('P8 Mode');
    expect(describeSysexByte(41, 7).label).toBe('K1 CC');
    expect(describeSysexByte(64, 127).label).toBe('K8 Max');
    expect(describeSysexByte(65, 0xf7).section).toBe('end');
  });

  it('round-trips programs through VirtualLpd8 hardware simulator', async () => {
    const responses: Uint8Array[] = [];
    const sim = new VirtualLpd8((msg) => responses.push(msg), 0);

    sim.receive(encodeIdentityRequest());
    await new Promise((r) => setTimeout(r, 10));
    expect(decodeIdentityResponse(responses.pop()!)?.isMk1).toBe(true);

    const custom = createFactoryProgram(3);
    custom.channel = 10;
    custom.knobs.forEach((k, idx) => {
      k.cc = 16 + idx;
      k.min = 10;
      k.max = 110;
    });
    custom.pads[3].mode = 'toggle';

    sim.receive(encodeWriteProgram(custom));
    await new Promise((r) => setTimeout(r, 10));

    sim.receive(encodeRequestProgram(3));
    await new Promise((r) => setTimeout(r, 10));
    const readBack = decodeProgramResponse(responses.pop()!);
    expect(readBack).toEqual(custom);

    sim.receive(encodeActivateProgram(3));
    sim.receive(encodeGetActiveProgram());
    await new Promise((r) => setTimeout(r, 10));
    expect(decodeActiveProgramResponse(responses.pop()!)).toBe(3);
  });
});
