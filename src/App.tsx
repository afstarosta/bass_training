import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { BassSynth } from './audio/synth';
import { Fretboard } from './fretboard/Fretboard';
import { MAX_FRET, allPositions, frequencyOf, type Position } from './fretboard/model';
import {
  accuracy,
  feedbackFor,
  gameReducer,
  initialState,
  pickRandomPosition,
  revealMarkers,
  type GameState,
} from './game/game';
import { MAX_SEQUENCE_LENGTH, MIN_SEQUENCE_LENGTH, generateSequence } from './game/sequence';

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [pulse, setPulse] = useState<{ position: Position; key: number } | null>(null);
  const synthRef = useRef<BassSynth | null>(null);
  const positions = useMemo(() => allPositions(MAX_FRET), []);
  const advanced = state.mode === 'advanced';

  const synth = () => (synthRef.current ??= new BassSynth());

  // O primeiro gesto destrava o áudio (exigência dos navegadores, em especial iOS).
  const play = useCallback((notes: Position[]) => {
    const s = synth();
    void s.unlock();
    if (notes.length === 1) s.play(frequencyOf(notes[0]));
    else s.playSequence(notes.map(frequencyOf));
  }, []);

  const newRound = () => {
    setPulse(null);
    if (advanced) {
      const previous = state.targets.length ? state.targets.map((t) => t.midi) : null;
      const seq = generateSequence(state.sequenceLength, { previous });
      dispatch({ type: 'new-round', targets: seq.notes, label: seq.label });
      play(seq.notes);
    } else {
      const target = pickRandomPosition(positions, state.targets[0] ?? null);
      dispatch({ type: 'new-round', targets: [target] });
      play([target]);
    }
  };

  const repeat = () => {
    if (state.targets.length) play(state.targets);
  };

  const select = (position: Position) => {
    play([position]);
    if (state.phase === 'awaiting') {
      dispatch({ type: 'guess', position });
      setPulse(null);
    } else {
      setPulse((p) => ({ position, key: (p?.key ?? 0) + 1 }));
    }
  };

  const setAdvanced = (on: boolean) => {
    setPulse(null);
    dispatch({ type: 'set-mode', mode: on ? 'advanced' : 'basic' });
  };

  const markers = useMemo(() => revealMarkers(state, positions), [state, positions]);
  const feedback = useMemo(() => feedbackFor(state, positions), [state, positions]);
  const score = state.scores[state.mode];
  const pct = accuracy(score);
  const audioMissing = useMemo(() => !new BassSynth().supported, []);

  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">Treino de ouvido · baixo de 4 cordas</p>
        <h1>{advanced ? 'Que sequência foi essa?' : 'Onde está essa nota?'}</h1>
        <p className="lede">
          {advanced
            ? 'Ouça a sequência — um trecho de escala ou arpejo — e clique as notas no braço na ordem em que tocaram. Vale qualquer posição com a mesma altura.'
            : 'Ouça a nota sorteada e clique no braço onde você acha que ela está. Vale qualquer posição com a mesma altura.'}
        </p>
      </header>

      <main>
        <section className="panel" aria-label="Exercício">
          <div className="modebar">
            <button
              type="button"
              role="switch"
              aria-checked={advanced}
              className="switch"
              onClick={() => setAdvanced(!advanced)}
            >
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
              Modo avançado
            </button>

            {advanced && (
              <div className="stepper" role="group" aria-label="Dificuldade">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => dispatch({ type: 'set-length', length: state.sequenceLength - 1 })}
                  disabled={state.sequenceLength <= MIN_SEQUENCE_LENGTH}
                  aria-label="Diminuir dificuldade"
                >
                  −
                </button>
                <span className="stepper-value" aria-live="polite">
                  <strong>{state.sequenceLength}</strong> notas
                </span>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => dispatch({ type: 'set-length', length: state.sequenceLength + 1 })}
                  disabled={state.sequenceLength >= MAX_SEQUENCE_LENGTH}
                >
                  + Aumentar dificuldade
                </button>
              </div>
            )}
          </div>

          <div className="toolbar">
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={newRound}>
                <span aria-hidden="true">♪</span> {advanced ? 'Nova sequência' : 'Nova nota'}
              </button>
              <button type="button" className="btn" onClick={repeat} disabled={state.targets.length === 0}>
                <span aria-hidden="true">↻</span> Repetir som
              </button>
            </div>

            <dl className="score" aria-label={advanced ? 'Placar de sequências' : 'Placar da sessão'}>
              <div>
                <dt>Acertos</dt>
                <dd className="score-good">{score.hits}</dd>
              </div>
              <div>
                <dt>Erros</dt>
                <dd className="score-bad">{score.misses}</dd>
              </div>
              <div>
                <dt>Aproveitamento</dt>
                <dd>{pct === null ? '—' : `${pct}%`}</dd>
              </div>
            </dl>
          </div>

          <div className={`feedback feedback-${feedback.tone}`} role="status" aria-live="polite">
            <p className="feedback-message">{feedback.message}</p>
            {feedback.detail && <p className="feedback-detail">{feedback.detail}</p>}
            {state.phase === 'answered' && (
              <p className="feedback-hint">
                Clique no braço para comparar sons, ou em {advanced ? 'Nova sequência' : 'Nova nota'} para continuar.
              </p>
            )}
          </div>

          {advanced && state.phase !== 'idle' && <SequenceStrip state={state} />}

          <Fretboard
            maxFret={MAX_FRET}
            markers={markers}
            showNames={state.phase === 'answered'}
            pulse={pulse?.position ?? null}
            pulseKey={pulse?.key ?? 0}
            onSelect={select}
          />

          {audioMissing && (
            <p className="warning">Este navegador não oferece Web Audio; o exercício não vai conseguir tocar som.</p>
          )}
        </section>

        <ul className="legend" aria-label="Legenda">
          <li>
            <span className="swatch swatch-target" /> {advanced ? 'notas sorteadas, numeradas' : 'nota sorteada'}
          </li>
          <li>
            <span className={`swatch ${advanced ? 'swatch-guess' : 'swatch-equivalent'}`} />{' '}
            {advanced ? 'palpite certo em outra posição' : 'mesma altura em outra posição'}
          </li>
          <li>
            <span className="swatch swatch-wrong" /> {advanced ? 'palpite errado' : 'seu palpite errado'}
          </li>
        </ul>
      </main>

      <footer className="footer">
        Afinação padrão E1 · A1 · D2 · G2 — casas 0 a {MAX_FRET}. Funciona offline depois de carregado.
      </footer>
    </div>
  );
}

/** Uma casinha por nota da sequência: pendente, certa ou errada. */
function SequenceStrip({ state }: { state: GameState }) {
  const answered = state.phase === 'answered';
  return (
    <ol className="strip" aria-label="Notas da sequência">
      {state.targets.map((target, i) => {
        const guess = state.guesses[i];
        const result = state.results[i];
        const status = guess === undefined ? (i === state.guesses.length ? 'current' : 'pending') : result ? 'right' : 'wrong';
        const label =
          status === 'right' ? 'certa' : status === 'wrong' ? 'errada' : status === 'current' ? 'sua vez' : 'pendente';
        return (
          <li key={i} className={`slot slot-${status}`} aria-label={`Nota ${i + 1}: ${label}`}>
            <span className="slot-index">{i + 1}</span>
            <span className="slot-mark" aria-hidden="true">
              {status === 'right' ? '✓' : status === 'wrong' ? '✗' : status === 'current' ? '?' : '·'}
            </span>
            {answered && (
              <span className="slot-names">
                <strong>{target.name}</strong>
                {!result && guess && <span className="slot-guess">você: {guess.name}</span>}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
