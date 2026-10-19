/**
 * Modelo do instrumento: baixo de 4 cordas, afinação padrão (E1 A1 D2 G2).
 * Índice da corda: 0 = E (mais grave) … 3 = G (mais aguda).
 */

/** Última casa disponível na etapa 1 (0 = corda solta). */
export const MAX_FRET = 12;

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface BassString {
  /** Nome curto usado na interface ("E", "A", "D", "G"). */
  label: string;
  /** Número MIDI da corda solta. */
  openMidi: number;
}

export const STRINGS: readonly BassString[] = [
  { label: 'E', openMidi: 28 }, // E1 ≈ 41,20 Hz
  { label: 'A', openMidi: 33 }, // A1 = 55 Hz
  { label: 'D', openMidi: 38 }, // D2 ≈ 73,42 Hz
  { label: 'G', openMidi: 43 }, // G2 ≈ 98 Hz
];

export interface Position {
  /** 0..3 (0 = E). */
  string: number;
  /** 0..MAX_FRET (0 = corda solta). */
  fret: number;
  midi: number;
  /** Nome com oitava científica, ex.: "A1", "C#2". */
  name: string;
}

/** Frequência em Hz de um número MIDI (A4 = 69 = 440 Hz). */
export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Nome da nota em sustenidos com oitava científica (C4 = MIDI 60). */
export function midiToName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

/** Frequência da corda solta, em Hz. */
export function openStringFrequency(string: number): number {
  return midiToFrequency(STRINGS[string].openMidi);
}

/** f = f_corda_solta × 2^(casa/12) */
export function frequencyAt(string: number, fret: number): number {
  return openStringFrequency(string) * 2 ** (fret / 12);
}

export function positionAt(string: number, fret: number): Position {
  if (!Number.isInteger(string) || string < 0 || string >= STRINGS.length) {
    throw new RangeError(`Corda inválida: ${string}`);
  }
  if (!Number.isInteger(fret) || fret < 0) {
    throw new RangeError(`Casa inválida: ${fret}`);
  }
  const midi = STRINGS[string].openMidi + fret;
  return { string, fret, midi, name: midiToName(midi) };
}

/** Todas as posições do braço, corda por corda, da casa 0 até maxFret. */
export function allPositions(maxFret: number = MAX_FRET): Position[] {
  const positions: Position[] = [];
  for (let s = 0; s < STRINGS.length; s++) {
    for (let f = 0; f <= maxFret; f++) positions.push(positionAt(s, f));
  }
  return positions;
}

export function frequencyOf(position: Position): number {
  return frequencyAt(position.string, position.fret);
}

export function samePosition(a: Position | null, b: Position | null): boolean {
  return a !== null && b !== null && a.string === b.string && a.fret === b.fret;
}

/** Posições com exatamente a mesma altura (mesmo MIDI), exceto a própria. */
export function equivalentPositions(target: Position, positions: readonly Position[]): Position[] {
  return positions.filter((p) => p.midi === target.midi && !samePosition(p, target));
}

/** Nota mais grave e mais aguda disponíveis no braço (MIDI). */
export function midiRange(maxFret: number = MAX_FRET): { low: number; high: number } {
  return { low: STRINGS[0].openMidi, high: STRINGS[STRINGS.length - 1].openMidi + maxFret };
}

const INTERVAL_NAMES = [
  'uníssono',
  '2ª menor',
  '2ª maior',
  '3ª menor',
  '3ª maior',
  '4ª justa',
  'trítono',
  '5ª justa',
  '6ª menor',
  '6ª maior',
  '7ª menor',
  '7ª maior',
  'oitava',
] as const;

/** Nome do intervalo em semitons (sem sinal); acima da oitava, "oitava + …". */
export function intervalName(semitones: number): string {
  const n = Math.abs(Math.round(semitones));
  if (n <= 12) return INTERVAL_NAMES[n];
  const octaves = Math.floor(n / 12);
  const rest = n % 12;
  const base = octaves === 1 ? 'oitava' : `${octaves} oitavas`;
  return rest === 0 ? base : `${base} + ${INTERVAL_NAMES[rest]}`;
}

/** "3ª menor ↑", "2ª maior ↓". */
export function describeInterval(fromMidi: number, toMidi: number): string {
  const diff = toMidi - fromMidi;
  const arrow = diff > 0 ? ' ↑' : diff < 0 ? ' ↓' : '';
  return `${intervalName(diff)}${arrow}`;
}

/** "corda E, casa 5" ou "corda A, solta". */
export function describePosition(position: Position): string {
  const label = STRINGS[position.string].label;
  return position.fret === 0 ? `corda ${label}, solta` : `corda ${label}, casa ${position.fret}`;
}
