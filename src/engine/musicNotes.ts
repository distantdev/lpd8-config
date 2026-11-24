const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const NOTE_OFFSETS: Record<string, number> = {
  c: 0,
  'c#': 1,
  db: 1,
  d: 2,
  'd#': 3,
  eb: 3,
  e: 4,
  fb: 4,
  'e#': 5,
  f: 5,
  'f#': 6,
  gb: 6,
  g: 7,
  'g#': 8,
  ab: 8,
  a: 9,
  'a#': 10,
  bb: 10,
  b: 11,
  cb: 11,
  'b#': 0,
};

export interface MusicalScale {
  id: string;
  name: string;
  intervals: readonly number[];
}

export const SCALES: readonly MusicalScale[] = [
  { id: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'major', name: 'Major (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'minor_pentatonic', name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  { id: 'major_pentatonic', name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
  { id: 'harmonic_minor', name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'whole_tone', name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
  { id: 'fifths_octaves', name: 'Fifths & Octaves', intervals: [0, 7] },
] as const;

export function midiNoteToName(note: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(note)));
  const pitchClass = clamped % 12;
  const octave = Math.floor(clamped / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

export function parseMidiNoteInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^-?\d+$/.test(trimmed)) {
    const numeric = Number.parseInt(trimmed, 10);
    if (numeric >= 0 && numeric <= 127) {
      return numeric;
    }
    return null;
  }

  const match = /^([a-gA-G][#bB]?)(-?\d)$/.exec(trimmed);
  if (!match) return null;

  const pitchKey = match[1].toLowerCase();
  const offset = NOTE_OFFSETS[pitchKey];
  if (offset === undefined) return null;

  const octave = Number.parseInt(match[2], 10);
  // Handle B# / Cb octave boundary naturally within standard MIDI 60=C4 formula
  const midi = (octave + 1) * 12 + offset;
  if (midi < 0 || midi > 127) return null;

  return midi;
}

export function generateScaleNotes(root: number, scaleId: string, count: number): number[] {
  const scale = SCALES.find((s) => s.id === scaleId) ?? SCALES[0];
  const clampedRoot = Math.max(0, Math.min(127, Math.round(root)));
  const intervals = scale.intervals;
  const result: number[] = [];

  for (let i = 0; i < count; i++) {
    const octaveWrap = Math.floor(i / intervals.length);
    const interval = intervals[i % intervals.length];
    const note = clampedRoot + octaveWrap * 12 + interval;
    result.push(Math.max(0, Math.min(127, note)));
  }

  return result;
}
