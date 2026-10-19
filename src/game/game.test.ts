import { describe, expect, it } from 'vitest';
import { allPositions, positionAt, type Position } from '../fretboard/model';
import {
  accuracy,
  describeIntervals,
  feedbackFor,
  gameReducer,
  initialState,
  isCorrectGuess,
  isCorrectSequence,
  pickRandomPosition,
  revealMarkers,
  type GameState,
} from './game';

const positions = allPositions();

function answered(target = positionAt(0, 5), guess = positionAt(0, 5)): GameState {
  const s1 = gameReducer(initialState, { type: 'new-round', targets: [target] });
  return gameReducer(s1, { type: 'guess', position: guess });
}

function advanced(length = 3): GameState {
  return gameReducer(gameReducer(initialState, { type: 'set-mode', mode: 'advanced' }), {
    type: 'set-length',
    length,
  });
}

function playSequence(targets: Position[], guesses: Position[], label = 'trecho da escala de A menor, subindo') {
  let s = gameReducer(advanced(targets.length), { type: 'new-round', targets, label });
  for (const g of guesses) s = gameReducer(s, { type: 'guess', position: g });
  return s;
}

const key = (p: Position) => `${p.string}-${p.fret}`;

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

describe('regra de acerto de sequências', () => {
  const abc = [positionAt(1, 0), positionAt(1, 2), positionAt(1, 3)]; // A1 B1 C2

  it('todas as notas certas, na ordem, é acerto', () => {
    expect(isCorrectSequence(abc, abc)).toBe(true);
  });

  it('posições equivalentes contam (mesmo MIDI)', () => {
    expect(isCorrectSequence(abc, [positionAt(0, 5), positionAt(0, 7), positionAt(0, 8)])).toBe(true);
  });

  it('ordem trocada é erro', () => {
    expect(isCorrectSequence(abc, [abc[1], abc[0], abc[2]])).toBe(false);
  });

  it('uma nota errada derruba a sequência', () => {
    expect(isCorrectSequence(abc, [abc[0], abc[1], positionAt(1, 4)])).toBe(false);
  });

  it('quantidade diferente é erro', () => {
    expect(isCorrectSequence(abc, abc.slice(0, 2))).toBe(false);
  });
});

describe('sorteio de uma nota', () => {
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
      counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
    }
    expect(counts.size).toBe(pool);
  });
});

describe('modo básico (comportamento da etapa 1)', () => {
  it('começa ocioso, no modo básico, com placares zerados', () => {
    expect(initialState.phase).toBe('idle');
    expect(initialState.mode).toBe('basic');
    expect(initialState.scores.basic).toEqual({ hits: 0, misses: 0 });
    expect(initialState.scores.advanced).toEqual({ hits: 0, misses: 0 });
  });

  it('palpite antes de sortear não altera nada (modo livre)', () => {
    const next = gameReducer(initialState, { type: 'guess', position: positionAt(0, 0) });
    expect(next).toBe(initialState);
  });

  it('acerto encerra a rodada e soma ao placar', () => {
    const s = answered(positionAt(0, 5), positionAt(1, 0));
    expect(s.phase).toBe('answered');
    expect(s.correct).toBe(true);
    expect(s.scores.basic).toEqual({ hits: 1, misses: 0 });
  });

  it('erro encerra a rodada e soma ao placar', () => {
    const s = answered(positionAt(0, 5), positionAt(0, 7));
    expect(s.correct).toBe(false);
    expect(s.scores.basic).toEqual({ hits: 0, misses: 1 });
  });

  it('cliques depois da resposta não contam de novo', () => {
    const s = answered(positionAt(0, 5), positionAt(0, 7));
    const again = gameReducer(s, { type: 'guess', position: positionAt(0, 5) });
    expect(again).toBe(s);
  });

  it('nova nota limpa o palpite e mantém o placar', () => {
    const s = answered(positionAt(0, 5), positionAt(0, 7));
    const next = gameReducer(s, { type: 'new-round', targets: [positionAt(3, 2)] });
    expect(next.phase).toBe('awaiting');
    expect(next.guesses).toEqual([]);
    expect(next.correct).toBe(null);
    expect(next.scores.basic).toEqual({ hits: 0, misses: 1 });
  });

  it('percentual de acertos', () => {
    expect(accuracy({ hits: 0, misses: 0 })).toBe(null);
    expect(accuracy({ hits: 2, misses: 1 })).toBe(67);
    expect(accuracy({ hits: 5, misses: 0 })).toBe(100);
  });

  it('erro: sorteada em verde, equivalentes secundárias, palpite em vermelho', () => {
    const s = answered(positionAt(1, 5), positionAt(3, 1)); // D2 × G#2
    const kinds = revealMarkers(s, positions).map((m) => `${m.kind}:${key(m.position)}`);
    expect(kinds.sort()).toEqual(['equivalent:0-10', 'equivalent:2-0', 'target:1-5', 'wrong:3-1']);
  });

  it('acerto numa posição equivalente marca o palpite como acerto', () => {
    const s = answered(positionAt(1, 5), positionAt(2, 0));
    const kinds = revealMarkers(s, positions).map((m) => `${m.kind}:${key(m.position)}`);
    expect(kinds.sort()).toEqual(['equivalent:0-10', 'guess:2-0', 'target:1-5']);
  });

  it('sem marcações enquanto a rodada está aberta', () => {
    const s = gameReducer(initialState, { type: 'new-round', targets: [positionAt(0, 3)] });
    expect(revealMarkers(s, positions)).toEqual([]);
  });

  it('mensagens iguais às da etapa 1', () => {
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

describe('modo avançado', () => {
  const abc = [positionAt(1, 0), positionAt(1, 2), positionAt(1, 3)]; // A1 B1 C2

  it('começa com 2 notas e a dificuldade sobe e desce dentro dos limites', () => {
    let s = gameReducer(initialState, { type: 'set-mode', mode: 'advanced' });
    expect(s.sequenceLength).toBe(2);
    s = gameReducer(s, { type: 'set-length', length: s.sequenceLength + 1 });
    expect(s.sequenceLength).toBe(3);
    s = gameReducer(s, { type: 'set-length', length: 1 });
    expect(s.sequenceLength).toBe(2);
    s = gameReducer(s, { type: 'set-length', length: 99 });
    expect(s.sequenceLength).toBe(6);
  });

  it('palpites ficam pendentes até completar a sequência', () => {
    let s = gameReducer(advanced(3), { type: 'new-round', targets: abc });
    s = gameReducer(s, { type: 'guess', position: abc[0] });
    s = gameReducer(s, { type: 'guess', position: positionAt(1, 4) });
    expect(s.phase).toBe('awaiting');
    expect(s.results).toEqual([true, false]);
    expect(s.scores.advanced).toEqual({ hits: 0, misses: 0 });
  });

  it('sequência toda certa soma um acerto', () => {
    const s = playSequence(abc, [positionAt(0, 5), abc[1], abc[2]]);
    expect(s.phase).toBe('answered');
    expect(s.correct).toBe(true);
    expect(s.scores.advanced).toEqual({ hits: 1, misses: 0 });
    expect(s.scores.basic).toEqual({ hits: 0, misses: 0 });
  });

  it('uma nota errada conta a sequência inteira como erro', () => {
    const s = playSequence(abc, [abc[0], positionAt(1, 4), abc[2]]);
    expect(s.correct).toBe(false);
    expect(s.results).toEqual([true, false, true]);
    expect(s.scores.advanced).toEqual({ hits: 0, misses: 1 });
  });

  it('trocar de modo encerra a rodada e preserva os placares', () => {
    const s = playSequence(abc, abc);
    const basic = gameReducer(s, { type: 'set-mode', mode: 'basic' });
    expect(basic.phase).toBe('idle');
    expect(basic.targets).toEqual([]);
    expect(basic.scores.advanced).toEqual({ hits: 1, misses: 0 });
  });

  it('mudar a dificuldade no meio da sequência descarta a rodada sem pontuar', () => {
    let s = gameReducer(advanced(3), { type: 'new-round', targets: abc });
    s = gameReducer(s, { type: 'guess', position: abc[0] });
    s = gameReducer(s, { type: 'set-length', length: 4 });
    expect(s.phase).toBe('idle');
    expect(s.scores.advanced).toEqual({ hits: 0, misses: 0 });
  });

  it('durante a rodada mostra só os palpites, numerados', () => {
    let s = gameReducer(advanced(3), { type: 'new-round', targets: abc });
    s = gameReducer(s, { type: 'guess', position: abc[0] });
    s = gameReducer(s, { type: 'guess', position: positionAt(3, 0) });
    const marks = revealMarkers(s, positions).map((m) => `${m.kind}#${m.order}:${key(m.position)}`);
    expect(marks).toEqual(['guess#1:1-0', 'wrong#2:3-0']);
  });

  it('no fim destaca as posições corretas e os palpites errados', () => {
    const s = playSequence(abc, [positionAt(0, 5), positionAt(3, 0), abc[2]]);
    const marks = revealMarkers(s, positions).map((m) => `${m.kind}#${m.order}:${key(m.position)}`);
    expect(marks).toEqual(['target#1:1-0', 'target#2:1-2', 'target#3:1-3', 'guess#1:0-5', 'wrong#2:3-0']);
  });

  it('nomeia os intervalos da sequência', () => {
    expect(describeIntervals(abc)).toBe('2ª maior ↑ · 2ª menor ↑');
    expect(describeIntervals([positionAt(2, 0), positionAt(1, 0)])).toBe('4ª justa ↓');
  });

  it('mensagens do modo avançado', () => {
    expect(feedbackFor(advanced(3), positions).message).toBe('Clique em Nova sequência para ouvir 3 notas.');

    let s = gameReducer(advanced(3), { type: 'new-round', targets: abc });
    expect(feedbackFor(s, positions).message).toBe('Ouça a sequência e clique as 3 notas na ordem em que tocaram.');
    s = gameReducer(s, { type: 'guess', position: abc[0] });
    expect(feedbackFor(s, positions).message).toBe('Nota 1: certa. Agora a nota 2 de 3.');

    const hit = feedbackFor(playSequence(abc, abc), positions);
    expect(hit.tone).toBe('success');
    expect(hit.message).toBe('Acertou a sequência! A1 → B1 → C2 (trecho da escala de A menor, subindo).');
    expect(hit.detail).toBe('Intervalos: 2ª maior ↑ · 2ª menor ↑.');

    const miss = feedbackFor(playSequence(abc, [abc[0], abc[0], abc[0]]), positions);
    expect(miss.tone).toBe('error');
    expect(miss.message).toBe('Errou 2 de 3 notas. A sequência era A1 → B1 → C2 (trecho da escala de A menor, subindo).');
  });
});
