import {
  allPositions,
  describeInterval,
  describePosition,
  equivalentPositions,
  samePosition,
  type Position,
} from '../fretboard/model';
import { MAX_SEQUENCE_LENGTH, MIN_SEQUENCE_LENGTH, MIN_COMPLEXITY, complexityLevel } from './sequence';

/**
 * Estado do exercício. O modo básico é uma "sequência" de uma nota só; o modo
 * avançado sorteia de 2 a 6 notas, que o usuário clica na ordem em que tocaram.
 *  - idle: nada sorteado; cliques só tocam o som.
 *  - awaiting: esperando os palpites (um por nota, em ordem).
 *  - answered: rodada encerrada; cliques só tocam o som até a próxima.
 */
export type Phase = 'idle' | 'awaiting' | 'answered';
export type Mode = 'basic' | 'advanced';

export interface Score {
  hits: number;
  misses: number;
}

export interface GameState {
  mode: Mode;
  /** Notas por sequência no modo avançado. */
  sequenceLength: number;
  /** Complexidade das sequências no modo avançado (1 a 4). */
  complexity: number;
  phase: Phase;
  targets: Position[];
  /** Descrição da sequência sorteada (só no modo avançado). */
  label: string | null;
  guesses: Position[];
  /** Resultado de cada palpite, na mesma ordem de `guesses`. */
  results: boolean[];
  /** Resultado da rodada inteira (todas as notas certas); null até terminar. */
  correct: boolean | null;
  /** Placar separado por modo: uma nota e sequências inteiras não se misturam. */
  scores: Record<Mode, Score>;
}

export type GameAction =
  | { type: 'new-round'; targets: Position[]; label?: string | null }
  | { type: 'guess'; position: Position }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'set-length'; length: number }
  | { type: 'set-complexity'; complexity: number };

const emptyRound = {
  phase: 'idle' as Phase,
  targets: [] as Position[],
  label: null,
  guesses: [] as Position[],
  results: [] as boolean[],
  correct: null,
};

export const initialState: GameState = {
  mode: 'basic',
  sequenceLength: MIN_SEQUENCE_LENGTH,
  complexity: MIN_COMPLEXITY,
  ...emptyRound,
  scores: { basic: { hits: 0, misses: 0 }, advanced: { hits: 0, misses: 0 } },
};

/**
 * Regra de acerto: vale qualquer posição com a mesma altura exata
 * (mesmo número MIDI) da nota sorteada.
 */
export function isCorrectGuess(target: Position, guess: Position): boolean {
  return target.midi === guess.midi;
}

/** Uma sequência só conta como acerto se todas as notas estiverem certas, na ordem. */
export function isCorrectSequence(targets: readonly Position[], guesses: readonly Position[]): boolean {
  return targets.length === guesses.length && targets.every((t, i) => isCorrectGuess(t, guesses[i]));
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

export function clampLength(length: number): number {
  return Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(length)));
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'new-round':
      if (action.targets.length === 0) return state;
      return { ...state, ...emptyRound, phase: 'awaiting', targets: action.targets, label: action.label ?? null };

    case 'guess': {
      // Fora de uma rodada ativa, o clique é "modo livre": não altera o estado.
      if (state.phase !== 'awaiting') return state;
      const index = state.guesses.length;
      const guesses = [...state.guesses, action.position];
      const results = [...state.results, isCorrectGuess(state.targets[index], action.position)];
      if (guesses.length < state.targets.length) return { ...state, guesses, results };

      const correct = results.every(Boolean);
      const score = state.scores[state.mode];
      return {
        ...state,
        phase: 'answered',
        guesses,
        results,
        correct,
        scores: {
          ...state.scores,
          [state.mode]: { hits: score.hits + (correct ? 1 : 0), misses: score.misses + (correct ? 0 : 1) },
        },
      };
    }

    case 'set-mode':
      if (action.mode === state.mode) return state;
      return { ...state, ...emptyRound, mode: action.mode };

    case 'set-length': {
      const sequenceLength = clampLength(action.length);
      if (sequenceLength === state.sequenceLength) return state;
      // Mudar a dificuldade no meio de uma sequência encerra a rodada sem pontuar.
      const round = state.mode === 'advanced' ? emptyRound : {};
      return { ...state, ...round, sequenceLength };
    }

    case 'set-complexity': {
      const complexity = complexityLevel(action.complexity).level;
      if (complexity === state.complexity) return state;
      // Como a dificuldade, mudar no meio de uma sequência descarta a rodada.
      const round = state.mode === 'advanced' ? emptyRound : {};
      return { ...state, ...round, complexity };
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
  /** Ordem na sequência (1, 2, 3…), só no modo avançado. */
  order?: number;
}

/**
 * Marcações no braço.
 * Modo básico, depois da resposta: sorteada (verde), equivalentes (verde
 * tracejado), palpite correto em posição equivalente (contorno verde),
 * palpite errado (vermelho).
 * Modo avançado: durante a rodada, cada palpite aparece numerado em verde ou
 * vermelho; no fim, as posições sorteadas aparecem numeradas em verde.
 */
export function revealMarkers(state: GameState, positions: readonly Position[] = allPositions()): Marker[] {
  if (state.mode === 'advanced') {
    const markers: Marker[] = [];
    if (state.phase === 'answered') {
      state.targets.forEach((t, i) => markers.push({ position: t, kind: 'target', order: i + 1 }));
    }
    state.guesses.forEach((g, i) => {
      const right = state.results[i];
      if (state.phase === 'answered' && right && samePosition(g, state.targets[i])) return;
      markers.push({ position: g, kind: right ? 'guess' : 'wrong', order: i + 1 });
    });
    return markers;
  }

  if (state.phase !== 'answered') return [];
  const target = state.targets[0];
  const guess = state.guesses[0];
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

/** "2ª maior ↑ · 2ª menor ↑" */
export function describeIntervals(targets: readonly Position[]): string {
  return targets
    .slice(1)
    .map((t, i) => describeInterval(targets[i].midi, t.midi))
    .join(' · ');
}

function advancedFeedback(state: GameState): Feedback {
  const { phase, targets, guesses, results, correct, label } = state;
  const n = targets.length;

  if (phase === 'idle') {
    return { tone: 'neutral', message: `Clique em Nova sequência para ouvir ${state.sequenceLength} notas.` };
  }
  if (phase === 'awaiting') {
    const k = guesses.length;
    if (k === 0) return { tone: 'neutral', message: `Ouça a sequência e clique as ${n} notas na ordem em que tocaram.` };
    const last = results[k - 1];
    return {
      tone: 'neutral',
      message: `Nota ${k}: ${last ? 'certa' : 'errada'}. Agora a nota ${k + 1} de ${n}.`,
    };
  }

  const names = targets.map((t) => t.name).join(' → ');
  const about = label ? ` (${label})` : '';
  const detail = `Intervalos: ${describeIntervals(targets)}.`;
  if (correct) {
    return { tone: 'success', message: `Acertou a sequência! ${names}${about}.`, detail };
  }
  const wrong = results.filter((r) => !r).length;
  return {
    tone: 'error',
    message: `Errou ${wrong} de ${n} ${n === 1 ? 'nota' : 'notas'}. A sequência era ${names}${about}.`,
    detail,
  };
}

export function feedbackFor(state: GameState, positions: readonly Position[] = allPositions()): Feedback {
  if (state.mode === 'advanced') return advancedFeedback(state);

  const { phase, correct } = state;
  const target = state.targets[0];
  const guess = state.guesses[0];

  if (phase === 'idle' || !target) {
    return { tone: 'neutral', message: 'Clique em Nova nota para começar.' };
  }
  if (phase === 'awaiting' || !guess) {
    return { tone: 'neutral', message: 'Ouça e clique no braço onde está a nota.' };
  }

  const others = equivalentPositions(target, positions).filter((p) => !samePosition(p, guess));
  const detail = others.length ? `Mesma altura também em: ${list(others.map(describePosition))}.` : undefined;

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
