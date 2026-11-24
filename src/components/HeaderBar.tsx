import React, { useRef, useState } from 'react';
import type { DeviceIdentity, ProgramNumber } from '../types/lpd8';
import type { ConnectionMode, MidiPortInfo } from '../midi/webMidiService';
import { PopoverOrSheet } from './PopoverOrSheet';

interface HeaderBarProps {
  connectionMode: ConnectionMode;
  webMidiSupported: boolean;
  inputs: MidiPortInfo[];
  outputs: MidiPortInfo[];
  selectedInputId: string | null;
  selectedOutputId: string | null;
  identity: DeviceIdentity | null;
  onConnectHardware: () => void;
  onDisconnect: () => void;
  onSelectPorts: (inputId: string | null, outputId: string | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  focusedProgram: ProgramNumber;
  onExportJson: () => void;
  onExportSyxSingle: () => void;
  onExportSyxAll: () => void;
  onImportFile: (file: File) => void;
  onResetFactory: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  connectionMode,
  webMidiSupported,
  inputs,
  outputs,
  selectedInputId,
  selectedOutputId,
  identity,
  onConnectHardware,
  onDisconnect,
  onSelectPorts,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  focusedProgram,
  onExportJson,
  onExportSyxSingle,
  onExportSyxAll,
  onImportFile,
  onResetFactory,
}) => {
  const [connOpen, setConnOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getConnPillInfo = () => {
    if (connectionMode === 'hardware') {
      if (identity && !identity.isMk1) {
        return { cls: 'is-warning', text: identity.modelName };
      }
      if (selectedInputId && selectedOutputId) {
        return { cls: 'is-connected', text: identity ? 'LPD8 Mk1' : 'USB Ready' };
      }
      return { cls: 'is-warning', text: 'Select Ports' };
    }
    return { cls: '', text: 'Offline' };
  };

  const pill = getConnPillInfo();

  const closeFiles = () => {
    setFilesOpen(false);
    setConfirmReset(false);
  };

  return (
      <header className="header-bar">
        <div className="header-bar__inner">
          <div className="brand">
            <svg
              className="brand__mark"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect
                x="1"
                y="1"
                width="22"
                height="22"
                rx="6"
                fill="#151821"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1.2"
              />
              <rect x="4.5" y="4.5" width="6" height="6" rx="1.5" fill="#232836" />
              <rect x="13.5" y="4.5" width="6" height="6" rx="1.5" fill="#232836" stroke="#22d3ee" strokeOpacity="0.6" strokeWidth="0.9" />
              <rect x="4.5" y="13.5" width="6" height="6" rx="1.5" fill="#e53935" />
              <rect x="13.5" y="13.5" width="6" height="6" rx="1.5" fill="#232836" />
            </svg>
            <div className="brand__text">
              <h1 className="brand__title">LPD8 Mapper</h1>
              <a
                className="brand__sub"
                href="https://distantnebula.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                distantnebula.com
              </a>
            </div>
          </div>

          <div className="header-actions">
            {/* Connection Pill + Popover/Sheet */}
            <div className="pos-wrap">
              <button
                type="button"
                className={`conn-pill ${pill.cls}`}
                aria-expanded={connOpen}
                aria-label="Device connection settings"
                onClick={() => {
                  closeFiles();
                  setConnOpen((o) => !o);
                }}
              >
                <span className="conn-pill__dot" aria-hidden="true" />
                <span>{pill.text}</span>
                <span aria-hidden="true">▾</span>
              </button>

              <PopoverOrSheet
                open={connOpen}
                onClose={() => setConnOpen(false)}
                title="LPD8 Connection"
                align="right"
              >
                <div className="menu-group">
                  <div className="menu-group__label">USB Hardware (WebMIDI)</div>
                  {connectionMode === 'hardware' ? (
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => {
                        onDisconnect();
                        setConnOpen(false);
                      }}
                    >
                      Disconnect USB MIDI
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={!webMidiSupported}
                      onClick={() => {
                        onConnectHardware();
                      }}
                    >
                      Connect USB LPD8
                    </button>
                  )}

                  {!webMidiSupported && (
                    <span className="menu-item__sub">
                      WebMIDI SysEx requires Chrome, Edge, or Opera over localhost/HTTPS.
                    </span>
                  )}

                  {connectionMode === 'hardware' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                      <label className="autofill-field__label">
                        MIDI Input
                        <select
                          aria-label="MIDI Input Port"
                          className="select-input"
                          style={{ marginTop: 4 }}
                          value={selectedInputId ?? ''}
                          onChange={(e) => onSelectPorts(e.target.value || null, selectedOutputId)}
                        >
                          <option value="">Choose MIDI In…</option>
                          {inputs.map((port) => (
                            <option key={port.id} value={port.id}>
                              {port.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="autofill-field__label">
                        MIDI Output
                        <select
                          aria-label="MIDI Output Port"
                          className="select-input"
                          style={{ marginTop: 4 }}
                          value={selectedOutputId ?? ''}
                          onChange={(e) => onSelectPorts(selectedInputId, e.target.value || null)}
                        >
                          <option value="">Choose MIDI Out…</option>
                          {outputs.map((port) => (
                            <option key={port.id} value={port.id}>
                              {port.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {identity && (
                        <div className="menu-item__sub">
                          Detected: <strong>{identity.modelName}</strong> (Model 0x
                          {identity.familyId.toString(16).toUpperCase()})
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </PopoverOrSheet>
            </div>

            <button
              type="button"
              className="icon-btn"
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              onClick={onUndo}
            >
              ↶
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Y)"
              onClick={onRedo}
            >
              ↷
            </button>

            {/* Clear "Save / Load" (desktop) / "Files" (mobile) Menu */}
            <div className="pos-wrap">
              <button
                type="button"
                className="btn"
                aria-expanded={filesOpen}
                aria-label="Save or load preset files"
                onClick={() => {
                  setConnOpen(false);
                  setFilesOpen((o) => !o);
                  setConfirmReset(false);
                }}
              >
                <span className="header-label-mobile">Files ▾</span>
                <span className="header-label-desktop">Save / Load ▾</span>
              </button>

              <PopoverOrSheet
                open={filesOpen}
                onClose={closeFiles}
                title="Save & Load Presets"
                align="right"
              >
                <div className="menu-group">
                  <div className="menu-group__label">Backup &amp; Export</div>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      onExportJson();
                      closeFiles();
                    }}
                  >
                    <span className="menu-item__title">Save Full Backup (.json)</span>
                    <span className="menu-item__sub">All 4 programs · reopen in this app</span>
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      onExportSyxSingle();
                      closeFiles();
                    }}
                  >
                    <span className="menu-item__title">
                      Export Program {focusedProgram} (.syx)
                    </span>
                    <span className="menu-item__sub">Single-slot MIDI SysEx file</span>
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      onExportSyxAll();
                      closeFiles();
                    }}
                  >
                    <span className="menu-item__title">Export All 4 Programs (.syx)</span>
                    <span className="menu-item__sub">Combined 4-slot LPD8 SysEx dump</span>
                  </button>
                </div>

                <div className="menu-divider" />

                <div className="menu-group">
                  <div className="menu-group__label">Import</div>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      closeFiles();
                      fileInputRef.current?.click();
                    }}
                  >
                    <span className="menu-item__title">
                      Open Preset File (.json, .syx, .lpd8)…
                    </span>
                    <span className="menu-item__sub">
                      Loads a backup or LPD8 preset file
                    </span>
                  </button>
                </div>

                <div className="menu-divider" />

                <div className="menu-group">
                  <div className="menu-group__label">Reset</div>
                  {!confirmReset ? (
                    <button
                      type="button"
                      className="menu-item menu-item--danger"
                      onClick={() => setConfirmReset(true)}
                    >
                      <span className="menu-item__title">Reset All 4 Programs to Factory…</span>
                      <span className="menu-item__sub">Restores LPD8 Mk1 factory defaults</span>
                    </button>
                  ) : (
                    <div className="menu-confirm">
                      <span className="menu-confirm__text">
                        Replace all 4 programs with factory defaults? (Undoable with Ctrl+Z)
                      </span>
                      <div className="chip-group">
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          onClick={() => setConfirmReset(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          onClick={() => {
                            onResetFactory();
                            closeFiles();
                          }}
                        >
                          Confirm Reset
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </PopoverOrSheet>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.syx,.lpd8,application/json,application/octet-stream"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportFile(file);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>
      </header>
  );
};
