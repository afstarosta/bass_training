import { MAX_FRET, STRINGS } from './model';

/**
 * Geometria do diagrama do braço (unidades do viewBox do SVG).
 * As casas encolhem levemente em direção ao corpo, como num braço real,
 * mas sem chegar ao ponto de os alvos de toque ficarem pequenos demais.
 */
export const LAYOUT = {
  padLeft: 28,
  padRight: 20,
  padTop: 22,
  openZoneWidth: 64,
  nutWidth: 9,
  firstFretWidth: 82,
  fretShrink: 0.955,
  stringSpacing: 46,
  numberGap: 30,
} as const;

export const INLAY_FRETS = [3, 5, 7, 9, 15, 17, 19, 21] as const;
export const DOUBLE_INLAY_FRETS = [12, 24] as const;

export interface FretGeometry {
  /** Borda esquerda de cada casa; índice 0 = zona da corda solta. */
  cellStart: number[];
  /** Largura de cada casa; índice 0 = zona da corda solta. */
  cellWidth: number[];
  nutX: number;
  boardTop: number;
  boardBottom: number;
  boardRight: number;
  width: number;
  height: number;
  stringY: (string: number) => number;
  cellCenterX: (fret: number) => number;
}

export function buildGeometry(maxFret: number = MAX_FRET): FretGeometry {
  const L = LAYOUT;
  const cellStart: number[] = [L.padLeft];
  const cellWidth: number[] = [L.openZoneWidth];
  const nutX = L.padLeft + L.openZoneWidth;

  let x = nutX + L.nutWidth;
  for (let f = 1; f <= maxFret; f++) {
    const w = L.firstFretWidth * L.fretShrink ** (f - 1);
    cellStart.push(x);
    cellWidth.push(w);
    x += w;
  }

  const boardTop = L.padTop;
  const boardBottom = boardTop + L.stringSpacing * STRINGS.length;
  const boardRight = x;
  const strings = STRINGS.length;

  return {
    cellStart,
    cellWidth,
    nutX,
    boardTop,
    boardBottom,
    boardRight,
    width: boardRight + L.padRight,
    height: boardBottom + L.numberGap + 8,
    // Corda mais grave (índice 0) embaixo, como nos diagramas tradicionais.
    stringY: (s) => boardTop + (strings - 1 - s) * L.stringSpacing + L.stringSpacing / 2,
    cellCenterX: (f) => cellStart[f] + cellWidth[f] / 2,
  };
}
