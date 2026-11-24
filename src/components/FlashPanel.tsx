import React, { useState } from 'react';
import type { FlashResult, ProgramNumber } from '../types/lpd8';
import { PROGRAM_NUMBERS } from '../engine/factoryDefaults';
import { PopoverOrSheet } from './PopoverOrSheet';

interface FlashPanelProps {
  isConnected: boolean;
  webMidiSupported: boolean;
  isBusy: boolean;
  focusedProgram: ProgramNumber;
  flashSelection: ProgramNumber[];
  dirtyPrograms: ProgramNumber[];
  verifyReadback: boolean;
  progressText: string | null;
  statusNotice?: string | null;
  lastFlashResults: FlashResult[] | null;
  onConnectHardware: () => void;
  onPullCurrent: () => void;
  onPullAll: () => void;
  onGetActive: () => void;
  onToggleFlashProgram: (prog: ProgramNumber) => void;
  onSetFlashPreset: (preset: 'modified' | 'current' | 'all') => void;
  onToggleVerify: (verify: boolean) => void;
  onFlashSelected: () => void;
  onDismissResults: () => void;
  onDismissNotice?: () => void;
}

export const FlashPanel: React.FC<FlashPanelProps> = ({
  isConnected,
  webMidiSupported,
  isBusy,
  focusedProgram,
  flashSelection,
  dirtyPrograms,
  verifyReadback,
  progressText,
  statusNotice,
  lastFlashResults,
  onConnectHardware,
  onPullCurrent,
  onPullAll,
  onGetActive,
  onToggleFlashProgram,
  onSetFlashPreset,
  onToggleVerify,
  onFlashSelected,
  onDismissResults,
  onDismissNotice,
}) => {
  const [readOpen, setReadOpen] = useState(false);
  const [slotsOpen, setSlotsOpen] = useState(false);

  const slotLabel =
    flashSelection.length === 4
      ? 'All 4'
      : flashSelection.length === 0
        ? 'None'
        : flashSelection.map((p) => `P${p}`).join(', ');

  const renderToast = () => {
    if (progressText) {
      return (
        <div className="sync-toast-wrap">
          <div className="sync-toast sync-toast--busy" role="status">
            {progressText}
          </div>
        </div>
      );
    }

    if (!lastFlashResults || lastFlashResults.length === 0) {
      if (!statusNotice) return null;
      return (
        <div className="sync-toast-wrap">
          <div className="sync-toast sync-toast--busy" role="status">
            <span>{statusNotice}</span>
            {onDismissNotice && (
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px' }}
                aria-label="Dismiss notice"
                onClick={onDismissNotice}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      );
    }
    const allOk = lastFlashResults.every((r) => r.written && r.verified !== false);
    if (allOk) {
      const list = lastFlashResults.map((r) => `P${r.program}`).join(', ');
      const verifiedAny = lastFlashResults.some((r) => r.verified === true);
      return (
        <div className="sync-toast-wrap">
          <div className="sync-toast sync-toast--ok" role="status">
            <span>{verifiedAny ? `Saved & verified ${list} ✓` : `Sent ${list} ✓`}</span>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px' }}
              aria-label="Dismiss status"
              onClick={onDismissResults}
            >
              ✕
            </button>
          </div>
        </div>
      );
    }

    const failed = lastFlashResults
      .filter((r) => !r.written || r.verified === false)
      .map((r) => `P${r.program}`)
      .join(', ');
    const firstErr = lastFlashResults.find((r) => r.error)?.error;
    return (
      <div className="sync-toast-wrap">
        <div className="sync-toast sync-toast--err" role="alert">
          <span>
            {firstErr ? `Failed on ${failed}: ${firstErr}` : `Could not verify ${failed}`}
          </span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px' }}
            aria-label="Dismiss error"
            onClick={onDismissResults}
          >
            ✕
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderToast()}
      <footer className="sync-dock" aria-label="Hardware Sync Dock">
        <div className="sync-dock__inner">
          {!isConnected ? (
            <div className="sync-dock__offline">
              <button
                type="button"
                className="btn btn--primary"
                disabled={!webMidiSupported}
                onClick={onConnectHardware}
              >
                Connect LPD8
              </button>
            </div>
          ) : (
            <div className="sync-dock__online">
              {/* Read Menu */}
              <div className="pos-wrap">
                <button
                  type="button"
                  className="btn"
                  disabled={isBusy}
                  aria-expanded={readOpen}
                  onClick={() => {
                    setSlotsOpen(false);
                    setReadOpen((o) => !o);
                  }}
                >
                  Read ▾
                </button>
                <PopoverOrSheet
                  open={readOpen}
                  onClose={() => setReadOpen(false)}
                  title="Read from LPD8"
                  align="left"
                  direction="up"
                >
                  <div className="menu-group">
                    <button
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        setReadOpen(false);
                        onPullCurrent();
                      }}
                    >
                      <span className="menu-item__title">Read Program {focusedProgram}</span>
                      <span className="menu-item__sub">
                        Loads slot {focusedProgram} from device into editor
                      </span>
                    </button>
                    <button
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        setReadOpen(false);
                        onPullAll();
                      }}
                    >
                      <span className="menu-item__title">Read All 4 Programs</span>
                      <span className="menu-item__sub">
                        Pulls Programs 1–4 from your LPD8
                      </span>
                    </button>
                    <button
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        setReadOpen(false);
                        onGetActive();
                      }}
                    >
                      <span className="menu-item__title">Sync Active Slot from LPD8</span>
                      <span className="menu-item__sub">
                        Checks which slot is currently selected on hardware
                      </span>
                    </button>
                  </div>
                </PopoverOrSheet>
              </div>

              {/* Target Slots Menu */}
              <div className="pos-wrap">
                <button
                  type="button"
                  className="btn"
                  disabled={isBusy}
                  aria-expanded={slotsOpen}
                  onClick={() => {
                    setReadOpen(false);
                    setSlotsOpen((o) => !o);
                  }}
                >
                  Slots: {slotLabel} ▾
                </button>
                <PopoverOrSheet
                  open={slotsOpen}
                  onClose={() => setSlotsOpen(false)}
                  title="Select Program Slots to Send"
                  align="center"
                  direction="up"
                >
                  <div className="slot-tiles-grid">
                    {PROGRAM_NUMBERS.map((pNum) => {
                      const selected = flashSelection.includes(pNum);
                      const isDirty = dirtyPrograms.includes(pNum);
                      return (
                        <button
                          key={pNum}
                          type="button"
                          aria-pressed={selected}
                          className={`slot-tile ${selected ? 'is-selected' : ''}`}
                          onClick={() => onToggleFlashProgram(pNum)}
                        >
                          <span className="slot-tile__num">P{pNum}</span>
                          <span className={`slot-tile__state ${isDirty ? 'is-dirty' : ''}`}>
                            {isDirty ? 'Unsaved' : 'Synced'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="chip-group">
                    <button
                      type="button"
                      className="chip"
                      disabled={dirtyPrograms.length === 0}
                      onClick={() => onSetFlashPreset('modified')}
                    >
                      Unsaved ({dirtyPrograms.length})
                    </button>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => onSetFlashPreset('current')}
                    >
                      Current (P{focusedProgram})
                    </button>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => onSetFlashPreset('all')}
                    >
                      All 4
                    </button>
                  </div>

                  <div className="menu-divider" />

                  <label className="toggle-check">
                    <input
                      type="checkbox"
                      checked={verifyReadback}
                      onChange={(e) => onToggleVerify(e.target.checked)}
                    />
                    Verify after sending (reads back bytes to confirm)
                  </label>
                </PopoverOrSheet>
              </div>

              {/* Primary Send CTA */}
              <button
                type="button"
                className="btn btn--primary"
                disabled={isBusy || flashSelection.length === 0}
                onClick={onFlashSelected}
              >
                {flashSelection.length === 1
                  ? `Send P${flashSelection[0]} to LPD8`
                  : `Send ${flashSelection.length} Slots to LPD8`}
              </button>
            </div>
          )}
        </div>
      </footer>
    </>
  );
};
