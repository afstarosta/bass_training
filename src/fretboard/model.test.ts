import { describe, expect, it } from 'vitest';
import {
  MAX_FRET,
  allPositions,
  describeInterval,
  describePosition,
  equivalentPositions,
  frequencyAt,
  intervalName,
  midiToFrequency,
  midiToName,
  openStringFrequency,
  positionAt,
} from './model';

describe('frequências', () => {
  it('cordas soltas na afinação padrão', () => {
    expect(openStringFrequency(0)).toBeCloseTo(41.2, 2); // E1
    expect(openStringFrequency(1)).toBeCloseTo(55, 5); // A1
    expect(openStringFrequency(2)).toBeCloseTo(73.42, 2); // D2
    expect(openStringFrequency(3)).toBeCloseTo(98, 1); // G2
  });

  it('A4 = 440 Hz', () => {
    expect(midiToFrequency(69)).toBe(440);
  });

  it('f = f_solta × 2^(casa/12)', () => {
    expect(frequencyAt(0, 12)).toBeCloseTo(openStringFrequency(0) * 2, 6);
    expect(frequencyAt(1, 7)).toBeCloseTo(55 * 2 ** (7 / 12), 6);
  });

  it('corda E casa 5 tem a mesma frequência da corda A solta', () => {
    expect(frequencyAt(0, 5)).toBeCloseTo(frequencyAt(1, 0), 6);
  });
});

describe('nomes de notas', () => {
  it('sustenidos com oitava científica', () => {
    expect(midiToName(28)).toBe('E1');
    expect(midiToName(33)).toBe('A1');
    expect(midiToName(36)).toBe('C2');
    expect(midiToName(37)).toBe('C#2');
    expect(midiToName(60)).toBe('C4');
  });

  it('posições conhecidas do braço', () => {
    expect(positionAt(0, 0).name).toBe('E1');
    expect(positionAt(0, 1).name).toBe('F1');
    expect(positionAt(1, 3).name).toBe('C2');
    expect(positionAt(2, 12).name).toBe('D3');
    expect(positionAt(3, 12).name).toBe('G3');
  });
});

describe('posições', () => {
  it('4 cordas × (MAX_FRET + 1) posições, sem duplicatas', () => {
    const all = allPositions();
    expect(all).toHaveLength(4 * (MAX_FRET + 1));
    const keys = new Set(all.map((p) => `${p.string}-${p.fret}`));
    expect(keys.size).toBe(all.length);
  });

  it('estrutura { string, fret, midi, name }', () => {
    expect(positionAt(1, 2)).toEqual({ string: 1, fret: 2, midi: 35, name: 'B1' });
  });

  it('rejeita corda ou casa inválidas', () => {
    expect(() => positionAt(4, 0)).toThrow();
    expect(() => positionAt(0, -1)).toThrow();
  });

  it('posições equivalentes têm o mesmo MIDI e excluem a própria', () => {
    const all = allPositions();
    const target = positionAt(1, 5); // D2
    const eq = equivalentPositions(target, all);
    expect(eq.map((p) => `${p.string}-${p.fret}`).sort()).toEqual(['0-10', '2-0']);
  });

  it('E1 só existe na corda E solta', () => {
    expect(equivalentPositions(positionAt(0, 0), allPositions())).toHaveLength(0);
  });

  it('descrição em português', () => {
    expect(describePosition(positionAt(0, 5))).toBe('corda E, casa 5');
    expect(describePosition(positionAt(1, 0))).toBe('corda A, solta');
  });
});

describe('intervalos', () => {
  it('nomes em português', () => {
    expect(intervalName(2)).toBe('2ª maior');
    expect(intervalName(-3)).toBe('3ª menor');
    expect(intervalName(7)).toBe('5ª justa');
    expect(intervalName(12)).toBe('oitava');
    expect(intervalName(15)).toBe('oitava + 3ª menor');
    expect(describeInterval(33, 35)).toBe('2ª maior ↑');
    expect(describeInterval(38, 33)).toBe('4ª justa ↓');
  });
});
