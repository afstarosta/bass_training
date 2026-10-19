import { describe, expect, it } from 'vitest';
import { MAX_FRET, STRINGS, allPositions, midiRange, positionAt } from '../fretboard/model';
import {
  CHORDS,
  COMPLEXITY_LEVELS,
  MAX_COMPLEXITY,
  MAX_SEQUENCE_LENGTH,
  MIN_SEQUENCE_LENGTH,
  SCALES,
  arpeggioOffsets,
  describePattern,
  fingerSequence,
  generateSequence,
  scaleNotesInRange,
  scaleOffsets,
} from './sequence';

/** Gerador determinístico (mulberry32) para testes reprodutíveis. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const major = SCALES.find((s) => s.name === 'maior')!;
const minor = SCALES.find((s) => s.name === 'menor')!;
const minorTriad = CHORDS.find((c) => c.name === 'menor')!;

describe('materiais', () => {
  it('trecho de escala: graus vizinhos', () => {
    expect(scaleOffsets(major, 0, 4)).toEqual([0, 2, 4, 5]); // dó ré mi fá
    expect(scaleOffsets(minor, 0, 3)).toEqual([0, 2, 3]); // lá si dó
    expect(scaleOffsets(major, 6, 3)).toEqual([11, 12, 14]); // si dó ré (passa da oitava)
  });

  it('arpejo: notas do acorde em ordem, atravessando oitavas', () => {
    expect(arpeggioOffsets(minorTriad, 0, 4)).toEqual([0, 3, 7, 12]);
    expect(arpeggioOffsets(minorTriad, 2, 3)).toEqual([7, 12, 15]); // a partir da 5ª
  });

  it('descreve o padrão em português', () => {
    const pattern = { kind: 'scale' as const, quality: 'menor', direction: 'up' as const, offsets: [0, 2, 3] };
    expect(describePattern(pattern, 33)).toBe('trecho da escala de A menor, subindo');
    expect(describePattern({ ...pattern, kind: 'arpeggio', direction: 'down' }, 33)).toBe('arpejo de A menor, descendo');
  });
});

describe('sorteio de sequências', () => {
  const { low, high } = midiRange(MAX_FRET);

  it('respeita o tamanho pedido, de 2 a 6 notas', () => {
    const random = seeded(1);
    for (let n = MIN_SEQUENCE_LENGTH; n <= MAX_SEQUENCE_LENGTH; n++) {
      expect(generateSequence(n, { random }).notes).toHaveLength(n);
    }
  });

  it('rejeita tamanhos fora do intervalo', () => {
    expect(() => generateSequence(1)).toThrow();
    expect(() => generateSequence(MAX_SEQUENCE_LENGTH + 1)).toThrow();
  });

  it('todas as notas cabem no braço e as posições batem com as alturas', () => {
    const random = seeded(7);
    for (let i = 0; i < 500; i++) {
      const n = MIN_SEQUENCE_LENGTH + (i % (MAX_SEQUENCE_LENGTH - MIN_SEQUENCE_LENGTH + 1));
      for (const p of generateSequence(n, { random }).notes) {
        expect(p.midi >= low && p.midi <= high).toBe(true);
        expect(p.fret >= 0 && p.fret <= MAX_FRET).toBe(true);
        expect(p.string >= 0 && p.string < STRINGS.length).toBe(true);
        expect(STRINGS[p.string].openMidi + p.fret).toBe(p.midi);
      }
    }
  });

  it('notas próximas com relação harmônica: só passos de escala ou saltos de arpejo, numa só direção', () => {
    const random = seeded(42);
    // Passos de escala (2ª menor/maior) e saltos entre notas vizinhas de um acorde (3ªs e 4ª).
    const allowed = new Set([1, 2, 3, 4, 5]);
    for (let i = 0; i < 500; i++) {
      const notes = generateSequence(2 + (i % 5), { random }).notes;
      const steps = notes.slice(1).map((p, k) => p.midi - notes[k].midi);
      expect(steps.every((s) => s > 0) || steps.every((s) => s < 0)).toBe(true);
      for (const s of steps) expect(allowed.has(Math.abs(s))).toBe(true);
    }
  });

  it('a descrição corresponde ao material sorteado', () => {
    const random = seeded(3);
    for (let i = 0; i < 200; i++) {
      const { notes, label } = generateSequence(3, { random });
      const ascending = notes[1].midi > notes[0].midi;
      expect(label.endsWith(ascending ? 'subindo' : 'descendo')).toBe(true);
      expect(/^(trecho da escala|arpejo) de [A-G]#? /.test(label)).toBe(true);
    }
  });

  it('sorteia escalas e arpejos, subindo e descendo', () => {
    const random = seeded(9);
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { label } = generateSequence(3, { random });
      kinds.add(`${label.startsWith('arpejo') ? 'arpejo' : 'escala'}-${label.endsWith('subindo') ? 'sobe' : 'desce'}`);
    }
    expect(kinds.size).toBe(4);
  });

  it('não repete a mesma sequência duas vezes seguidas', () => {
    const random = seeded(11);
    let previous: number[] | null = null;
    for (let i = 0; i < 300; i++) {
      const midis: number[] = generateSequence(2, { random, previous }).notes.map((p) => p.midi);
      if (previous) expect(midis.join() === previous.join()).toBe(false);
      previous = midis;
    }
  });
});

describe('digitação', () => {
  it('escolhe a posição mais próxima da anterior', () => {
    const positions = allPositions();
    // A1 → B1 → C2 começando na corda E casa 5 (primeira opção): fica na região da casa 5.
    const notes = fingerSequence([33, 35, 36], positions, () => 0);
    expect(notes[0]).toEqual(positionAt(0, 5));
    expect(notes.map((p) => `${p.string}-${p.fret}`)).toEqual(['0-5', '0-7', '0-8']);
  });
});

describe('complexidade', () => {
  const { low, high } = midiRange(MAX_FRET);
  const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 } as const;

  /** Lê a escala da descrição ("notas da escala de A menor, …") e devolve suas classes de altura. */
  function scaleOf(label: string): Set<number> {
    const m = /escala de ([A-G]#?) (maior|menor)/.exec(label);
    expect(m !== null).toBe(true);
    const scale = SCALES.find((s) => s.name === m![2])!;
    return new Set(scaleNotesInRange(scale, PC[m![1] as keyof typeof PC], 0, 11));
  }

  it('quatro níveis, do mais fácil ao mais difícil', () => {
    expect(MAX_COMPLEXITY).toBe(4);
    expect(COMPLEXITY_LEVELS.map((l) => l.name)).toEqual(['Vizinhas', 'Saltos', 'Saltos grandes', 'Graves']);
  });

  it('notas da escala dentro do registro', () => {
    expect(scaleNotesInRange(minor, 9, 33, 45)).toEqual([33, 35, 36, 38, 40, 41, 43, 45]); // A menor, A1–A2
  });

  for (const level of [2, 3, 4]) {
    it(`nível ${level}: todas as notas pertencem à escala sorteada e nenhuma é vizinha da anterior`, () => {
      const random = seeded(100 + level);
      for (let i = 0; i < 300; i++) {
        const n = 2 + (i % 5);
        const { notes, label } = generateSequence(n, { random, complexity: level });
        expect(notes).toHaveLength(n);
        expect(label.includes('com saltos')).toBe(true);
        const pcs = scaleOf(label);
        for (const p of notes) {
          expect(pcs.has(p.midi % 12)).toBe(true);
          expect(p.midi >= low && p.midi <= high).toBe(true);
          expect(STRINGS[p.string].openMidi + p.fret).toBe(p.midi);
        }
        // Salto mínimo de 3ª (2 graus) = pelo menos 3 semitons.
        for (let k = 1; k < n; k++) expect(Math.abs(notes[k].midi - notes[k - 1].midi) >= 3).toBe(true);
      }
    });
  }

  it('nível 2: saltos de 3ª e 4ª (até 6 semitons)', () => {
    const random = seeded(21);
    for (let i = 0; i < 300; i++) {
      const notes = generateSequence(4, { random, complexity: 2 }).notes;
      for (let k = 1; k < notes.length; k++) expect(Math.abs(notes[k].midi - notes[k - 1].midi) <= 6).toBe(true);
    }
  });

  it('nível 3: saltos até a oitava e, ao longo de várias rodadas, saltos maiores que no nível 2', () => {
    const random = seeded(31);
    let biggest = 0;
    for (let i = 0; i < 300; i++) {
      const notes = generateSequence(4, { random, complexity: 3 }).notes;
      for (let k = 1; k < notes.length; k++) {
        const leap = Math.abs(notes[k].midi - notes[k - 1].midi);
        expect(leap <= 12).toBe(true);
        biggest = Math.max(biggest, leap);
      }
    }
    expect(biggest).toBeGreaterThan(6);
  });

  it('nível 4: só notas graves (E1 a E2), mesmo com 6 notas', () => {
    const random = seeded(41);
    for (let i = 0; i < 300; i++) {
      const { notes, label } = generateSequence(6, { random, complexity: 4 });
      expect(label.endsWith('no grave')).toBe(true);
      for (const p of notes) expect(p.midi >= 28 && p.midi <= 40).toBe(true);
    }
  });

  it('melodias com saltos mudam de direção (não são só escalas)', () => {
    const random = seeded(51);
    let changes = 0;
    for (let i = 0; i < 200; i++) {
      const notes = generateSequence(4, { random, complexity: 2 }).notes;
      const dirs = notes.slice(1).map((p, k) => Math.sign(p.midi - notes[k].midi));
      if (new Set(dirs).size > 1) changes++;
    }
    expect(changes).toBeGreaterThan(0);
  });

  it('nível 1 continua sendo o sorteio de vizinhas', () => {
    const random = seeded(61);
    for (let i = 0; i < 100; i++) {
      const { label } = generateSequence(3, { random, complexity: 1 });
      expect(/^(trecho da escala|arpejo)/.test(label)).toBe(true);
    }
  });
});
