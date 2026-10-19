import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { BassSynth } from './audio/synth';
import { Fretboard } from './fretboard/Fretboard';
import { MAX_FRET, allPositions, frequencyOf, type Position } from './fretboard/model';
import { accuracy, feedbackFor, gameReducer, initialState, pickRandomPosition, revealMarkers } from './game/game';

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [pulse, setPulse] = useState<{ position: Position; key: number } | null>(null);
  const synthRef = useRef<BassSynth | null>(null);
  const positions = useMemo(() => allPositions(MAX_FRET), []);

  const synth = () => (synthRef.current ??= new BassSynth());

  const play = useCallback((position: Position) => {
    const s = synth();
    // O primeiro gesto destrava o áudio (exigência dos navegadores, em especial iOS).
    void s.unlock();
    s.play(frequencyOf(position));
  }, []);

  const newNote = () => {
    const target = pickRandomPosition(positions, state.target);
    dispatch({ type: 'new-note', target });
    setPulse(null);
    play(target);
  };

  const repeat = () => {
    if (state.target) play(state.target);
  };

  const select = (position: Position) => {
    play(position);
    if (state.phase === 'awaiting') {
      dispatch({ type: 'guess', position });
      setPulse(null);
    } else {
      setPulse((p) => ({ position, key: (p?.key ?? 0) + 1 }));
    }
  };

  const markers = useMemo(() => revealMarkers(state, positions), [state, positions]);
  const feedback = useMemo(() => feedbackFor(state, positions), [state, positions]);
  const pct = accuracy(state.score);
  const audioMissing = useMemo(() => !new BassSynth().supported, []);

  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">Treino de ouvido · baixo de 4 cordas</p>
        <h1>Onde está essa nota?</h1>
        <p className="lede">
          Ouça a nota sorteada e clique no braço onde você acha que ela está. Vale qualquer posição com a mesma
          altura.
        </p>
      </header>

      <main>
        <section className="panel" aria-label="Exercício">
          <div className="toolbar">
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={newNote}>
                <span aria-hidden="true">♪</span> Nova nota
              </button>
              <button type="button" className="btn" onClick={repeat} disabled={!state.target}>
                <span aria-hidden="true">↻</span> Repetir som
              </button>
            </div>

            <dl className="score" aria-label="Placar da sessão">
              <div>
                <dt>Acertos</dt>
                <dd className="score-good">{state.score.hits}</dd>
              </div>
              <div>
                <dt>Erros</dt>
                <dd className="score-bad">{state.score.misses}</dd>
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
              <p className="feedback-hint">Clique no braço para comparar sons, ou em Nova nota para continuar.</p>
            )}
          </div>

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
            <span className="swatch swatch-target" /> nota sorteada
          </li>
          <li>
            <span className="swatch swatch-equivalent" /> mesma altura em outra posição
          </li>
          <li>
            <span className="swatch swatch-wrong" /> seu palpite errado
          </li>
        </ul>
      </main>

      <footer className="footer">
        Afinação padrão E1 · A1 · D2 · G2 — casas 0 a {MAX_FRET}. Funciona offline depois de carregado.
      </footer>
    </div>
  );
}
