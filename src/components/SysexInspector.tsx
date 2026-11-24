import React, { useMemo, useState } from 'react';
import type { MidiLogEntry, ProgramConfig } from '../types/lpd8';
import type { ConflictReport } from '../engine/conflicts';
import { describeSysexByte, encodeWriteProgram, formatHexBytes } from '../midi/sysex';

interface SysexInspectorProps {
  program: ProgramConfig;
  conflicts: ConflictReport;
  logs: MidiLogEntry[];
  open: boolean;
  onToggleOpen: () => void;
  onClearLogs: () => void;
}

export const SysexInspector: React.FC<SysexInspectorProps> = ({
  program,
  conflicts,
  logs,
  open,
  onToggleOpen,
  onClearLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'sysex' | 'diagnostics'>('sysex');
  const [inspectedIdx, setInspectedIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const packet = useMemo(() => encodeWriteProgram(program), [program]);
  const bytes = useMemo(() => Array.from(packet), [packet]);

  const byteInfo =
    inspectedIdx !== null ? describeSysexByte(inspectedIdx, bytes[inspectedIdx]) : null;

  const issueCount = conflicts.intraProgram.length + conflicts.invertedRanges.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatHexBytes(packet));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failure in restricted contexts
    }
  };

  return (
    <section className="utility-drawer" aria-label="Diagnostics and SysEx Inspector">
      <button
        type="button"
        className="utility-drawer__toggle"
        aria-expanded={open}
        onClick={onToggleOpen}
      >
        <span className="utility-drawer__title">Diagnostics &amp; SysEx Inspector</span>
        <span className="utility-drawer__meta">
          {issueCount === 0 ? 'All clear' : `${issueCount} notice`} · 66B {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="utility-drawer__body">
          <div className="segmented" role="tablist" aria-label="Inspector Tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'sysex'}
              className={`segmented__btn ${activeTab === 'sysex' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('sysex')}
            >
              SysEx &amp; MIDI Log ({logs.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'diagnostics'}
              className={`segmented__btn ${activeTab === 'diagnostics' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('diagnostics')}
            >
              Diagnostics ({issueCount})
            </button>
          </div>

          {activeTab === 'diagnostics' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="diag-section">
                <div className="diag-section__head">
                  Same-Program Collisions ({conflicts.intraProgram.length})
                </div>
                {conflicts.intraProgram.length === 0 ? (
                  <div className="diag-item">
                    No duplicate CCs or notes inside any individual program.
                  </div>
                ) : (
                  <div className="diag-list">
                    {conflicts.intraProgram.map((c) => (
                      <div key={c.id} className="diag-item diag-item--warn">
                        {c.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {conflicts.invertedRanges.length > 0 && (
                <div className="diag-section">
                  <div className="diag-section__head">
                    Inverted Knob Ranges ({conflicts.invertedRanges.length})
                  </div>
                  <div className="diag-list">
                    {conflicts.invertedRanges.map((c) => (
                      <div key={c.id} className="diag-item diag-item--warn">
                        {c.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="diag-section">
                <div className="diag-section__head">
                  Shared Across Programs ({conflicts.crossProgram.length})
                </div>
                <div className="diag-item" style={{ fontFamily: 'var(--font-sans)' }}>
                  Only one Program is active on your LPD8 at a time, so matching numbers across P1–P4
                  on the same MIDI channel are normal unless you want all 4 slots to map distinct
                  parameters.
                </div>
              </div>
            </div>
          ) : (
            <div className="sysex-split">
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span className="diag-section__head">
                    Write Program {program.program} (0x61 · 66B)
                  </span>
                  <button type="button" className="btn btn--sm" onClick={handleCopy}>
                    {copied ? 'Copied!' : 'Copy Hex'}
                  </button>
                </div>

                <div className="hex-grid">
                  {bytes.map((b, idx) => {
                    const desc = describeSysexByte(idx, b);
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={`hex-byte hex-byte--${desc.section} ${
                          inspectedIdx === idx ? 'is-selected' : ''
                        }`}
                        title={`Byte ${idx}: ${desc.detail}`}
                        onMouseEnter={() => setInspectedIdx(idx)}
                        onClick={() => setInspectedIdx(idx)}
                      >
                        {b.toString(16).toUpperCase().padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>

                <div className="hex-detail">
                  {byteInfo
                    ? `Byte ${inspectedIdx}: ${byteInfo.detail}`
                    : 'Tap or hover any byte to inspect its LPD8 Mk1 parameter'}
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span className="diag-section__head">MIDI Traffic ({logs.length})</span>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={onClearLogs}>
                    Clear
                  </button>
                </div>

                <div className="midi-log">
                  {logs.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)' }}>No MIDI traffic yet.</span>
                  ) : (
                    logs.map((entry) => (
                      <div key={entry.id} className="midi-log__row">
                        <span className={`midi-log__dir midi-log__dir--${entry.direction}`}>
                          {entry.direction.toUpperCase()}
                        </span>
                        <span style={{ color: 'var(--text-primary)' }}>{entry.label}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
