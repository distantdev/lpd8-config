import type { BankState, ProgramConfig, ProgramNumber } from '../types/lpd8';
import { cloneProgram, createFactoryBank } from '../engine/factoryDefaults';
import {
  LPD8_MANUFACTURER_ID,
  CMD_ACTIVATE_PROGRAM,
  CMD_ACTIVE_PROGRAM,
  CMD_REQUEST_PROGRAM,
  CMD_WRITE_PROGRAM,
  decodeProgramResponse,
  encodeWriteProgram,
  LPD8_DEVICE_ID,
  LPD8_MK1_MODEL_ID,
  SYSEX_END,
  SYSEX_START,
} from './sysex';

export class VirtualLpd8 {
  private slots: BankState;
  private activeProgram: ProgramNumber = 1;
  private onMessage: (bytes: Uint8Array) => void;
  private latencyMs: number;
  private toggleStates: Record<string, boolean> = {};

  constructor(onMessage: (bytes: Uint8Array) => void, latencyMs = 20) {
    this.slots = createFactoryBank();
    this.onMessage = onMessage;
    this.latencyMs = latencyMs;
  }

  setMessageHandler(onMessage: (bytes: Uint8Array) => void): void {
    this.onMessage = onMessage;
  }

  getActiveProgram(): ProgramNumber {
    return this.activeProgram;
  }

  getSlot(program: ProgramNumber): ProgramConfig {
    return cloneProgram(this.slots[program]);
  }

  receive(bytes: Uint8Array): void {
    if (bytes.length < 6 || bytes[0] !== SYSEX_START || bytes[bytes.length - 1] !== SYSEX_END) {
      return;
    }

    // Universal Device Identity Request: F0 7E 00 06 01 F7
    if (bytes[1] === 0x7E && bytes[3] === 0x06 && bytes[4] === 0x01) {
      const reply = new Uint8Array(35);
      reply[0] = SYSEX_START;
      reply[1] = 0x7E;
      reply[2] = 0x00;
      reply[3] = 0x06;
      reply[4] = 0x02;
      reply[5] = LPD8_MANUFACTURER_ID;
      reply[6] = LPD8_MK1_MODEL_ID;
      reply[7] = 0x00;
      reply[8] = 0x19;
      reply[9] = 0x00;
      reply[10] = 0x00;
      reply[11] = 0x00;
      reply[12] = 0x66;
      reply[13] = 0x7F;
      reply[34] = SYSEX_END;
      this.emitDelayed(reply);
      return;
    }

    if (
      bytes[1] !== LPD8_MANUFACTURER_ID ||
      bytes[2] !== LPD8_DEVICE_ID ||
      bytes[3] !== LPD8_MK1_MODEL_ID
    ) {
      return;
    }

    const cmd = bytes[4];

    if (cmd === CMD_WRITE_PROGRAM) {
      const decoded = decodeProgramResponse(bytes);
      if (decoded) {
        this.slots[decoded.program] = cloneProgram(decoded);
      }
      return;
    }

    if (cmd === CMD_ACTIVATE_PROGRAM && bytes.length === 9) {
      const prog = bytes[7];
      if (prog >= 1 && prog <= 4) {
        this.activeProgram = prog as ProgramNumber;
      }
      return;
    }

    if (cmd === CMD_REQUEST_PROGRAM && bytes.length === 9) {
      const prog = bytes[7];
      if (prog >= 1 && prog <= 4) {
        const slot = this.slots[prog as ProgramNumber];
        const response = encodeWriteProgram(slot);
        response[4] = CMD_REQUEST_PROGRAM; // Hardware dump reply uses command 0x63
        this.emitDelayed(response);
      }
      return;
    }

    if (cmd === CMD_ACTIVE_PROGRAM && bytes.length === 8) {
      const reply = new Uint8Array([
        SYSEX_START,
        LPD8_MANUFACTURER_ID,
        LPD8_DEVICE_ID,
        LPD8_MK1_MODEL_ID,
        CMD_ACTIVE_PROGRAM,
        0x00,
        0x01,
        this.activeProgram,
        SYSEX_END,
      ]);
      this.emitDelayed(reply);
    }
  }

  triggerTestPad(padNumber: number, mode: 'note' | 'cc' | 'pc' = 'note'): void {
    const prog = this.slots[this.activeProgram];
    const pad = prog.pads.find((p) => p.number === padNumber);
    if (!pad) return;
    const ch = (prog.channel - 1) & 0x0F;

    if (mode === 'note') {
      if (pad.mode === 'toggle') {
        const key = `${this.activeProgram}:note:${padNumber}`;
        const nextOn = !this.toggleStates[key];
        this.toggleStates[key] = nextOn;
        this.onMessage(new Uint8Array([nextOn ? 0x90 | ch : 0x80 | ch, pad.note & 0x7F, nextOn ? 110 : 0]));
      } else {
        this.onMessage(new Uint8Array([0x90 | ch, pad.note & 0x7F, 112]));
        setTimeout(() => {
          this.onMessage(new Uint8Array([0x80 | ch, pad.note & 0x7F, 0]));
        }, 240);
      }
    } else if (mode === 'cc') {
      this.onMessage(new Uint8Array([0xB0 | ch, pad.cc & 0x7F, 127]));
      if (pad.mode === 'momentary') {
        setTimeout(() => {
          this.onMessage(new Uint8Array([0xB0 | ch, pad.cc & 0x7F, 0]));
        }, 240);
      }
    } else {
      this.onMessage(new Uint8Array([0xC0 | ch, pad.pc & 0x7F]));
    }
  }

  triggerTestKnob(knobNumber: number, normalized = 0.75): void {
    const prog = this.slots[this.activeProgram];
    const knob = prog.knobs.find((k) => k.number === knobNumber);
    if (!knob) return;
    const ch = (prog.channel - 1) & 0x0F;
    const val = Math.round(knob.min + (knob.max - knob.min) * Math.max(0, Math.min(1, normalized)));
    this.onMessage(new Uint8Array([0xB0 | ch, knob.cc & 0x7F, val & 0x7F]));
  }

  private emitDelayed(bytes: Uint8Array): void {
    if (this.latencyMs <= 0) {
      queueMicrotask(() => this.onMessage(bytes));
    } else {
      setTimeout(() => this.onMessage(bytes), this.latencyMs);
    }
  }
}
