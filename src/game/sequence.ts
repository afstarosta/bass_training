import { MAX_FRET, NOTE_NAMES, allPositions, midiRange, type Position } from '../fretboard/model';

/**
 * Sorteio de sequências para o modo avançado: notas próximas com relação
 * harmônica — trechos de escala (graus vizinhos) ou arpejos (notas do acorde
 * em ordem) — subindo ou descendo, sempre dentro da extensão do braço.
 */

export const MIN_SEQUENCE_LENGTH = 2;
export const MAX_SEQUENCE_LENGTH = 6;

interface ScaleDef {
  name: string;
  /** Semitons entre graus consecutivos, ao longo de uma oitava. */
  steps: readonly number[];
}

interface ChordDef {
  name: string;
  /** Notas do acorde em semitons a partir da fundamental, numa oitava. */
  tones: readonly number[];
}

export const SCALES: readonly ScaleDef[] = [
  { name: 'maior', steps: [2, 2, 1, 2, 2, 2, 1] },
  { name: 'menor', steps: [2, 1, 2, 2, 1, 2, 2] },
];

export const CHORDS: readonly ChordDef[] = [
  { name: 'maior', tones: [0, 4, 7] },
  { name: 'menor', tones: [0, 3, 7] },
  { name: 'com 7ª', tones: [0, 4, 7, 10] },
  { name: 'menor com 7ª', tones: [0, 3, 7, 10] },
];

export type PatternKind = 'scale' | 'arpeggio';
export type Direction = 'up' | 'down';

export interface SequencePattern {
  kind: PatternKind;
  /** Nome do material: "maior", "menor com 7ª"… */
  quality: string;
  direction: Direction;
  /** Alturas relativas à fundamental do tom/acorde, já na ordem tocada. */
  offsets: number[];
}

export interface Sequence {
  notes: Position[];
  /** Ex.: "trecho da escala de A menor, subindo". */
  label: string;
}

type Random = () => number;

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function randomInt(min: number, max: number, random: Random): number {
  return min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
}

/** Trecho de escala com `length` graus vizinhos, a partir de um grau qualquer. */
export function scaleOffsets(scale: ScaleDef, startDegree: number, length: number): number[] {
  let start = 0;
  for (let d = 0; d < startDegree; d++) start += scale.steps[d % scale.steps.length];
  const offsets = [start];
  for (let i = 1; i < length; i++) {
    offsets.push(offsets[i - 1] + scale.steps[(startDegree + i - 1) % scale.steps.length]);
  }
  return offsets;
}

/** Arpejo com `length` notas consecutivas do acorde, a partir de uma inversão qualquer. */
export function arpeggioOffsets(chord: ChordDef, startTone: number, length: number): number[] {
  const n = chord.tones.length;
  return Array.from({ length }, (_, i) => {
    const k = startTone + i;
    return chord.tones[k % n] + 12 * Math.floor(k / n);
  });
}

export function randomPattern(length: number, random: Random = Math.random): SequencePattern {
  const direction: Direction = random() < 0.5 ? 'up' : 'down';
  let kind: PatternKind;
  let quality: string;
  let ascending: number[];

  if (random() < 0.5) {
    const scale = pick(SCALES, random);
    kind = 'scale';
    quality = scale.name;
    ascending = scaleOffsets(scale, randomInt(0, scale.steps.length - 1, random), length);
  } else {
    const chord = pick(CHORDS, random);
    kind = 'arpeggio';
    quality = chord.name;
    ascending = arpeggioOffsets(chord, randomInt(0, chord.tones.length - 1, random), length);
  }

  return { kind, quality, direction, offsets: direction === 'up' ? ascending : [...ascending].reverse() };
}

function pitchClassName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

export function describePattern(pattern: SequencePattern, rootMidi: number): string {
  const root = pitchClassName(rootMidi);
  const dir = pattern.direction === 'up' ? 'subindo' : 'descendo';
  return pattern.kind === 'scale'
    ? `trecho da escala de ${root} ${pattern.quality}, ${dir}`
    : `arpejo de ${root} ${pattern.quality}, ${dir}`;
}

/**
 * Escolhe onde tocar cada altura: a primeira nota numa posição aleatória e as
 * seguintes na posição mais próxima da anterior (digitação confortável).
 */
export function fingerSequence(midis: readonly number[], positions: readonly Position[], random: Random): Position[] {
  const result: Position[] = [];
  for (const midi of midis) {
    const options = positions.filter((p) => p.midi === midi);
    if (options.length === 0) throw new RangeError(`Altura fora do braço: ${midi}`);
    const prev = result[result.length - 1];
    if (!prev) {
      result.push(pick(options, random));
      continue;
    }
    let best = options[0];
    let bestCost = Infinity;
    for (const p of options) {
      const cost = Math.abs(p.fret - prev.fret) + 1.5 * Math.abs(p.string - prev.string);
      if (cost < bestCost) {
        best = p;
        bestCost = cost;
      }
    }
    result.push(best);
  }
  return result;
}

/**
 * Complexidade (independente do número de notas):
 *  1. Vizinhas: graus vizinhos de escala ou notas vizinhas de um arpejo, numa direção.
 *  2. Saltos: notas de uma escala sorteada, pulando 2 a 3 graus (3ªs e 4ªs), em qualquer direção.
 *  3. Saltos grandes: pulando de 2 a 7 graus (de 3ª até oitava).
 *  4. Graves: saltos de 2 a 5 graus restritos ao registro grave (E1 a E2).
 */
export interface ComplexityLevel {
  level: number;
  name: string;
  description: string;
  /** Saltos permitidos, em graus da escala (1 = grau vizinho). Nível 1 usa os padrões de escala/arpejo. */
  degreeLeaps?: readonly number[];
  /** Limite superior do registro, em MIDI (só no nível dos graves). */
  highestMidi?: number;
}

export const COMPLEXITY_LEVELS: readonly ComplexityLevel[] = [
  { level: 1, name: 'Vizinhas', description: 'graus vizinhos de escala e arpejos' },
  { level: 2, name: 'Saltos', description: 'saltos de 3ª e 4ª dentro de uma escala', degreeLeaps: [2, 3] },
  {
    level: 3,
    name: 'Saltos grandes',
    description: 'saltos de 3ª até a oitava dentro de uma escala',
    degreeLeaps: [2, 3, 4, 5, 6, 7],
  },
  {
    level: 4,
    name: 'Graves',
    description: 'saltos no registro grave (E1 a E2)',
    degreeLeaps: [2, 3, 4, 5],
    highestMidi: 40,
  },
];

export const MIN_COMPLEXITY = 1;
export const MAX_COMPLEXITY = COMPLEXITY_LEVELS.length;

export function complexityLevel(level: number): ComplexityLevel {
  const clamped = Math.max(MIN_COMPLEXITY, Math.min(MAX_COMPLEXITY, Math.round(level)));
  return COMPLEXITY_LEVELS[clamped - 1];
}

/** Alturas (MIDI) de uma escala dentro de [low, high], em ordem crescente. */
export function scaleNotesInRange(scale: ScaleDef, rootPitchClass: number, low: number, high: number): number[] {
  const pitchClasses = new Set<number>();
  let pc = rootPitchClass;
  for (const step of scale.steps) {
    pitchClasses.add(((pc % 12) + 12) % 12);
    pc += step;
  }
  const notes: number[] = [];
  for (let m = low; m <= high; m++) if (pitchClasses.has(m % 12)) notes.push(m);
  return notes;
}

/**
 * Melodia com saltos dentro de uma escala sorteada: cada nota pula um número
 * de graus permitido pelo nível, para cima ou para baixo, sem sair do registro.
 */
export function leapingMelody(
  scaleNotes: readonly number[],
  length: number,
  leaps: readonly number[],
  random: Random,
): number[] | null {
  for (let attempt = 0; attempt < 50; attempt++) {
    let index = randomInt(0, scaleNotes.length - 1, random);
    const indices = [index];
    let ok = true;
    for (let i = 1; i < length && ok; i++) {
      const options: number[] = [];
      for (const leap of leaps) {
        if (index + leap < scaleNotes.length) options.push(index + leap);
        if (index - leap >= 0) options.push(index - leap);
      }
      if (options.length === 0) ok = false;
      else {
        index = pick(options, random);
        indices.push(index);
      }
    }
    if (ok) return indices.map((i) => scaleNotes[i]);
  }
  return null;
}

export interface GenerateOptions {
  /** Alturas da sequência anterior, para não repetir a mesma. */
  previous?: readonly number[] | null;
  random?: Random;
  maxFret?: number;
  /** Nível de complexidade, de 1 a 4 (padrão 1). */
  complexity?: number;
}

export function generateSequence(length: number, options: GenerateOptions = {}): Sequence {
  const { previous = null, random = Math.random, maxFret = MAX_FRET, complexity = MIN_COMPLEXITY } = options;
  if (!Number.isInteger(length) || length < MIN_SEQUENCE_LENGTH || length > MAX_SEQUENCE_LENGTH) {
    throw new RangeError(`Tamanho de sequência inválido: ${length}`);
  }
  const { low, high } = midiRange(maxFret);
  const positions = allPositions(maxFret);
  const level = complexityLevel(complexity);
  const isRepeat = (midis: number[]) =>
    previous !== null && previous.length === midis.length && previous.every((m, i) => m === midis[i]);

  if (level.degreeLeaps) {
    const top = Math.min(high, level.highestMidi ?? high);
    for (let attempt = 0; attempt < 100; attempt++) {
      const scale = pick(SCALES, random);
      const rootPc = randomInt(0, 11, random);
      const notes = scaleNotesInRange(scale, rootPc, low, top);
      const midis = leapingMelody(notes, length, level.degreeLeaps, random);
      if (!midis || isRepeat(midis)) continue;
      const register = level.highestMidi ? ', no grave' : '';
      return {
        notes: fingerSequence(midis, positions, random),
        label: `notas da escala de ${NOTE_NAMES[rootPc]} ${scale.name}, com saltos${register}`,
      };
    }
    throw new Error('Não foi possível sortear uma sequência');
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const pattern = randomPattern(length, random);
    const min = Math.min(...pattern.offsets);
    const max = Math.max(...pattern.offsets);
    // Fundamental tal que todas as notas caibam entre a mais grave e a mais aguda.
    const rootLow = low - min;
    const rootHigh = high - max;
    if (rootHigh < rootLow) continue;
    const root = randomInt(rootLow, rootHigh, random);
    const midis = pattern.offsets.map((o) => root + o);
    if (isRepeat(midis)) continue;
    return { notes: fingerSequence(midis, positions, random), label: describePattern(pattern, root) };
  }
  throw new Error('Não foi possível sortear uma sequência');
}
