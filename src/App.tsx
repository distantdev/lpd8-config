import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import type {
  BankState,
  DeviceIdentity,
  FlashResult,
  HardwareSnapshot,
  KnobConfig,
  LiveMidiActivity,
  MidiLogEntry,
  PadConfig,
  PadLayer,
  ProgramConfig,
  ProgramNumber,
  TargetField,
} from './types/lpd8';
import {
  cloneBank,
  cloneProgram,
  createFactoryBank,
  PROGRAM_NUMBERS,
  programsEqual,
} from './engine/factoryDefaults';
import { detectConflicts } from './engine/conflicts';
import {
  computeDragFill,
  type DragFillCell,
  type PatternPreviewResult,
} from './engine/patternEngine';
import {
  downloadBlob,
  exportBankJson,
  exportProgramsAsSyx,
  importBankJson,
  importSyxIntoBank,
  loadSavedBank,
  saveBankToLocalStorage,
} from './engine/storage';
import {
  type ConnectionMode,
  type MidiPortInfo,
  WebMidiService,
} from './midi/webMidiService';
import { useUndoRedo } from './hooks/useUndoRedo';
import { HeaderBar } from './components/HeaderBar';
import { ProgramStrip } from './components/ProgramStrip';
import { PatternComposer } from './components/PatternComposer';
import { HardwareFaceplate } from './components/HardwareFaceplate';
import { BankMatrixView } from './components/BankMatrixView';
import { FlashPanel } from './components/FlashPanel';
import { SysexInspector } from './components/SysexInspector';

export function App() {
  const {
    state: bank,
    set: setBank,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo<BankState>(() => loadSavedBank());

  const [hardwareSnapshot, setHardwareSnapshot] = useState<HardwareSnapshot>({});
  const [focusedProgram, setFocusedProgram] = useState<ProgramNumber>(1);
  const [activeHardwareProgram, setActiveHardwareProgram] = useState<ProgramNumber | null>(null);
  const [viewMode, setViewMode] = useState<'faceplate' | 'matrix'>('faceplate');
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [padLayer, setPadLayer] = useState<PadLayer>('note');
  const [selectedPads, setSelectedPads] = useState<number[]>([]);
  const [selectedKnobs, setSelectedKnobs] = useState<number[]>([]);
  const [flashSelection, setFlashSelection] = useState<ProgramNumber[]>([1]);
  const [verifyReadback, setVerifyReadback] = useState(true);

  const [previewResult, setPreviewResult] = useState<PatternPreviewResult | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('disconnected');
  const [inputs, setInputs] = useState<MidiPortInfo[]>([]);
  const [outputs, setOutputs] = useState<MidiPortInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);

  const [logs, setLogs] = useState<MidiLogEntry[]>([]);
  const [liveActivity, setLiveActivity] = useState<LiveMidiActivity | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [lastFlashResults, setLastFlashResults] = useState<FlashResult[] | null>(null);

  const midiRef = useRef<WebMidiService | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!midiRef.current) {
    midiRef.current = new WebMidiService();
  }

  useEffect(() => {
    const service = midiRef.current!;
    service.setListeners({
      onPortsChange: (ins, outs) => {
        setInputs(ins);
        setOutputs(outs);
        const ids = service.getSelectedPortIds();
        setSelectedInputId(ids.inputId);
        setSelectedOutputId(ids.outputId);
      },
      onLog: (entry) => {
        setLogs((prev) => [entry, ...prev].slice(0, 80));
      },
      onLiveActivity: (activity) => {
        setLiveActivity(activity);
        if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
        if (activity.active) {
          liveTimerRef.current = setTimeout(() => {
            setLiveActivity((cur) =>
              cur && cur.timestamp === activity.timestamp ? { ...cur, active: false } : cur,
            );
          }, 420);
        }
      },
      onConnectionError: (msg) => setErrorBanner(msg),
    });
  }, []);

  // Debounced autosave to localStorage
  useEffect(() => {
    const t = setTimeout(() => saveBankToLocalStorage(bank), 250);
    return () => clearTimeout(t);
  }, [bank]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Escape') {
        setSelectedPads([]);
        setSelectedKnobs([]);
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
          setFocusedProgram(Number(e.key) as ProgramNumber);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const conflicts = useMemo(() => detectConflicts(bank), [bank]);

  const dirtyPrograms = useMemo(() => {
    return PROGRAM_NUMBERS.filter((pNum) => {
      const snap = hardwareSnapshot[pNum];
      if (!snap) return true;
      return !programsEqual(bank[pNum], snap);
    });
  }, [bank, hardwareSnapshot]);

  const previewSummaryByProgram = useMemo(() => {
    if (!previewResult) {
      return { 1: '', 2: '', 3: '', 4: '' };
    }
    return previewResult.summaryByProgram;
  }, [previewResult]);

  const previewChannelByProgram = useMemo(() => {
    const map: Partial<Record<ProgramNumber, number>> = {};
    if (!previewResult) return map;
    for (const pNum of PROGRAM_NUMBERS) {
      if (previewResult.nextBank[pNum].channel !== bank[pNum].channel) {
        map[pNum] = previewResult.nextBank[pNum].channel;
      }
    }
    return map;
  }, [previewResult, bank]);

  const updateProgram = useCallback(
    (progNum: ProgramNumber, updater: (prev: ProgramConfig) => ProgramConfig) => {
      setBank((prev) => {
        const next = cloneBank(prev);
        next[progNum] = updater(cloneProgram(prev[progNum]));
        return next;
      });
    },
    [setBank],
  );

  const handleChangeChannel = useCallback(
    (progNum: ProgramNumber, channel: number) => {
      updateProgram(progNum, (p) => ({ ...p, channel }));
    },
    [updateProgram],
  );

  const handleUpdatePad = useCallback(
    (progNum: ProgramNumber, padNum: number, patch: Partial<PadConfig>) => {
      updateProgram(progNum, (p) => ({
        ...p,
        pads: p.pads.map((pad) => (pad.number === padNum ? { ...pad, ...patch } : pad)),
      }));
    },
    [updateProgram],
  );

  const handleUpdateKnob = useCallback(
    (progNum: ProgramNumber, knobNum: number, patch: Partial<KnobConfig>) => {
      updateProgram(progNum, (p) => ({
        ...p,
        knobs: p.knobs.map((knob) => (knob.number === knobNum ? { ...knob, ...patch } : knob)),
      }));
    },
    [updateProgram],
  );

  const handleCommitDragFill = useCallback(
    (
      target: Exclude<TargetField, 'program.channel'>,
      anchor: DragFillCell,
      trail: DragFillCell[],
      copyOnly: boolean,
    ) => {
      setBank((prev) => {
        const res = computeDragFill(prev, { target, anchor, trail, copyOnly });
        return res.changes.length > 0 ? res.nextBank : prev;
      });
    },
    [setBank],
  );

  const handleApplyPattern = useCallback(
    (result: PatternPreviewResult) => {
      setBank(result.nextBank);
      setLastFlashResults(null);
    },
    [setBank],
  );

  const handleCopyProgram = useCallback(
    (from: ProgramNumber, to: ProgramNumber) => {
      setBank((prev) => {
        const next = cloneBank(prev);
        next[to] = { ...cloneProgram(prev[from]), program: to };
        return next;
      });
    },
    [setBank],
  );

  const handleSwapPrograms = useCallback(
    (a: ProgramNumber, b: ProgramNumber) => {
      setBank((prev) => {
        const next = cloneBank(prev);
        const progA = { ...cloneProgram(prev[a]), program: b };
        const progB = { ...cloneProgram(prev[b]), program: a };
        next[a] = progB;
        next[b] = progA;
        return next;
      });
    },
    [setBank],
  );

  const handleToggleFlashProgram = useCallback((prog: ProgramNumber) => {
    setFlashSelection((prev) =>
      prev.includes(prog)
        ? prev.filter((p) => p !== prog)
        : [...prev, prog].sort((a, b) => a - b),
    );
  }, []);

  const handleSetFlashPreset = useCallback(
    (preset: 'modified' | 'current' | 'all') => {
      if (preset === 'modified') {
        setFlashSelection(dirtyPrograms);
      } else if (preset === 'current') {
        setFlashSelection([focusedProgram]);
      } else {
        setFlashSelection([1, 2, 3, 4]);
      }
    },
    [dirtyPrograms, focusedProgram],
  );

  const probeConnectedDevice = useCallback(async () => {
    const service = midiRef.current!;
    const id = await service.queryIdentity();
    setIdentity(id);
    try {
      const active = await service.getActiveProgram();
      setActiveHardwareProgram(active);
    } catch {
      // Ignore if active program poll times out before ports stabilize
    }
  }, []);

  const handleConnectHardware = async () => {
    const service = midiRef.current!;
    setErrorBanner(null);
    try {
      const { inputs: ins, outputs: outs, autoMatched } = await service.connectHardware();
      setConnectionMode('hardware');
      setInputs(ins);
      setOutputs(outs);
      const ids = service.getSelectedPortIds();
      setSelectedInputId(ids.inputId);
      setSelectedOutputId(ids.outputId);
      if (autoMatched || (ids.inputId && ids.outputId)) {
        await probeConnectedDevice();
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to connect WebMIDI.');
    }
  };

  const handleDisconnect = () => {
    midiRef.current!.disconnect();
    setConnectionMode('disconnected');
    setIdentity(null);
    setActiveHardwareProgram(null);
    setSelectedInputId(null);
    setSelectedOutputId(null);
  };

  const handleSelectPorts = async (inId: string | null, outId: string | null) => {
    const service = midiRef.current!;
    service.selectPorts(inId, outId);
    setSelectedInputId(inId);
    setSelectedOutputId(outId);
    if (inId && outId) {
      await probeConnectedDevice();
    }
  };

  const handlePullCurrent = async () => {
    const service = midiRef.current!;
    setErrorBanner(null);
    setIsBusy(true);
    setProgressText(`Reading Program ${focusedProgram}…`);
    try {
      const loaded = await service.pullProgram(focusedProgram);
      setBank((prev) => {
        const next = cloneBank(prev);
        next[focusedProgram] = cloneProgram(loaded);
        return next;
      });
      setHardwareSnapshot((prev) => ({
        ...prev,
        [focusedProgram]: cloneProgram(loaded),
      }));
      setLastFlashResults(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to read program.');
    } finally {
      setIsBusy(false);
      setProgressText(null);
    }
  };

  const handlePullAll = async () => {
    const service = midiRef.current!;
    setErrorBanner(null);
    setIsBusy(true);
    try {
      const loaded = await service.pullPrograms([...PROGRAM_NUMBERS], (done, total, current) => {
        setProgressText(done < total ? `Reading P${current} (${done + 1}/${total})…` : null);
      });
      setBank((prev) => {
        const next = cloneBank(prev);
        for (const pNum of PROGRAM_NUMBERS) {
          if (loaded[pNum]) {
            next[pNum] = cloneProgram(loaded[pNum]!);
          }
        }
        return next;
      });
      setHardwareSnapshot((prev) => {
        const next = { ...prev };
        for (const pNum of PROGRAM_NUMBERS) {
          if (loaded[pNum]) {
            next[pNum] = cloneProgram(loaded[pNum]!);
          }
        }
        return next;
      });
      setLastFlashResults(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to read all programs.');
    } finally {
      setIsBusy(false);
      setProgressText(null);
    }
  };

  const handleGetActive = async () => {
    setErrorBanner(null);
    setIsBusy(true);
    try {
      const active = await midiRef.current!.getActiveProgram();
      setActiveHardwareProgram(active);
      setFocusedProgram(active);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to query active program.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleActivateProgram = async (prog: ProgramNumber) => {
    setErrorBanner(null);
    try {
      await midiRef.current!.activateProgram(prog);
      setActiveHardwareProgram(prog);
      setFocusedProgram(prog);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to activate program.');
    }
  };

  const handleFlashSelected = async () => {
    if (flashSelection.length === 0) return;
    const service = midiRef.current!;
    setErrorBanner(null);
    setIsBusy(true);
    setLastFlashResults(null);

    const targets = flashSelection.map((pNum) => cloneProgram(bank[pNum]));
    try {
      const results = await service.flashPrograms(targets, {
        verify: verifyReadback,
        onProgress: (done, total, current, phase) => {
          if (done < total) {
            setProgressText(
              `${phase === 'writing' ? 'Sending' : 'Verifying'} P${current} (${done + 1}/${total})…`,
            );
          } else {
            setProgressText(null);
          }
        },
      });

      setLastFlashResults(results);
      setHardwareSnapshot((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.written && r.verified !== false) {
            next[r.program] = cloneProgram(bank[r.program]);
          }
        }
        return next;
      });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Send operation failed.');
    } finally {
      setIsBusy(false);
      setProgressText(null);
    }
  };

  const handleToggleSelectPad = (padNum: number) => {
    setSelectedPads((prev) =>
      prev.includes(padNum)
        ? prev.filter((n) => n !== padNum)
        : [...prev, padNum].sort((a, b) => a - b),
    );
  };

  const handleToggleSelectKnob = (knobNum: number) => {
    setSelectedKnobs((prev) =>
      prev.includes(knobNum)
        ? prev.filter((n) => n !== knobNum)
        : [...prev, knobNum].sort((a, b) => a - b),
    );
  };

  const handleSelectGroup = (
    kind: 'pads-all' | 'pads-top' | 'pads-bottom' | 'knobs-all' | 'clear',
  ) => {
    if (kind === 'pads-all') setSelectedPads([1, 2, 3, 4, 5, 6, 7, 8]);
    else if (kind === 'pads-top') setSelectedPads([5, 6, 7, 8]);
    else if (kind === 'pads-bottom') setSelectedPads([1, 2, 3, 4]);
    else if (kind === 'knobs-all') setSelectedKnobs([1, 2, 3, 4, 5, 6, 7, 8]);
    else {
      setSelectedPads([]);
      setSelectedKnobs([]);
    }
  };

  const handleImportFile = async (file: File) => {
    setErrorBanner(null);
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const text = await file.text();
        const imported = importBankJson(text);
        setBank(imported);
      } else {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const { nextBank } = importSyxIntoBank(bank, buffer, focusedProgram);
        setBank(nextBank);
      }
      setLastFlashResults(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not import file.');
    }
  };

  const isConnected =
    connectionMode === 'hardware' && Boolean(selectedInputId && selectedOutputId);

  const realIssuesCount = conflicts.intraProgram.length + conflicts.invertedRanges.length;

  return (
    <div className="app-shell">
      <HeaderBar
        connectionMode={connectionMode}
        webMidiSupported={WebMidiService.isWebMidiSupported()}
        inputs={inputs}
        outputs={outputs}
        selectedInputId={selectedInputId}
        selectedOutputId={selectedOutputId}
        identity={identity}
        onConnectHardware={handleConnectHardware}
        onDisconnect={handleDisconnect}
        onSelectPorts={handleSelectPorts}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        focusedProgram={focusedProgram}
        onExportJson={() =>
          downloadBlob(exportBankJson(bank), 'lpd8-backup.json', 'application/json')
        }
        onExportSyxSingle={() =>
          exportProgramsAsSyx([bank[focusedProgram]], `lpd8-prog${focusedProgram}.syx`)
        }
        onExportSyxAll={() =>
          exportProgramsAsSyx(
            PROGRAM_NUMBERS.map((p) => bank[p]),
            'lpd8-all-programs.syx',
          )
        }
        onImportFile={handleImportFile}
        onResetFactory={() => {
          setBank(createFactoryBank());
          setLastFlashResults(null);
        }}
      />

      <main className="app-main">
        {errorBanner && (
          <div className="banner-error" role="alert">
            <span>{errorBanner}</span>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setErrorBanner(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <ProgramStrip
          bank={bank}
          hardwareSnapshot={hardwareSnapshot}
          focusedProgram={focusedProgram}
          activeHardwareProgram={activeHardwareProgram}
          isConnected={isConnected}
          previewSummaryByProgram={previewSummaryByProgram}
          previewChannelByProgram={previewChannelByProgram}
          onFocusProgram={setFocusedProgram}
          onChangeChannel={handleChangeChannel}
          onActivateProgram={handleActivateProgram}
          onCopyProgram={handleCopyProgram}
          onSwapPrograms={handleSwapPrograms}
        />

        {/* Workspace Toolbar: Controller | Grid + Auto-Fill Drawer Toggle */}
        <div className="workspace-bar">
          <div className="workspace-bar__left">
            <div className="segmented" role="tablist" aria-label="Workspace View">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'faceplate'}
                className={`segmented__btn ${viewMode === 'faceplate' ? 'is-active' : ''}`}
                onClick={() => setViewMode('faceplate')}
              >
                Controller
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'matrix'}
                className={`segmented__btn ${viewMode === 'matrix' ? 'is-active' : ''}`}
                onClick={() => setViewMode('matrix')}
              >
                Grid
              </button>
            </div>
          </div>

          <div className="workspace-bar__right">
            <button
              type="button"
              aria-expanded={autoFillOpen}
              className={`btn ${autoFillOpen ? 'btn--cyan' : ''}`}
              onClick={() => setAutoFillOpen((o) => !o)}
            >
              ✦ Auto-Fill
            </button>
          </div>
        </div>

        <PatternComposer
          isOpen={autoFillOpen}
          onClose={() => setAutoFillOpen(false)}
          bank={bank}
          focusedProgram={focusedProgram}
          selectedPads={selectedPads}
          selectedKnobs={selectedKnobs}
          onPreviewChange={setPreviewResult}
          onApplyPattern={handleApplyPattern}
        />

        {viewMode === 'faceplate' ? (
          <HardwareFaceplate
            bank={bank}
            program={bank[focusedProgram]}
            padLayer={padLayer}
            onPadLayerChange={setPadLayer}
            selectedPads={selectedPads}
            selectedKnobs={selectedKnobs}
            onToggleSelectPad={handleToggleSelectPad}
            onToggleSelectKnob={handleToggleSelectKnob}
            onSelectGroup={handleSelectGroup}
            onUpdatePad={(padNum, patch) => handleUpdatePad(focusedProgram, padNum, patch)}
            onUpdateKnob={(knobNum, patch) => handleUpdateKnob(focusedProgram, knobNum, patch)}
            onCommitDragFill={handleCommitDragFill}
            previewProgram={previewResult ? previewResult.nextBank[focusedProgram] : null}
            conflicts={conflicts}
            liveActivity={liveActivity}
          />
        ) : (
          <BankMatrixView
            bank={bank}
            previewBank={previewResult ? previewResult.nextBank : null}
            focusedProgram={focusedProgram}
            conflicts={conflicts}
            onFocusProgram={setFocusedProgram}
            onChangeChannel={handleChangeChannel}
            onUpdatePad={handleUpdatePad}
            onUpdateKnob={handleUpdateKnob}
            onCommitDragFill={handleCommitDragFill}
          />
        )}

        {/* Only surface warning banner when genuine intra-program or range issues exist */}
        {realIssuesCount > 0 && (
          <div className="banner-warn" role="status">
            <span>
              {conflicts.intraProgram.length > 0 &&
                `${conflicts.intraProgram.length} duplicate control(s) inside the same program`}
              {conflicts.intraProgram.length > 0 &&
                conflicts.invertedRanges.length > 0 &&
                ' · '}
              {conflicts.invertedRanges.length > 0 &&
                `${conflicts.invertedRanges.length} inverted knob range(s)`}
            </span>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setInspectorOpen(true)}
            >
              Inspect
            </button>
          </div>
        )}

        <SysexInspector
          program={bank[focusedProgram]}
          conflicts={conflicts}
          logs={logs}
          open={inspectorOpen}
          onToggleOpen={() => setInspectorOpen((o) => !o)}
          onClearLogs={() => setLogs([])}
        />

        <div className="app-colophon">
          <a
            href="https://lpd8.distantnebula.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            lpd8.distantnebula.com
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/distantdev/lpd8-config"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://distantnebula.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Distant Nebula
          </a>
        </div>
      </main>

      <FlashPanel
        isConnected={isConnected}
        webMidiSupported={WebMidiService.isWebMidiSupported()}
        isBusy={isBusy}
        focusedProgram={focusedProgram}
        flashSelection={flashSelection}
        dirtyPrograms={dirtyPrograms}
        verifyReadback={verifyReadback}
        progressText={progressText}
        lastFlashResults={lastFlashResults}
        onConnectHardware={handleConnectHardware}
        onPullCurrent={handlePullCurrent}
        onPullAll={handlePullAll}
        onGetActive={handleGetActive}
        onToggleFlashProgram={handleToggleFlashProgram}
        onSetFlashPreset={handleSetFlashPreset}
        onToggleVerify={setVerifyReadback}
        onFlashSelected={handleFlashSelected}
        onDismissResults={() => setLastFlashResults(null)}
      />
    </div>
  );
}

export default App;
