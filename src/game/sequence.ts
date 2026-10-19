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

export interface GenerateOptions {
  /** Alturas da sequência anterior, para não repetir a mesma. */
  previous?: readonly number[] | null;
  random?: Random;
  maxFret?: number;
}

export function generateSequence(length: number, options: GenerateOptions = {}): Sequence {
  const { previous = null, random = Math.random, maxFret = MAX_FRET } = options;
  if (!Number.isInteger(length) || length < MIN_SEQUENCE_LENGTH || length > MAX_SEQUENCE_LENGTH) {
    throw new RangeError(`Tamanho de sequência inválido: ${length}`);
  }
  const { low, high } = midiRange(maxFret);
  const positions = allPositions(maxFret);

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
    if (previous && previous.length === midis.length && previous.every((m, i) => m === midis[i])) continue;
    return { notes: fingerSequence(midis, positions, random), label: describePattern(pattern, root) };
  }
  throw new Error('Não foi possível sortear uma sequência');
}
