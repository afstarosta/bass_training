import {
  allPositions,
  describePosition,
  equivalentPositions,
  samePosition,
  type Position,
} from '../fretboard/model';

/**
 * Estado do exercício.
 *  - idle: nenhuma nota sorteada ainda; cliques só tocam o som.
 *  - awaiting: nota sorteada, esperando o palpite.
 *  - answered: rodada encerrada; cliques só tocam o som até "Nova nota".
 */
export type Phase = 'idle' | 'awaiting' | 'answered';

export interface Score {
  hits: number;
  misses: number;
}

export interface GameState {
  phase: Phase;
  target: Position | null;
  guess: Position | null;
  correct: boolean | null;
  score: Score;
}

export type GameAction =
  | { type: 'new-note'; target: Position }
  | { type: 'guess'; position: Position };

export const initialState: GameState = {
  phase: 'idle',
  target: null,
  guess: null,
  correct: null,
  score: { hits: 0, misses: 0 },
};

/**
 * Regra de acerto da etapa 1: vale qualquer posição com a mesma altura
 * exata (mesmo número MIDI) da nota sorteada.
 */
export function isCorrectGuess(target: Position, guess: Position): boolean {
  return target.midi === guess.midi;
}

/**
 * Sorteio uniforme entre as posições, sem repetir a mesma posição
 * duas vezes seguidas.
 */
export function pickRandomPosition(
  positions: readonly Position[],
  previous: Position | null,
  random: () => number = Math.random,
): Position {
  const pool = previous && positions.length > 1 ? positions.filter((p) => !samePosition(p, previous)) : positions;
  if (pool.length === 0) throw new Error('Nenhuma posição disponível para sortear');
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'new-note':
      return { ...state, phase: 'awaiting', target: action.target, guess: null, correct: null };

    case 'guess': {
      // Fora de uma rodada ativa, o clique é "modo livre": não altera o estado.
      if (state.phase !== 'awaiting' || state.target === null) return state;
      const correct = isCorrectGuess(state.target, action.position);
      return {
        ...state,
        phase: 'answered',
        guess: action.position,
        correct,
        score: {
          hits: state.score.hits + (correct ? 1 : 0),
          misses: state.score.misses + (correct ? 0 : 1),
        },
      };
    }
  }
}

/** Percentual de acertos arredondado; null antes da primeira resposta. */
export function accuracy(score: Score): number | null {
  const total = score.hits + score.misses;
  return total === 0 ? null : Math.round((score.hits / total) * 100);
}

export type MarkerKind = 'target' | 'equivalent' | 'wrong' | 'guess';

export interface Marker {
  position: Position;
  kind: MarkerKind;
}

/**
 * Marcações a desenhar no braço depois da resposta:
 *  - target: posição sorteada (verde);
 *  - guess: palpite correto numa posição equivalente (verde, contorno);
 *  - equivalent: outras posições com a mesma altura (secundário);
 *  - wrong: palpite errado (vermelho).
 */
export function revealMarkers(state: GameState, positions: readonly Position[] = allPositions()): Marker[] {
  if (state.phase !== 'answered' || !state.target || !state.guess) return [];
  const { target, guess } = state;
  const markers: Marker[] = [{ position: target, kind: 'target' }];
  for (const p of equivalentPositions(target, positions)) {
    markers.push({ position: p, kind: samePosition(p, guess) ? 'guess' : 'equivalent' });
  }
  if (!state.correct) markers.push({ position: guess, kind: 'wrong' });
  return markers;
}

export interface Feedback {
  tone: 'neutral' | 'success' | 'error';
  message: string;
  detail?: string;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('; ')} e ${items[items.length - 1]}`;
}

export function feedbackFor(state: GameState, positions: readonly Position[] = allPositions()): Feedback {
  const { phase, target, guess, correct } = state;

  if (phase === 'idle' || !target) {
    return { tone: 'neutral', message: 'Clique em Nova nota para começar.' };
  }
  if (phase === 'awaiting' || !guess) {
    return { tone: 'neutral', message: 'Ouça e clique no braço onde está a nota.' };
  }

  const others = equivalentPositions(target, positions).filter((p) => !samePosition(p, guess));
  const detail = others.length
    ? `Mesma altura também em: ${list(others.map(describePosition))}.`
    : undefined;

  if (correct) {
    const via = samePosition(guess, target) ? '' : ` Você clicou em ${describePosition(guess)}, que tem a mesma altura.`;
    return {
      tone: 'success',
      message: `Acertou! Era ${target.name} (${describePosition(target)}).${via}`,
      detail,
    };
  }

  return {
    tone: 'error',
    message: `Errou. Você clicou em ${guess.name} (${describePosition(guess)}); a nota era ${target.name} (${describePosition(target)}).`,
    detail,
  };
}
