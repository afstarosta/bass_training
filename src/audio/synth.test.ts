import { describe, expect, it } from 'vitest';
import { filterStartCutoff, loudnessCompensation } from './synth';
import { frequencyAt } from '../fretboard/model';

describe('síntese', () => {
  it('graves recebem mais ganho que agudos, dentro de limites', () => {
    const low = loudnessCompensation(frequencyAt(0, 0));
    const high = loudnessCompensation(frequencyAt(3, 12));
    expect(low).toBeGreaterThan(high);
    expect(low).toBeLessThan(1.31);
    expect(high).toBeGreaterThan(0.74);
  });

  it('referência A1 = 1', () => {
    expect(loudnessCompensation(55)).toBeCloseTo(1, 6);
  });

  it('corte inicial do filtro acima da fundamental e limitado', () => {
    expect(filterStartCutoff(41.2)).toBeGreaterThan(41.2 * 4);
    expect(filterStartCutoff(1000)).toBe(5000);
  });
});
