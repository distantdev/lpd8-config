import React, { useState } from 'react';
import type { BankState, HardwareSnapshot, ProgramNumber } from '../types/lpd8';
import { countProgramDiffs, PROGRAM_NUMBERS } from '../engine/factoryDefaults';
import { getProgramRangeLabel } from '../engine/patternEngine';
import { PopoverOrSheet } from './PopoverOrSheet';
import { TouchStepper } from './TouchStepper';

interface ProgramStripProps {
  bank: BankState;
  hardwareSnapshot: HardwareSnapshot;
  focusedProgram: ProgramNumber;
  activeHardwareProgram: ProgramNumber | null;
  isConnected: boolean;
  previewSummaryByProgram: Record<ProgramNumber, string>;
  previewChannelByProgram: Partial<Record<ProgramNumber, number>>;
  onFocusProgram: (prog: ProgramNumber) => void;
  onChangeChannel: (prog: ProgramNumber, channel: number) => void;
  onActivateProgram: (prog: ProgramNumber) => void;
  onCopyProgram: (from: ProgramNumber, to: ProgramNumber) => void;
  onSwapPrograms: (a: ProgramNumber, b: ProgramNumber) => void;
}

export const ProgramStrip: React.FC<ProgramStripProps> = ({
  bank,
  hardwareSnapshot,
  focusedProgram,
  activeHardwareProgram,
  isConnected,
  previewSummaryByProgram,
  previewChannelByProgram,
  onFocusProgram,
  onChangeChannel,
  onActivateProgram,
  onCopyProgram,
  onSwapPrograms,
}) => {
  const [slotMenuOpen, setSlotMenuOpen] = useState(false);

  const focused = bank[focusedProgram];
  const focusedSnap = hardwareSnapshot[focusedProgram];
  const focusedDiffs = focusedSnap ? countProgramDiffs(focused, focusedSnap) : null;
  const previewCh = previewChannelByProgram[focusedProgram] ?? null;

  return (
    <section className="program-strip-wrap" aria-label="Program Slots">
      {/* 4-Tab Horizontal Program Switcher (always 1 row across all screens) */}
      <div className="program-tabs" role="tablist" aria-label="Program 1 to 4">
        {PROGRAM_NUMBERS.map((pNum) => {
          const prog = bank[pNum];
          const hwSnap = hardwareSnapshot[pNum];
          const diffs = hwSnap ? countProgramDiffs(prog, hwSnap) : null;
          const isFocused = focusedProgram === pNum;
          const isHwActive = activeHardwareProgram === pNum;
          const previewSummary = previewSummaryByProgram[pNum];

          const dotClass =
            diffs === null
              ? 'sync-dot--local'
              : diffs === 0
                ? 'sync-dot--ok'
                : 'sync-dot--dirty';

          const dotTitle =
            diffs === null
              ? 'Local draft'
              : diffs === 0
                ? 'Synced with device'
                : `${diffs} unsaved change(s)`;

          return (
            <button
              key={pNum}
              type="button"
              role="tab"
              aria-selected={isFocused}
              className={`prog-tab ${isFocused ? 'is-focused' : ''} ${
                previewSummary ? 'has-preview' : ''
              }`}
              onClick={() => onFocusProgram(pNum)}
            >
              <div className="prog-tab__top">
                <span className="prog-tab__name">
                  <span className="prog-tab__name-short">P{pNum}</span>
                  <span className="prog-tab__name-long">Program {pNum}</span>
                </span>
                <span className="prog-tab__dots">
                  {isHwActive && (
                    <span className="hw-live-dot" title="Active on LPD8 hardware">
                      LIVE
                    </span>
                  )}
                  <span className={`sync-dot ${dotClass}`} title={dotTitle} />
                </span>
              </div>

              <div className="prog-tab__sub">
                Ch {prog.channel}
                <span className="prog-tab__summary-desktop">
                  {' · '}
                  {getProgramRangeLabel(bank, pNum)}
                </span>
              </div>

              {previewSummary && (
                <div className="prog-tab__preview">→ {previewSummary}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Compact Focused Program Context Bar */}
      <div className="prog-context-bar">
        <div className="prog-context-bar__left">
          <span className="field-inline">
            <span>Prog {focusedProgram} MIDI Ch</span>
            <TouchStepper
              value={focused.channel}
              min={1}
              max={16}
              compact
              ariaLabel={`Program ${focusedProgram} MIDI Channel`}
              onChange={(ch) => onChangeChannel(focusedProgram, ch)}
            />
            {previewCh !== null && previewCh !== focused.channel && (
              <span className="scrub-pill__preview">→ Ch {previewCh}</span>
            )}
          </span>

          {focusedDiffs === null ? (
            <span className="sync-badge is-local">Local draft</span>
          ) : focusedDiffs === 0 ? (
            <span className="sync-badge is-synced">Synced ✓</span>
          ) : (
            <span className="sync-badge is-dirty">{focusedDiffs} unsaved</span>
          )}
        </div>

        <div className="prog-context-bar__right">
          {isConnected && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={activeHardwareProgram === focusedProgram}
              onClick={() => onActivateProgram(focusedProgram)}
            >
              {activeHardwareProgram === focusedProgram
                ? 'Active on LPD8'
                : 'Activate on LPD8'}
            </button>
          )}

          <div className="pos-wrap">
            <button
              type="button"
              className="btn btn--sm"
              aria-expanded={slotMenuOpen}
              onClick={() => setSlotMenuOpen((o) => !o)}
            >
              Copy / Swap ▾
            </button>

            <PopoverOrSheet
              open={slotMenuOpen}
              onClose={() => setSlotMenuOpen(false)}
              title={`Program ${focusedProgram} Actions`}
              align="right"
            >
              <div className="menu-group">
                <div className="menu-group__label">Copy Program {focusedProgram} To</div>
                {PROGRAM_NUMBERS.filter((other) => other !== focusedProgram).map((other) => (
                  <button
                    key={`copy-${other}`}
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      onCopyProgram(focusedProgram, other);
                      setSlotMenuOpen(false);
                    }}
                  >
                    <span className="menu-item__title">
                      Copy Program {focusedProgram} → Program {other}
                    </span>
                    <span className="menu-item__sub">Overwrites Program {other} locally</span>
                  </button>
                ))}
              </div>
              <div className="menu-divider" />
              <div className="menu-group">
                <div className="menu-group__label">Swap Slots</div>
                {PROGRAM_NUMBERS.filter((other) => other !== focusedProgram).map((other) => (
                  <button
                    key={`swap-${other}`}
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      onSwapPrograms(focusedProgram, other);
                      setSlotMenuOpen(false);
                    }}
                  >
                    <span className="menu-item__title">
                      Swap Program {focusedProgram} ↔ Program {other}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverOrSheet>
          </div>
        </div>
      </div>
    </section>
  );
};
