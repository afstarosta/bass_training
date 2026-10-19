import { describe, expect, it } from 'vitest';
import { allPositions, positionAt } from '../fretboard/model';
import {
  accuracy,
  feedbackFor,
  gameReducer,
  initialState,
  isCorrectGuess,
  pickRandomPosition,
  revealMarkers,
  type GameState,
} from './game';

const positions = allPositions();

function answered(target = positionAt(0, 5), guess = positionAt(0, 5)): GameState {
  const s1 = gameReducer(initialState, { type: 'new-note', target });
  return gameReducer(s1, { type: 'guess', position: guess });
}

describe('regra de acerto (mesmo MIDI)', () => {
  it('mesma posição é acerto', () => {
    expect(isCorrectGuess(positionAt(0, 5), positionAt(0, 5))).toBe(true);
  });

  it('posição diferente com a mesma altura é acerto', () => {
    expect(isCorrectGuess(positionAt(0, 5), positionAt(1, 0))).toBe(true);
  });

  it('mesma nota em outra oitava é erro', () => {
    expect(isCorrectGuess(positionAt(1, 0), positionAt(1, 12))).toBe(false); // A1 × A2
  });

  it('altura diferente é erro', () => {
    expect(isCorrectGuess(positionAt(0, 5), positionAt(0, 6))).toBe(false);
  });
});

describe('sorteio', () => {
  it('nunca repete a posição anterior', () => {
    const previous = positionAt(2, 7);
    for (let i = 0; i < 200; i++) {
      const p = pickRandomPosition(positions, previous);
      expect(p.string === previous.string && p.fret === previous.fret).toBe(false);
    }
  });

  it('usa o gerador fornecido e cobre os extremos', () => {
    expect(pickRandomPosition(positions, null, () => 0)).toEqual(positions[0]);
    expect(pickRandomPosition(positions, null, () => 0.999999)).toEqual(positions[positions.length - 1]);
  });

  it('é uniforme entre as posições restantes', () => {
    const previous = positions[0];
    const pool = positions.length - 1;
    const counts = new Map<string, number>();
    for (let i = 0; i < pool; i++) {
      const p = pickRandomPosition(positions, previous, () => (i + 0.5) / pool);
      const key = `${p.string}-${p.fret}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(pool);
  });
});

describe('estado do exercício', () => {
  it('começa ocioso e com placar zerado', () => {
    expect(initialState.phase).toBe('idle');
    expect(initialState.score).toEqual({ hits: 0, misses: 0 });
  });

  it('palpite antes de sortear não altera nada (modo livre)', () => {
    const next = gameReducer(initialState, { type: 'guess', position: positionAt(0, 0) });
    expect(next).toBe(initialState);
  });

  it('acerto encerra a rodada e soma ao placar', () => {
    const s = answered(positionAt(0, 5), positionAt(1, 0));
    expect(s.phase).toBe('answered');
    expect(s.correct).toBe(true);
    expect(s.score).toEqual({ hits: 1, misses: 0 });
  });

  it('erro encerra a rodada e soma ao placar', () => {
    const s = answered(positionAt(0, 5), positionAt(0, 7));
    expect(s.correct).toBe(false);
    expect(s.score).toEqual({ hits: 0, misses: 1 });
  });

  it('cliques depois da resposta não contam de novo', () => {
    const s = answered(positionAt(0, 5), positionAt(0, 7));
    const again = gameReducer(s, { type: 'guess', position: positionAt(0, 5) });
    expect(again).toBe(s);
  });

  it('nova nota limpa o palpite e mantém o placar', () => {
    const s = answered(positionAt(0, 5), positionAt(0, 7));
    const next = gameReducer(s, { type: 'new-note', target: positionAt(3, 2) });
    expect(next.phase).toBe('awaiting');
    expect(next.guess).toBe(null);
    expect(next.correct).toBe(null);
    expect(next.score).toEqual({ hits: 0, misses: 1 });
  });

  it('percentual de acertos', () => {
    expect(accuracy({ hits: 0, misses: 0 })).toBe(null);
    expect(accuracy({ hits: 2, misses: 1 })).toBe(67);
    expect(accuracy({ hits: 5, misses: 0 })).toBe(100);
  });
});

describe('revelação e feedback', () => {
  it('erro: sorteada em verde, equivalentes secundárias, palpite em vermelho', () => {
    const s = answered(positionAt(1, 5), positionAt(3, 1)); // D2 × G#2
    const kinds = revealMarkers(s, positions).map((m) => `${m.kind}:${m.position.string}-${m.position.fret}`);
    expect(kinds.sort()).toEqual(['equivalent:0-10', 'equivalent:2-0', 'target:1-5', 'wrong:3-1']);
  });

  it('acerto numa posição equivalente marca o palpite como acerto', () => {
    const s = answered(positionAt(1, 5), positionAt(2, 0));
    const kinds = revealMarkers(s, positions).map((m) => `${m.kind}:${m.position.string}-${m.position.fret}`);
    expect(kinds.sort()).toEqual(['equivalent:0-10', 'guess:2-0', 'target:1-5']);
  });

  it('sem marcações enquanto a rodada está aberta', () => {
    const s = gameReducer(initialState, { type: 'new-note', target: positionAt(0, 3) });
    expect(revealMarkers(s, positions)).toEqual([]);
  });

  it('mensagens', () => {
    expect(feedbackFor(initialState, positions).message).toBe('Clique em Nova nota para começar.');

    const hit = feedbackFor(answered(positionAt(0, 5), positionAt(0, 5)), positions);
    expect(hit.tone).toBe('success');
    expect(hit.message).toBe('Acertou! Era A1 (corda E, casa 5).');
    expect(hit.detail).toBe('Mesma altura também em: corda A, solta.');

    const miss = feedbackFor(answered(positionAt(0, 5), positionAt(1, 3)), positions);
    expect(miss.tone).toBe('error');
    expect(miss.message).toBe('Errou. Você clicou em C2 (corda A, casa 3); a nota era A1 (corda E, casa 5).');
  });
});
