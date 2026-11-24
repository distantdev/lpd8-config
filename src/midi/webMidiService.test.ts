import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFactoryProgram } from '../engine/factoryDefaults';
import { encodeWriteProgram } from './sysex';
import { VirtualLpd8 } from './virtualLpd8';
import { WebMidiService } from './webMidiService';

interface MockPortBase {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
  connection: 'open' | 'closed' | 'pending';
  open: ReturnType<typeof vi.fn>;
}

interface MockMidiInput extends MockPortBase {
  onmidimessage: ((ev: { data: Uint8Array }) => void) | null;
}

interface MockMidiOutput extends MockPortBase {
  send: ReturnType<typeof vi.fn>;
}

function createMockMidiEnvironment(
  inputsList: Array<{ id: string; name: string }>,
  outputsList: Array<{ id: string; name: string; onSend?: (bytes: Uint8Array) => void }>,
) {
  const inputs = new Map<string, MockMidiInput>();
  const outputs = new Map<string, MockMidiOutput>();

  for (const spec of inputsList) {
    const port: MockMidiInput = {
      id: spec.id,
      name: spec.name,
      manufacturer: 'Test',
      state: 'connected',
      connection: 'closed',
      onmidimessage: null,
      open: vi.fn(async () => {
        port.connection = 'open';
        return port;
      }),
    };
    inputs.set(spec.id, port);
  }

  for (const spec of outputsList) {
    const port: MockMidiOutput = {
      id: spec.id,
      name: spec.name,
      manufacturer: 'Test',
      state: 'connected',
      connection: 'closed',
      open: vi.fn(async () => {
        port.connection = 'open';
        return port;
      }),
      send: vi.fn((data: Uint8Array | number[]) => {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        spec.onSend?.(bytes);
      }),
    };
    outputs.set(spec.id, port);
  }

  const midiAccess = {
    inputs,
    outputs,
    onstatechange: null as (() => void) | null,
  };

  vi.stubGlobal('navigator', {
    requestMIDIAccess: vi.fn(async () => midiAccess),
  });

  return { inputs, outputs, midiAccess };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebMidiService', () => {
  it('reassembles fragmented incoming SysEx replies across 32B+34B and 64B+2B chunks', async () => {
    const expectedP1 = createFactoryProgram(1);
    expectedP1.channel = 5;
    expectedP1.knobs[0].cc = 21;

    const fullDump = encodeWriteProgram(expectedP1);
    fullDump[4] = 0x63;

    let chunkMode: 'split32' | 'split64' = 'split32';
    let mockIn: MockMidiInput | undefined;

    const env = createMockMidiEnvironment(
      [{ id: 'in-lpd8', name: 'LPD8' }],
      [
        {
          id: 'out-lpd8',
          name: 'LPD8',
          onSend: () => {
            const cut = chunkMode === 'split32' ? 32 : 64;
            queueMicrotask(() => {
              mockIn?.onmidimessage?.({ data: fullDump.slice(0, cut) });
              mockIn?.onmidimessage?.({ data: new Uint8Array([0xF8]) });
              mockIn?.onmidimessage?.({ data: fullDump.slice(cut) });
            });
          },
        },
      ],
    );
    mockIn = env.inputs.get('in-lpd8');

    const service = new WebMidiService();
    await service.connectHardware();

    chunkMode = 'split32';
    expect(await service.pullProgram(1)).toEqual(expectedP1);

    chunkMode = 'split64';
    expect(await service.pullProgram(1)).toEqual(expectedP1);
  });

  it('explicitly opens input and output ports before transmitting SysEx', async () => {
    const events: string[] = [];
    let mockIn!: MockMidiInput;
    let mockOut!: MockMidiOutput;

    const sim = new VirtualLpd8((reply) => {
      queueMicrotask(() => mockIn.onmidimessage?.({ data: reply }));
    }, 0);

    const env = createMockMidiEnvironment(
      [{ id: 'in-0', name: 'LPD8' }],
      [
        {
          id: 'out-0',
          name: 'LPD8',
          onSend: (bytes) => {
            events.push(`send:${mockIn.connection}:${mockOut.connection}`);
            sim.receive(bytes);
          },
        },
      ],
    );
    mockIn = env.inputs.get('in-0')!;
    mockOut = env.outputs.get('out-0')!;

    mockIn.open = vi.fn(async () => {
      events.push('open-in');
      mockIn.connection = 'open';
      return mockIn;
    });
    mockOut.open = vi.fn(async () => {
      events.push('open-out');
      mockOut.connection = 'open';
      return mockOut;
    });

    const service = new WebMidiService();
    await service.connectHardware();
    const prog = await service.pullProgram(1);

    expect(prog.program).toBe(1);
    expect(mockIn.open).toHaveBeenCalled();
    expect(mockOut.open).toHaveBeenCalled();
    expect(events[0]).toBe('open-in');
    expect(events[1]).toBe('open-out');
    expect(events).toContain('send:open:open');
  });

  it('flashes P1-P4, verifies each via 0x63, and restores active program via 0x62', async () => {
    const txPackets: Uint8Array[] = [];
    let mockIn!: MockMidiInput;

    const sim = new VirtualLpd8((reply) => {
      queueMicrotask(() => mockIn.onmidimessage?.({ data: reply }));
    }, 0);

    const env = createMockMidiEnvironment(
      [{ id: 'in-0', name: 'LPD8' }],
      [
        {
          id: 'out-0',
          name: 'LPD8',
          onSend: (bytes) => {
            txPackets.push(bytes);
            if (bytes[4] === 0x61) {
              // Simulate hardware switching active slot to the last written program.
              sim.receive(new Uint8Array([0xF0, 0x47, 0x7F, 0x75, 0x62, 0x00, 0x01, bytes[7], 0xF7]));
            }
            sim.receive(bytes);
          },
        },
      ],
    );
    mockIn = env.inputs.get('in-0')!;

    const service = new WebMidiService();
    await service.connectHardware();

    const targets = ([1, 2, 3, 4] as const).map((p) => {
      const cfg = createFactoryProgram(p);
      cfg.knobs.forEach((k, idx) => {
        k.cc = (p - 1) * 8 + idx;
      });
      return cfg;
    });

    const results = await service.flashPrograms(targets, {
      delayMs: 0,
      verify: true,
      restoreActiveProgram: 1,
    });

    expect(results).toEqual([
      { program: 1, written: true, verified: true },
      { program: 2, written: true, verified: true },
      { program: 3, written: true, verified: true },
      { program: 4, written: true, verified: true },
    ]);

    expect(txPackets.map((p) => [p[4], p[7]])).toEqual([
      [0x61, 1],
      [0x63, 1],
      [0x61, 2],
      [0x63, 2],
      [0x61, 3],
      [0x63, 3],
      [0x61, 4],
      [0x63, 4],
      [0x62, 1],
    ]);
    expect(sim.getActiveProgram()).toBe(1);
    expect(await service.getActiveProgram()).toBe(1);
  });

  it('ignores Microsoft GS Wavetable Synth when auto-selecting a single fallback output port', async () => {
    createMockMidiEnvironment(
      [{ id: 'in-usb', name: 'USB2.0-MIDI' }],
      [
        { id: 'out-gs', name: 'Microsoft GS Wavetable Synth' },
        { id: 'out-usb', name: 'USB2.0-MIDI' },
      ],
    );

    const service = new WebMidiService();
    const { autoMatched } = await service.connectHardware();

    expect(autoMatched).toBe(false);
    expect(service.getSelectedPortIds()).toEqual({
      inputId: 'in-usb',
      outputId: 'out-usb',
    });
  });

  it('reports port-lock error cleanly in FlashResult when open() fails', async () => {
    const env = createMockMidiEnvironment(
      [{ id: 'in-0', name: 'LPD8' }],
      [{ id: 'out-0', name: 'LPD8' }],
    );
    const outPort = env.outputs.get('out-0')!;
    outPort.open = vi.fn(async () => {
      throw new Error('Device in use');
    });

    const service = new WebMidiService();
    await service.connectHardware();
    const results = await service.flashPrograms([createFactoryProgram(1)], {
      delayMs: 0,
      verify: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].written).toBe(false);
    expect(results[0].verified).toBe(false);
    expect(results[0].error).toContain('another app or DAW on Windows may be locking it');
  });
});
