import type {
  DeviceIdentity,
  FlashResult,
  LiveMidiActivity,
  MidiLogEntry,
  ProgramConfig,
  ProgramNumber,
} from '../types/lpd8';
import { PROGRAM_NUMBERS, programsEqual } from '../engine/factoryDefaults';
import {
  decodeActiveProgramResponse,
  decodeIdentityResponse,
  decodeProgramResponse,
  encodeActivateProgram,
  encodeGetActiveProgram,
  encodeIdentityRequest,
  encodeRequestProgram,
  encodeWriteProgram,
  SYSEX_END,
  SYSEX_START,
} from './sysex';

export type ConnectionMode = 'disconnected' | 'hardware';

export interface MidiPortInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiServiceListeners {
  onPortsChange?: (inputs: MidiPortInfo[], outputs: MidiPortInfo[]) => void;
  onLog?: (entry: MidiLogEntry) => void;
  onLiveActivity?: (activity: LiveMidiActivity) => void;
  onConnectionError?: (message: string) => void;
}

interface PendingWaiter<T> {
  match: (bytes: Uint8Array) => T | null;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebMidiService {
  private midiAccess: MIDIAccess | null = null;
  private selectedInput: MIDIInput | null = null;
  private selectedOutput: MIDIOutput | null = null;
  private mode: ConnectionMode = 'disconnected';
  private listeners: MidiServiceListeners = {};
  private waiters: PendingWaiter<unknown>[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private logIdCounter = 1;

  constructor(listeners: MidiServiceListeners = {}) {
    this.listeners = listeners;
  }

  setListeners(listeners: MidiServiceListeners): void {
    this.listeners = listeners;
  }

  static isWebMidiSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  getMode(): ConnectionMode {
    return this.mode;
  }

  getSelectedPortIds(): { inputId: string | null; outputId: string | null } {
    return {
      inputId: this.selectedInput?.id ?? null,
      outputId: this.selectedOutput?.id ?? null,
    };
  }

  getPorts(): { inputs: MidiPortInfo[]; outputs: MidiPortInfo[] } {
    if (!this.midiAccess) {
      return { inputs: [], outputs: [] };
    }
    const inputs: MidiPortInfo[] = [];
    const outputs: MidiPortInfo[] = [];
    this.midiAccess.inputs.forEach((input) => {
      inputs.push({
        id: input.id,
        name: input.name || 'Unnamed MIDI In',
        manufacturer: input.manufacturer || '',
      });
    });
    this.midiAccess.outputs.forEach((output) => {
      outputs.push({
        id: output.id,
        name: output.name || 'Unnamed MIDI Out',
        manufacturer: output.manufacturer || '',
      });
    });
    return { inputs, outputs };
  }

  async connectHardware(): Promise<{
    inputs: MidiPortInfo[];
    outputs: MidiPortInfo[];
    autoMatched: boolean;
  }> {
    if (!WebMidiService.isWebMidiSupported()) {
      throw new Error(
        'WebMIDI is not available in this browser. Open this page in Chrome, Edge, or Opera over localhost or HTTPS.',
      );
    }

    if (!this.midiAccess) {
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'SysEx MIDI permission was denied by the browser.';
        throw new Error(`Could not obtain WebMIDI SysEx access: ${msg}`);
      }

      this.midiAccess.onstatechange = () => {
        const ports = this.getPorts();
        this.listeners.onPortsChange?.(ports.inputs, ports.outputs);
        if (this.mode === 'hardware') {
          const inStillExists =
            this.selectedInput && this.midiAccess?.inputs.has(this.selectedInput.id);
          const outStillExists =
            this.selectedOutput && this.midiAccess?.outputs.has(this.selectedOutput.id);
          if (!inStillExists || !outStillExists) {
            this.autoSelectLpd8Ports();
          }
        }
      };
    }

    this.mode = 'hardware';
    const ports = this.getPorts();
    this.listeners.onPortsChange?.(ports.inputs, ports.outputs);
    const autoMatched = this.autoSelectLpd8Ports();
    this.emitLog(
      'info',
      autoMatched
        ? `Connected to ${this.selectedInput?.name}`
        : 'WebMIDI ready — select your LPD8 In/Out ports',
    );
    return { ...ports, autoMatched };
  }

  disconnect(): void {
    this.detachHardwareListeners();
    this.mode = 'disconnected';
    this.emitLog('info', 'MIDI disconnected');
  }

  selectPorts(inputId: string | null, outputId: string | null): void {
    if (!this.midiAccess) return;
    this.detachHardwareListeners();

    if (inputId) {
      const input = this.midiAccess.inputs.get(inputId) ?? null;
      this.selectedInput = input;
      if (input) {
        input.onmidimessage = (event) => {
          if (event.data) {
            this.handleIncomingBytes(event.data);
          }
        };
      }
    }
    if (outputId) {
      this.selectedOutput = this.midiAccess.outputs.get(outputId) ?? null;
    }

    if (this.selectedInput && this.selectedOutput) {
      this.mode = 'hardware';
    }
  }

  private autoSelectLpd8Ports(): boolean {
    if (!this.midiAccess) return false;
    let matchedIn: MIDIInput | null = null;
    let matchedOut: MIDIOutput | null = null;

    this.midiAccess.inputs.forEach((input) => {
      if (!matchedIn && /lpd8/i.test(input.name || '')) {
        matchedIn = input;
      }
    });
    this.midiAccess.outputs.forEach((output) => {
      if (!matchedOut && /lpd8/i.test(output.name || '')) {
        matchedOut = output;
      }
    });

    if (!matchedIn && this.midiAccess.inputs.size === 1) {
      matchedIn = this.midiAccess.inputs.values().next().value ?? null;
    }
    if (!matchedOut && this.midiAccess.outputs.size === 1) {
      matchedOut = this.midiAccess.outputs.values().next().value ?? null;
    }

    const inId = matchedIn ? (matchedIn as MIDIInput).id : null;
    const outId = matchedOut ? (matchedOut as MIDIOutput).id : null;
    this.selectPorts(inId, outId);
    return Boolean(matchedIn && matchedOut && /lpd8/i.test((matchedIn as MIDIInput).name || ''));
  }

  private detachHardwareListeners(): void {
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
    }
    this.selectedInput = null;
    this.selectedOutput = null;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private sendRaw(bytes: Uint8Array, label: string): void {
    if (this.mode === 'disconnected') {
      throw new Error('No MIDI device connected. Connect your LPD8 first.');
    }

    this.emitLog('tx', label, Array.from(bytes));

    if (!this.selectedOutput) {
      throw new Error('No MIDI Output port selected.');
    }
    this.selectedOutput.send(bytes);
  }

  private waitForReply<T>(
    match: (bytes: Uint8Array) => T | null,
    timeoutMs: number,
    timeoutLabel: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error(timeoutLabel));
      }, timeoutMs);

      const waiter: PendingWaiter<T> = {
        match,
        resolve: (value: T) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      };
      this.waiters.push(waiter as PendingWaiter<unknown>);
    });
  }

  private handleIncomingBytes(raw: Uint8Array): void {
    if (raw.length === 0) return;

    if (raw[0] === SYSEX_START && raw[raw.length - 1] === SYSEX_END) {
      this.emitLog('rx', this.labelIncomingSysex(raw), Array.from(raw));
      for (let i = 0; i < this.waiters.length; i++) {
        const waiter = this.waiters[i];
        const parsed = waiter.match(raw);
        if (parsed !== null) {
          this.waiters.splice(i, 1);
          waiter.resolve(parsed);
          return;
        }
      }
      return;
    }

    const status = raw[0] & 0xF0;
    const channel = (raw[0] & 0x0F) + 1;
    const d1 = raw[1] ?? 0;
    const d2 = raw[2] ?? 0;

    if (status === 0x90) {
      const active = d2 > 0;
      this.emitLog('rx', `Note ${active ? 'On' : 'Off'} Ch${channel} #${d1} vel=${d2}`, Array.from(raw));
      this.listeners.onLiveActivity?.({
        kind: 'note',
        channel,
        number: d1,
        value: d2,
        active,
        timestamp: Date.now(),
      });
    } else if (status === 0x80) {
      this.emitLog('rx', `Note Off Ch${channel} #${d1}`, Array.from(raw));
      this.listeners.onLiveActivity?.({
        kind: 'note',
        channel,
        number: d1,
        value: 0,
        active: false,
        timestamp: Date.now(),
      });
    } else if (status === 0xB0) {
      this.emitLog('rx', `CC Ch${channel} #${d1} = ${d2}`, Array.from(raw));
      this.listeners.onLiveActivity?.({
        kind: 'cc',
        channel,
        number: d1,
        value: d2,
        active: true,
        timestamp: Date.now(),
      });
    } else if (status === 0xC0) {
      this.emitLog('rx', `PC Ch${channel} #${d1}`, Array.from(raw));
      this.listeners.onLiveActivity?.({
        kind: 'pc',
        channel,
        number: d1,
        value: 127,
        active: true,
        timestamp: Date.now(),
      });
    }
  }

  private labelIncomingSysex(bytes: Uint8Array): string {
    if (bytes[1] === 0x7E && bytes[3] === 0x06 && bytes[4] === 0x02) {
      return 'Identity Reply';
    }
    if (bytes[4] === 0x63 && bytes.length === 66) {
      return `Program ${bytes[7]} Dump (66B)`;
    }
    if (bytes[4] === 0x64 && bytes.length === 9) {
      return `Active Program = ${bytes[7]}`;
    }
    return `SysEx RX (${bytes.length}B)`;
  }

  private emitLog(
    direction: MidiLogEntry['direction'],
    label: string,
    bytes?: number[],
  ): void {
    this.listeners.onLog?.({
      id: this.logIdCounter++,
      timestamp: Date.now(),
      direction,
      label,
      bytes,
    });
  }

  queryIdentity(): Promise<DeviceIdentity | null> {
    return this.enqueue(async () => {
      try {
        const waitPromise = this.waitForReply(
          (bytes) => decodeIdentityResponse(bytes),
          600,
          'Device identity timeout',
        );
        this.sendRaw(encodeIdentityRequest(), 'Query Device Identity');
        return await waitPromise;
      } catch {
        return null;
      }
    });
  }

  getActiveProgram(): Promise<ProgramNumber> {
    return this.enqueue(async () => {
      const waitPromise = this.waitForReply(
        (bytes) => decodeActiveProgramResponse(bytes),
        1200,
        'Timed out waiting for Active Program response',
      );
      this.sendRaw(encodeGetActiveProgram(), 'Get Active Program');
      return await waitPromise;
    });
  }

  activateProgram(program: ProgramNumber): Promise<void> {
    return this.enqueue(async () => {
      this.sendRaw(encodeActivateProgram(program), `Activate Program ${program}`);
      await delay(25);
    });
  }

  pullProgram(program: ProgramNumber): Promise<ProgramConfig> {
    return this.enqueue(() => this.pullProgramInternal(program));
  }

  private async pullProgramInternal(program: ProgramNumber): Promise<ProgramConfig> {
    const attempt = async (): Promise<ProgramConfig> => {
      const waitPromise = this.waitForReply((bytes) => {
        const decoded = decodeProgramResponse(bytes);
        if (decoded && decoded.program === program) {
          return decoded;
        }
        return null;
      }, 1500, `Timed out reading Program ${program} from LPD8`);
      this.sendRaw(encodeRequestProgram(program), `Request Program ${program}`);
      return await waitPromise;
    };

    try {
      return await attempt();
    } catch {
      this.emitLog('info', `Retrying Program ${program} dump request...`);
      await delay(60);
      return await attempt();
    }
  }

  async pullPrograms(
    programs: ProgramNumber[] = [...PROGRAM_NUMBERS],
    onProgress?: (done: number, total: number, current: ProgramNumber) => void,
  ): Promise<Partial<Record<ProgramNumber, ProgramConfig>>> {
    const result: Partial<Record<ProgramNumber, ProgramConfig>> = {};
    for (let i = 0; i < programs.length; i++) {
      const prog = programs[i];
      onProgress?.(i, programs.length, prog);
      result[prog] = await this.pullProgram(prog);
      if (i < programs.length - 1) {
        await delay(50);
      }
    }
    onProgress?.(programs.length, programs.length, programs[programs.length - 1]);
    return result;
  }

  flashPrograms(
    programs: ProgramConfig[],
    opts: {
      delayMs?: number;
      verify?: boolean;
      onProgress?: (done: number, total: number, current: ProgramNumber, phase: 'writing' | 'verifying') => void;
    } = {},
  ): Promise<FlashResult[]> {
    const delayMs = opts.delayMs ?? 200;
    const verify = opts.verify ?? true;

    return this.enqueue(async () => {
      const results: FlashResult[] = [];
      for (let i = 0; i < programs.length; i++) {
        const config = programs[i];
        opts.onProgress?.(i, programs.length, config.program, 'writing');
        try {
          const packet = encodeWriteProgram(config);
          this.sendRaw(packet, `Flash Program ${config.program} (66B)`);
          await delay(delayMs);

          let verified: boolean | null = null;
          if (verify) {
            opts.onProgress?.(i, programs.length, config.program, 'verifying');
            const readBack = await this.pullProgramInternal(config.program);
            const expected = decodeProgramResponse(packet)!;
            verified = programsEqual(expected, readBack);
            if (!verified) {
              this.emitLog('error', `Verify mismatch on Program ${config.program}`);
            }
          }

          results.push({
            program: config.program,
            written: true,
            verified,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown MIDI error';
          this.emitLog('error', `Flash failed on Program ${config.program}: ${msg}`);
          results.push({
            program: config.program,
            written: false,
            verified: false,
            error: msg,
          });
        }
      }
      if (programs.length > 0) {
        opts.onProgress?.(
          programs.length,
          programs.length,
          programs[programs.length - 1].program,
          verify ? 'verifying' : 'writing',
        );
      }
      return results;
    });
  }
}
