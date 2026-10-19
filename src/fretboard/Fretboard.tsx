import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { DOUBLE_INLAY_FRETS, INLAY_FRETS, LAYOUT, buildGeometry } from './geometry';
import { MAX_FRET, STRINGS, describePosition, positionAt, samePosition, type Position } from './model';
import type { Marker } from '../game/game';
import './Fretboard.css';

interface FretboardProps {
  maxFret?: number;
  markers: Marker[];
  /** Mostrar o nome da nota dentro das marcações (só depois da resposta). */
  showNames: boolean;
  /** Última posição tocada em modo livre, para um pulso visual. */
  pulse: Position | null;
  /** Muda a cada clique para reiniciar a animação do pulso. */
  pulseKey: number;
  onSelect: (position: Position) => void;
}

const STRING_THICKNESS = [4.2, 3.4, 2.6, 2]; // E, A, D, G

export function Fretboard({ maxFret = MAX_FRET, markers, showNames, pulse, pulseKey, onSelect }: FretboardProps) {
  const g = useMemo(() => buildGeometry(maxFret), [maxFret]);
  const frets = useMemo(() => Array.from({ length: maxFret + 1 }, (_, f) => f), [maxFret]);
  const midY = (g.boardTop + g.boardBottom) / 2;
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const target = markers.find((m) => m.kind === 'target')?.position ?? null;

  // Em telas estreitas o braço rola na horizontal: depois da resposta, traz a
  // posição sorteada para dentro da área visível (sem mexer se já estiver).
  useEffect(() => {
    const scroller = scrollRef.current;
    const svg = svgRef.current;
    if (!target || !scroller || !svg || scroller.scrollWidth <= scroller.clientWidth) return;
    const svgRect = svg.getBoundingClientRect();
    const scale = svgRect.width / g.width;
    // x da posição sorteada no sistema de coordenadas do conteúdo rolável.
    const x =
      svgRect.left - scroller.getBoundingClientRect().left + scroller.scrollLeft + g.cellCenterX(target.fret) * scale;
    const margin = 48;
    const left = scroller.scrollLeft;
    if (x < left + margin || x > left + scroller.clientWidth - margin) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      scroller.scrollTo({ left: x - scroller.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [target, g]);

  const handleKey = (event: KeyboardEvent, position: Position) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(position);
    }
  };

  return (
    <div className="fretboard-scroll" ref={scrollRef}>
      <svg
        ref={svgRef}
        className="fretboard"
        viewBox={`0 0 ${g.width} ${g.height}`}
        role="group"
        aria-label="Braço do baixo: 4 cordas, casas 0 a 12"
      >
        <defs>
          <linearGradient id="fb-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--wood-edge)" />
            <stop offset="0.12" stopColor="var(--wood)" />
            <stop offset="0.88" stopColor="var(--wood)" />
            <stop offset="1" stopColor="var(--wood-edge)" />
          </linearGradient>
          <linearGradient id="fb-string" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--string-hi)" />
            <stop offset="1" stopColor="var(--string-lo)" />
          </linearGradient>
        </defs>

        {/* Madeira do braço (a partir da pestana) */}
        <rect
          x={g.nutX}
          y={g.boardTop}
          width={g.boardRight - g.nutX}
          height={g.boardBottom - g.boardTop}
          rx={3}
          fill="url(#fb-wood)"
        />

        {/* Marcações de casa */}
        {frets.map((f) => {
          if (f === 0) return null;
          const cx = g.cellCenterX(f);
          if ((INLAY_FRETS as readonly number[]).includes(f)) {
            return <circle key={`inlay-${f}`} className="inlay" cx={cx} cy={midY} r={7} />;
          }
          if ((DOUBLE_INLAY_FRETS as readonly number[]).includes(f)) {
            const off = LAYOUT.stringSpacing;
            return (
              <g key={`inlay-${f}`}>
                <circle className="inlay" cx={cx} cy={midY - off} r={7} />
                <circle className="inlay" cx={cx} cy={midY + off} r={7} />
              </g>
            );
          }
          return null;
        })}

        {/* Trastes */}
        {frets.map((f) =>
          f === 0 ? null : (
            <rect
              key={`fret-${f}`}
              className="fret-wire"
              x={g.cellStart[f] + g.cellWidth[f] - 1.75}
              y={g.boardTop}
              width={3.5}
              height={g.boardBottom - g.boardTop}
              rx={1.5}
            />
          ),
        )}

        {/* Pestana */}
        <rect
          className="nut"
          x={g.nutX}
          y={g.boardTop - 3}
          width={LAYOUT.nutWidth}
          height={g.boardBottom - g.boardTop + 6}
          rx={2}
        />

        {/* Cordas (atravessam também a zona da corda solta) */}
        {STRINGS.map((s, i) => (
          <g key={`string-${s.label}`}>
            <rect
              x={g.cellStart[0] + 6}
              y={g.stringY(i) - STRING_THICKNESS[i] / 2}
              width={g.boardRight - g.cellStart[0] - 6}
              height={STRING_THICKNESS[i]}
              rx={STRING_THICKNESS[i] / 2}
              fill="url(#fb-string)"
            />
            <text className="string-label" x={g.cellStart[0] - 10} y={g.stringY(i)} dominantBaseline="central">
              {s.label}
            </text>
          </g>
        ))}

        {/* Números das casas */}
        {frets.map((f) => (
          <text
            key={`num-${f}`}
            className={`fret-number${(INLAY_FRETS as readonly number[]).includes(f) || (DOUBLE_INLAY_FRETS as readonly number[]).includes(f) ? ' is-marked' : ''}`}
            x={g.cellCenterX(f)}
            y={g.boardBottom + LAYOUT.numberGap - 8}
            textAnchor="middle"
          >
            {f}
          </text>
        ))}

        {/* Marcações de resposta */}
        {markers.map(({ position, kind }) => {
          const cx = g.cellCenterX(position.fret);
          const cy = g.stringY(position.string);
          return (
            <g key={`m-${kind}-${position.string}-${position.fret}`} className={`marker marker-${kind}`}>
              <circle cx={cx} cy={cy} r={kind === 'equivalent' ? 14 : 16} />
              {showNames && (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                  {position.name}
                </text>
              )}
            </g>
          );
        })}

        {/* Pulso do clique em modo livre */}
        {pulse && !markers.some((m) => samePosition(m.position, pulse)) && (
          <circle
            key={`pulse-${pulseKey}`}
            className="pulse"
            cx={g.cellCenterX(pulse.fret)}
            cy={g.stringY(pulse.string)}
            r={15}
          />
        )}

        {/* Áreas clicáveis (por cima de tudo) */}
        {STRINGS.map((_, s) =>
          frets.map((f) => {
            const position = positionAt(s, f);
            const y = g.stringY(s) - LAYOUT.stringSpacing / 2;
            return (
              <g
                key={`hit-${s}-${f}`}
                className="hit"
                role="button"
                tabIndex={0}
                aria-label={describePosition(position)}
                onClick={() => onSelect(position)}
                onKeyDown={(e) => handleKey(e, position)}
              >
                <rect x={g.cellStart[f]} y={y} width={g.cellWidth[f]} height={LAYOUT.stringSpacing} />
                <circle className="hover-dot" cx={g.cellCenterX(f)} cy={g.stringY(s)} r={13} />
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
