import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BankState,
  KnobConfig,
  LiveMidiActivity,
  PadConfig,
  PadLayer,
  PadTriggerMode,
  ProgramConfig,
  TargetField,
} from '../types/lpd8';
import type { ConflictReport } from '../engine/conflicts';
import { getControlConflicts } from '../engine/conflicts';
import type { DragFillCell } from '../engine/patternEngine';
import { computeDragFill } from '../engine/patternEngine';
import { midiNoteToName } from '../engine/musicNotes';
import { ScrubInput } from './ScrubInput';
import { TouchStepper } from './TouchStepper';

interface HardwareFaceplateProps {
  bank: BankState;
  program: ProgramConfig;
  padLayer: PadLayer;
  onPadLayerChange: (layer: PadLayer) => void;
  selectedPads: number[];
  selectedKnobs: number[];
  onToggleSelectPad: (padNum: number) => void;
  onToggleSelectKnob: (knobNum: number) => void;
  onSelectGroup: (kind: 'pads-all' | 'pads-top' | 'pads-bottom' | 'knobs-all' | 'clear') => void;
  onUpdatePad: (padNum: number, patch: Partial<PadConfig>) => void;
  onUpdateKnob: (knobNum: number, patch: Partial<KnobConfig>) => void;
  onCommitDragFill: (
    target: Exclude<TargetField, 'program.channel'>,
    anchor: DragFillCell,
    trail: DragFillCell[],
    copyOnly: boolean,
  ) => void;
  previewProgram: ProgramConfig | null;
  conflicts: ConflictReport;
  liveActivity: LiveMidiActivity | null;
}

const PAD_TOP_ROW = [5, 6, 7, 8];
const PAD_BOTTOM_ROW = [1, 2, 3, 4];
const KNOB_TOP_ROW = [1, 2, 3, 4];
const KNOB_BOTTOM_ROW = [5, 6, 7, 8];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? '0' : '1';
  const sweepFlag = endAngle >= startAngle ? '0' : '1';
  return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, sweepFlag, end.x, end.y].join(' ');
}

export const HardwareFaceplate: React.FC<HardwareFaceplateProps> = ({
  bank,
  program,
  padLayer,
  onPadLayerChange,
  selectedPads,
  selectedKnobs,
  onToggleSelectPad,
  onToggleSelectKnob,
  onSelectGroup,
  onUpdatePad,
  onUpdateKnob,
  onCommitDragFill,
  previewProgram,
  conflicts,
  liveActivity,
}) => {
  const [mobileTab, setMobileTab] = useState<'pads' | 'knobs'>('pads');
  const [selectMode, setSelectMode] = useState(false);
  const [activeControl, setActiveControl] = useState<{ kind: 'pad' | 'knob'; number: number }>({
    kind: 'pad',
    number: 1,
  });

  const [dragState, setDragState] = useState<{
    kind: 'pad' | 'knob';
    target: Exclude<TargetField, 'program.channel'>;
    anchorNum: number;
    trailNums: number[];
    copyOnly: boolean;
  } | null>(null);

  const dragRef = useRef(dragState);
  dragRef.current = dragState;

  const showSelectionUI =
    selectMode || selectedPads.length > 0 || selectedKnobs.length > 0;

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const attr = current.kind === 'pad' ? 'data-pad-fill' : 'data-knob-fill';
      const tile = el?.closest(`[${attr}]`);
      const copyOnly = e.altKey;

      if (tile) {
        const num = Number(tile.getAttribute(attr));
        if (num >= 1 && num <= 8) {
          setDragState((prev) => {
            if (!prev) return prev;
            const exists = prev.trailNums.includes(num);
            if (exists && prev.copyOnly === copyOnly) return prev;
            return {
              ...prev,
              copyOnly,
              trailNums: exists ? prev.trailNums : [...prev.trailNums, num],
            };
          });
          return;
        }
      }

      if (current.copyOnly !== copyOnly) {
        setDragState((prev) => (prev ? { ...prev, copyOnly } : prev));
      }
    };

    const handleUp = (e: PointerEvent) => {
      const current = dragRef.current;
      setDragState(null);
      if (!current) return;
      const trailCells = current.trailNums
        .filter((n) => n !== current.anchorNum)
        .map((n) => ({ program: program.program, controlIndex: n }));
      if (trailCells.length > 0) {
        onCommitDragFill(
          current.target,
          { program: program.program, controlIndex: current.anchorNum },
          trailCells,
          e.altKey || current.copyOnly,
        );
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [Boolean(dragState), program.program, onCommitDragFill]);

  const dragPreviewBank = useMemo(() => {
    if (!dragState) return null;
    const trailCells = dragState.trailNums
      .filter((n) => n !== dragState.anchorNum)
      .map((n) => ({ program: program.program, controlIndex: n }));
    if (trailCells.length === 0) return null;
    return computeDragFill(bank, {
      target: dragState.target,
      anchor: { program: program.program, controlIndex: dragState.anchorNum },
      trail: trailCells,
      copyOnly: dragState.copyOnly,
    }).nextBank;
  }, [dragState, bank, program.program]);

  const activePadTarget: Exclude<TargetField, 'program.channel'> =
    padLayer === 'cc'
      ? 'pad.cc'
      : padLayer === 'pc'
        ? 'pad.pc'
        : padLayer === 'mode'
          ? 'pad.mode'
          : 'pad.note';

  const isPadLiveHit = (pad: PadConfig): boolean => {
    if (!liveActivity || !liveActivity.active || liveActivity.channel !== program.channel) {
      return false;
    }
    if (liveActivity.kind === 'note' && pad.note === liveActivity.number) return true;
    if (liveActivity.kind === 'cc' && pad.cc === liveActivity.number) return true;
    if (liveActivity.kind === 'pc' && pad.pc === liveActivity.number) return true;
    return false;
  };

  const getKnobLiveValue = (knob: KnobConfig): number | null => {
    if (
      liveActivity &&
      liveActivity.kind === 'cc' &&
      liveActivity.channel === program.channel &&
      liveActivity.number === knob.cc
    ) {
      return liveActivity.value;
    }
    return null;
  };

  const handleMobileTabChange = (tab: 'pads' | 'knobs') => {
    setMobileTab(tab);
    setActiveControl((cur) => ({
      kind: tab === 'pads' ? 'pad' : 'knob',
      number: cur.number,
    }));
  };

  const renderPad = (padNum: number) => {
    const pad = program.pads.find((p) => p.number === padNum)!;
    const previewPad = previewProgram?.pads.find((p) => p.number === padNum) ?? null;
    const dragPad = dragPreviewBank?.[program.program].pads.find((p) => p.number === padNum) ?? null;
    const isSelected = selectedPads.includes(padNum);
    const isActiveMobile = activeControl.kind === 'pad' && activeControl.number === padNum;
    const isDragTarget = dragState?.kind === 'pad' && dragState.trailNums.includes(padNum);

    // Only show conflict dot for true same-program collisions
    const padConflicts = getControlConflicts(conflicts, program.program, 'pad', padNum).filter(
      (c) => c.scope === 'intra',
    );
    const liveHit = isPadLiveHit(pad);

    const effectivePreviewNote =
      dragPad && dragState?.target === 'pad.note'
        ? dragPad.note
        : previewPad && previewPad.note !== pad.note
          ? previewPad.note
          : null;
    const effectivePreviewCC =
      dragPad && dragState?.target === 'pad.cc'
        ? dragPad.cc
        : previewPad && previewPad.cc !== pad.cc
          ? previewPad.cc
          : null;
    const effectivePreviewPC =
      dragPad && dragState?.target === 'pad.pc'
        ? dragPad.pc
        : previewPad && previewPad.pc !== pad.pc
          ? previewPad.pc
          : null;
    const effectivePreviewMode: PadTriggerMode | null =
      dragPad && dragState?.target === 'pad.mode'
        ? dragPad.mode
        : previewPad && previewPad.mode !== pad.mode
          ? previewPad.mode
          : null;

    const hasAnyPreview =
      effectivePreviewNote !== null ||
      effectivePreviewCC !== null ||
      effectivePreviewPC !== null ||
      effectivePreviewMode !== null;

    const mobileReadout = () => {
      if (padLayer === 'cc') {
        return {
          hero: `CC ${pad.cc}`,
          sub: midiNoteToName(pad.note),
          prev: effectivePreviewCC !== null ? `→ ${effectivePreviewCC}` : null,
        };
      }
      if (padLayer === 'pc') {
        return {
          hero: `PC ${pad.pc}`,
          sub: midiNoteToName(pad.note),
          prev: effectivePreviewPC !== null ? `→ ${effectivePreviewPC}` : null,
        };
      }
      if (padLayer === 'mode') {
        return {
          hero: pad.mode === 'toggle' ? 'Toggle' : 'Mom',
          sub: midiNoteToName(pad.note),
          prev: effectivePreviewMode ? `→ ${effectivePreviewMode === 'toggle' ? 'Tog' : 'Mom'}` : null,
        };
      }
      return {
        hero: midiNoteToName(pad.note),
        sub: String(pad.note),
        prev:
          effectivePreviewNote !== null
            ? `→ ${midiNoteToName(effectivePreviewNote)}`
            : null,
      };
    };

    const mInfo = mobileReadout();

    return (
      <div
        key={padNum}
        data-pad-fill={padNum}
        className={`pad-tile ${isSelected ? 'is-selected' : ''} ${
          isActiveMobile ? 'is-active-control' : ''
        } ${liveHit ? 'is-live-hit' : ''} ${isDragTarget ? 'is-drag-target' : ''} ${
          hasAnyPreview ? 'has-preview' : ''
        }`}
        onClick={() => {
          if (showSelectionUI && selectMode) {
            onToggleSelectPad(padNum);
          }
          setActiveControl({ kind: 'pad', number: padNum });
        }}
      >
        <div className="pad-tile__top">
          <span className="pad-tile__num">
            {showSelectionUI && (
              <input
                type="checkbox"
                checked={isSelected}
                aria-label={`Select Pad ${padNum}`}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelectPad(padNum)}
                style={{ accentColor: 'var(--accent-select)' }}
              />
            )}
            <span>{padNum}</span>
          </span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {pad.mode === 'toggle' && <span className="pad-tile__flag">T</span>}
            {padConflicts.length > 0 && (
              <span
                className="conflict-dot"
                title={padConflicts.map((c) => c.message).join('\n')}
              />
            )}
          </span>
        </div>

        {/* Mobile/Tablet Touch Readout (tapping selects pad for Active Editor below) */}
        <div className="pad-tile__center pad-tile__mobile-only">
          <span className="pad-tile__hero">{mInfo.hero}</span>
          <span className="pad-tile__sub">{mInfo.sub}</span>
          {mInfo.prev && <span className="pad-tile__preview">{mInfo.prev}</span>}
        </div>

        {/* Desktop Direct Scrub / Inline Editor */}
        <div className="pad-tile__center pad-tile__desktop-only">
          {padLayer === 'all' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between', alignItems: 'center' }}>
                <ScrubInput
                  value={pad.note}
                  min={0}
                  max={127}
                  displayMode="note"
                  variant="inline"
                  size="sm"
                  previewValue={effectivePreviewNote}
                  ariaLabel={`Pad ${padNum} Note`}
                  onChange={(note) => onUpdatePad(padNum, { note })}
                />
                <button
                  type="button"
                  className={`pad-mode-toggle ${pad.mode === 'toggle' ? 'is-toggle' : ''} ${
                    effectivePreviewMode ? 'has-preview' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdatePad(padNum, {
                      mode: pad.mode === 'momentary' ? 'toggle' : 'momentary',
                    });
                  }}
                >
                  {pad.mode === 'toggle' ? 'TOG' : 'MOM'}
                  {effectivePreviewMode ? `→${effectivePreviewMode === 'toggle' ? 'TOG' : 'MOM'}` : ''}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
                <ScrubInput
                  value={pad.cc}
                  min={0}
                  max={127}
                  variant="inline"
                  prefix="CC"
                  size="sm"
                  previewValue={effectivePreviewCC}
                  ariaLabel={`Pad ${padNum} CC`}
                  onChange={(cc) => onUpdatePad(padNum, { cc })}
                />
                <ScrubInput
                  value={pad.pc}
                  min={0}
                  max={127}
                  variant="inline"
                  prefix="PC"
                  size="sm"
                  previewValue={effectivePreviewPC}
                  ariaLabel={`Pad ${padNum} PC`}
                  onChange={(pc) => onUpdatePad(padNum, { pc })}
                />
              </div>
            </div>
          ) : padLayer === 'note' ? (
            <ScrubInput
              value={pad.note}
              min={0}
              max={127}
              displayMode="note"
              variant="inline"
              size="lg"
              previewValue={effectivePreviewNote}
              ariaLabel={`Pad ${padNum} Note`}
              onChange={(note) => onUpdatePad(padNum, { note })}
            />
          ) : padLayer === 'cc' ? (
            <ScrubInput
              value={pad.cc}
              min={0}
              max={127}
              variant="inline"
              prefix="CC"
              size="lg"
              previewValue={effectivePreviewCC}
              ariaLabel={`Pad ${padNum} CC`}
              onChange={(cc) => onUpdatePad(padNum, { cc })}
            />
          ) : padLayer === 'pc' ? (
            <ScrubInput
              value={pad.pc}
              min={0}
              max={127}
              variant="inline"
              prefix="PC"
              size="lg"
              previewValue={effectivePreviewPC}
              ariaLabel={`Pad ${padNum} PC`}
              onChange={(pc) => onUpdatePad(padNum, { pc })}
            />
          ) : (
            <button
              type="button"
              className={`btn btn--sm ${pad.mode === 'toggle' ? 'btn--primary' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onUpdatePad(padNum, {
                  mode: pad.mode === 'momentary' ? 'toggle' : 'momentary',
                });
              }}
            >
              {pad.mode === 'toggle' ? 'Toggle' : 'Momentary'}
              {effectivePreviewMode ? ` → ${effectivePreviewMode}` : ''}
            </button>
          )}

          {padLayer !== 'all' && (
            <div className="pad-tile__sub" style={{ fontSize: 11 }}>
              {padLayer !== 'note' ? `${midiNoteToName(pad.note)} · ` : ''}
              {padLayer !== 'cc' ? `CC ${pad.cc}` : `PC ${pad.pc}`}
              {padLayer === 'note' ? ` · PC ${pad.pc}` : ''}
            </div>
          )}
        </div>

        <div
          className="fill-handle"
          title="Drag across pads to auto-increment (hold Alt to copy)"
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') return;
            e.preventDefault();
            e.stopPropagation();
            setDragState({
              kind: 'pad',
              target: activePadTarget,
              anchorNum: padNum,
              trailNums: [padNum],
              copyOnly: e.altKey,
            });
          }}
        />
      </div>
    );
  };

  const renderKnob = (knobNum: number) => {
    const knob = program.knobs.find((k) => k.number === knobNum)!;
    const previewKnob = previewProgram?.knobs.find((k) => k.number === knobNum) ?? null;
    const dragKnob =
      dragPreviewBank?.[program.program].knobs.find((k) => k.number === knobNum) ?? null;
    const isSelected = selectedKnobs.includes(knobNum);
    const isActiveMobile = activeControl.kind === 'knob' && activeControl.number === knobNum;
    const isDragTarget = dragState?.kind === 'knob' && dragState.trailNums.includes(knobNum);
    const knobConflicts = getControlConflicts(conflicts, program.program, 'knob', knobNum).filter(
      (c) => c.scope === 'intra' || c.scope === 'range',
    );
    const liveVal = getKnobLiveValue(knob);

    const previewCC =
      dragKnob && dragState?.target === 'knob.cc'
        ? dragKnob.cc
        : previewKnob && previewKnob.cc !== knob.cc
          ? previewKnob.cc
          : null;
    const previewMin =
      previewKnob && previewKnob.min !== knob.min ? previewKnob.min : null;
    const previewMax =
      previewKnob && previewKnob.max !== knob.max ? previewKnob.max : null;
    const hasAnyPreview = previewCC !== null || previewMin !== null || previewMax !== null;

    const minAngle = -135 + (knob.min / 127) * 270;
    const maxAngle = -135 + (knob.max / 127) * 270;
    const arcStart = Math.min(minAngle, maxAngle);
    const arcEnd = Math.max(minAngle, maxAngle);
    const pointerAngle = liveVal !== null ? -135 + (liveVal / 127) * 270 : maxAngle;
    const pointerEnd = polarToCartesian(27, 27, 17, pointerAngle);

    return (
      <div
        key={knobNum}
        data-knob-fill={knobNum}
        className={`knob-tile ${isSelected ? 'is-selected' : ''} ${
          isActiveMobile ? 'is-active-control' : ''
        } ${liveVal !== null ? 'is-live-hit' : ''} ${isDragTarget ? 'is-drag-target' : ''} ${
          hasAnyPreview ? 'has-preview' : ''
        }`}
        onClick={() => {
          if (showSelectionUI && selectMode) {
            onToggleSelectKnob(knobNum);
          }
          setActiveControl({ kind: 'knob', number: knobNum });
        }}
      >
        <div className="knob-tile__top">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {showSelectionUI && (
              <input
                type="checkbox"
                checked={isSelected}
                aria-label={`Select Knob ${knobNum}`}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelectKnob(knobNum)}
                style={{ accentColor: 'var(--accent-select)' }}
              />
            )}
            K{knobNum}
          </span>
          {knobConflicts.length > 0 && (
            <span
              className="conflict-dot"
              title={knobConflicts.map((c) => c.message).join('\n')}
            />
          )}
        </div>

        <svg className="knob-dial" viewBox="0 0 54 54" aria-hidden="true">
          <path
            d={describeArc(27, 27, 21, -135, 135)}
            fill="none"
            stroke="#2a303d"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {Math.abs(arcEnd - arcStart) > 1 && (
            <path
              d={describeArc(27, 27, 21, arcStart, arcEnd)}
              fill="none"
              stroke={knob.min > knob.max ? '#f59e0b' : '#e53935'}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          )}
          <circle cx="27" cy="27" r="15" fill="#14171e" stroke="#3c4456" strokeWidth="1.5" />
          <line
            x1="27"
            y1="27"
            x2={pointerEnd.x}
            y2={pointerEnd.y}
            stroke={liveVal !== null ? '#22d3ee' : '#f4f6fa'}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>

        {/* Mobile/Tablet Touch Readout */}
        <div className="knob-tile__mobile-only">
          <span className="pad-tile__hero" style={{ fontSize: 14 }}>
            CC {knob.cc}
          </span>
          {previewCC !== null && <span className="pad-tile__preview">→ {previewCC}</span>}
          <span className="pad-tile__sub" style={{ fontSize: 11 }}>
            {knob.min}–{knob.max}
          </span>
        </div>

        {/* Desktop Direct Scrub Readout */}
        <div className="knob-tile__desktop-only">
          <ScrubInput
            value={knob.cc}
            min={0}
            max={127}
            variant="inline"
            prefix="CC"
            size="md"
            previewValue={previewCC}
            ariaLabel={`Knob ${knobNum} CC`}
            onChange={(cc) => onUpdateKnob(knobNum, { cc })}
          />

          <div className="knob-tile__range">
            <ScrubInput
              value={knob.min}
              min={0}
              max={127}
              variant="inline"
              size="sm"
              previewValue={previewMin}
              ariaLabel={`Knob ${knobNum} Min`}
              onChange={(min) => onUpdateKnob(knobNum, { min })}
            />
            <span aria-hidden="true">–</span>
            <ScrubInput
              value={knob.max}
              min={0}
              max={127}
              variant="inline"
              size="sm"
              previewValue={previewMax}
              ariaLabel={`Knob ${knobNum} Max`}
              onChange={(max) => onUpdateKnob(knobNum, { max })}
            />
          </div>
        </div>

        <div
          className="fill-handle"
          title="Drag across knobs to auto-increment CC (hold Alt to copy)"
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') return;
            e.preventDefault();
            e.stopPropagation();
            setDragState({
              kind: 'knob',
              target: 'knob.cc',
              anchorNum: knobNum,
              trailNums: [knobNum],
              copyOnly: e.altKey,
            });
          }}
        />
      </div>
    );
  };

  const activePad =
    activeControl.kind === 'pad'
      ? program.pads.find((p) => p.number === activeControl.number)!
      : null;
  const activeKnob =
    activeControl.kind === 'knob'
      ? program.knobs.find((k) => k.number === activeControl.number)!
      : null;

  return (
    <section className="chassis" aria-label={`Program ${program.program} Controller Faceplate`}>
      <div className="chassis__header">
        <div className="chassis__title-row">
          <span className="hardware-wordmark">LPD8</span>
          <span className="chassis__subtitle">
            Program {program.program} · Ch {program.channel}
          </span>
        </div>

        <div className="chip-group">
          <button
            type="button"
            className={`btn btn--sm ${showSelectionUI ? 'btn--cyan' : 'btn--ghost'}`}
            aria-pressed={selectMode}
            onClick={() => {
              if (selectMode) {
                setSelectMode(false);
                onSelectGroup('clear');
              } else {
                setSelectMode(true);
              }
            }}
          >
            {showSelectionUI
              ? `Select (${selectedPads.length + selectedKnobs.length})`
              : 'Select'}
          </button>
        </div>
      </div>

      {/* Mobile Pads / Knobs Switcher (<640px) */}
      <div className="chassis__mobile-tabs">
        <div className="segmented segmented--full" role="tablist" aria-label="Control Type">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'pads'}
            className={`segmented__btn ${mobileTab === 'pads' ? 'is-active' : ''}`}
            onClick={() => handleMobileTabChange('pads')}
          >
            Pads (8)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'knobs'}
            className={`segmented__btn ${mobileTab === 'knobs' ? 'is-active' : ''}`}
            onClick={() => handleMobileTabChange('knobs')}
          >
            Knobs (8)
          </button>
        </div>
      </div>

      {showSelectionUI && (
        <div className="select-bar">
          <span className="autofill-field__label" style={{ marginRight: 4 }}>
            Multi-Select:
          </span>
          <button type="button" className="chip" onClick={() => onSelectGroup('pads-all')}>
            All Pads
          </button>
          <button type="button" className="chip" onClick={() => onSelectGroup('pads-top')}>
            Top 5–8
          </button>
          <button type="button" className="chip" onClick={() => onSelectGroup('pads-bottom')}>
            Bot 1–4
          </button>
          <button type="button" className="chip" onClick={() => onSelectGroup('knobs-all')}>
            All Knobs
          </button>
          {(selectedPads.length > 0 || selectedKnobs.length > 0) && (
            <button type="button" className="chip" onClick={() => onSelectGroup('clear')}>
              Clear
            </button>
          )}
        </div>
      )}

      <div className="chassis__body">
        {/* Authentic 4x2 Drum Pads (Top 5-8, Bottom 1-4) */}
        <div
          className={`faceplate-pane faceplate-pane--pads ${
            mobileTab !== 'pads' ? 'faceplate-pane--hidden-mobile' : ''
          }`}
        >
          <div className="pane-head">
            <span className="pane-head__title">Pads · Top 5–8 / Bot 1–4</span>
            <div className="segmented" role="group" aria-label="Pad Layer View">
              {(
                [
                  { id: 'note', label: 'Note' },
                  { id: 'cc', label: 'CC' },
                  { id: 'pc', label: 'PC' },
                  { id: 'mode', label: 'Mode' },
                  { id: 'all', label: 'All' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`segmented__btn ${padLayer === item.id ? 'is-active' : ''}`}
                  style={{ minHeight: 30, padding: '0 8px', fontSize: 12 }}
                  onClick={() => onPadLayerChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pad-grid">
            {PAD_TOP_ROW.map(renderPad)}
            {PAD_BOTTOM_ROW.map(renderPad)}
          </div>
        </div>

        {/* Authentic 4x2 Rotary Knobs (K1-K4, K5-K8) */}
        <div
          className={`faceplate-pane faceplate-pane--knobs ${
            mobileTab !== 'knobs' ? 'faceplate-pane--hidden-mobile' : ''
          }`}
        >
          <div className="pane-head">
            <span className="pane-head__title">Knobs · K1–K8</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>CC &amp; Range</span>
          </div>

          <div className="knob-grid">
            {KNOB_TOP_ROW.map(renderKnob)}
            {KNOB_BOTTOM_ROW.map(renderKnob)}
          </div>
        </div>
      </div>

      {/* Inline Mobile/Tablet Control Editor Card (<1024px) */}
      {activePad && (
        <div className="control-editor-card" aria-label={`Edit Pad ${activePad.number}`}>
          <div className="control-editor-card__head">
            <div className="control-editor-card__title-wrap">
              <span className="control-editor-card__title">Pad {activePad.number}</span>
              {activePad.number <= 4 && (
                <span className="control-editor-card__hint">PROG {activePad.number} key</span>
              )}
            </div>
            <div className="control-editor-card__nav">
              <button
                type="button"
                className="btn btn--sm"
                aria-label="Previous Pad"
                onClick={() =>
                  setActiveControl({
                    kind: 'pad',
                    number: activePad.number === 1 ? 8 : activePad.number - 1,
                  })
                }
              >
                ←
              </button>
              <span className="control-editor-card__count">{activePad.number} / 8</span>
              <button
                type="button"
                className="btn btn--sm"
                aria-label="Next Pad"
                onClick={() =>
                  setActiveControl({
                    kind: 'pad',
                    number: activePad.number === 8 ? 1 : activePad.number + 1,
                  })
                }
              >
                →
              </button>
            </div>
          </div>

          <div className="editor-param-grid editor-param-grid--pad">
            <div className="editor-param editor-param--span2-mobile">
              <span className="editor-param__label">MIDI Note</span>
              <TouchStepper
                value={activePad.note}
                min={0}
                max={127}
                displayMode="note"
                showOctaveSteps
                fullWidth
                ariaLabel={`Pad ${activePad.number} Note`}
                onChange={(note) => onUpdatePad(activePad.number, { note })}
              />
            </div>

            <div className="editor-param editor-param--span2-mobile">
              <span className="editor-param__label">Trigger Mode</span>
              <div className="segmented segmented--full">
                <button
                  type="button"
                  className={`segmented__btn ${activePad.mode === 'momentary' ? 'is-active' : ''}`}
                  onClick={() => onUpdatePad(activePad.number, { mode: 'momentary' })}
                >
                  Momentary
                </button>
                <button
                  type="button"
                  className={`segmented__btn ${activePad.mode === 'toggle' ? 'is-active' : ''}`}
                  onClick={() => onUpdatePad(activePad.number, { mode: 'toggle' })}
                >
                  Toggle
                </button>
              </div>
            </div>

            <div className="editor-param">
              <span className="editor-param__label">CC #</span>
              <TouchStepper
                value={activePad.cc}
                min={0}
                max={127}
                compact
                fullWidth
                ariaLabel={`Pad ${activePad.number} CC`}
                onChange={(cc) => onUpdatePad(activePad.number, { cc })}
              />
            </div>

            <div className="editor-param">
              <span className="editor-param__label">Prog Chg</span>
              <TouchStepper
                value={activePad.pc}
                min={0}
                max={127}
                compact
                fullWidth
                ariaLabel={`Pad ${activePad.number} Program Change`}
                onChange={(pc) => onUpdatePad(activePad.number, { pc })}
              />
            </div>
          </div>
        </div>
      )}

      {activeKnob && (
        <div className="control-editor-card" aria-label={`Edit Knob ${activeKnob.number}`}>
          <div className="control-editor-card__head">
            <div className="control-editor-card__title-wrap">
              <span className="control-editor-card__title">Knob {activeKnob.number}</span>
            </div>
            <div className="control-editor-card__nav">
              <button
                type="button"
                className="btn btn--sm"
                aria-label="Previous Knob"
                onClick={() =>
                  setActiveControl({
                    kind: 'knob',
                    number: activeKnob.number === 1 ? 8 : activeKnob.number - 1,
                  })
                }
              >
                ←
              </button>
              <span className="control-editor-card__count">{activeKnob.number} / 8</span>
              <button
                type="button"
                className="btn btn--sm"
                aria-label="Next Knob"
                onClick={() =>
                  setActiveControl({
                    kind: 'knob',
                    number: activeKnob.number === 8 ? 1 : activeKnob.number + 1,
                  })
                }
              >
                →
              </button>
            </div>
          </div>

          <div className="editor-param-grid editor-param-grid--knob">
            <div className="editor-param editor-param--span2-mobile">
              <span className="editor-param__label">CC #</span>
              <TouchStepper
                value={activeKnob.cc}
                min={0}
                max={127}
                compact
                fullWidth
                ariaLabel={`Knob ${activeKnob.number} CC`}
                onChange={(cc) => onUpdateKnob(activeKnob.number, { cc })}
              />
            </div>

            <div className="editor-param">
              <span className="editor-param__label">Min</span>
              <TouchStepper
                value={activeKnob.min}
                min={0}
                max={127}
                compact
                fullWidth
                ariaLabel={`Knob ${activeKnob.number} Min`}
                onChange={(min) => onUpdateKnob(activeKnob.number, { min })}
              />
            </div>

            <div className="editor-param">
              <span className="editor-param__label">Max</span>
              <TouchStepper
                value={activeKnob.max}
                min={0}
                max={127}
                compact
                fullWidth
                ariaLabel={`Knob ${activeKnob.number} Max`}
                onChange={(max) => onUpdateKnob(activeKnob.number, { max })}
              />
            </div>
          </div>

          <div className="editor-presets-row">
            <div className="chip-group">
              <span className="editor-param__label" style={{ marginRight: 4 }}>
                Range
              </span>
              <button
                type="button"
                className="chip"
                onClick={() => onUpdateKnob(activeKnob.number, { min: 0, max: 127 })}
              >
                Full 0–127
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => onUpdateKnob(activeKnob.number, { min: 127, max: 0 })}
              >
                Invert 127–0
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => onUpdateKnob(activeKnob.number, { min: 0, max: 64 })}
              >
                Half 0–64
              </button>
            </div>

            {activeKnob.min > activeKnob.max && (
              <span className="control-editor-card__hint" style={{ color: 'var(--status-warn)' }}>
                Inverted range: turns down clockwise.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
