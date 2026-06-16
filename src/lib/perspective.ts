// Perspective correction (homography) por correspondencias de 4 puntos.
//
// Resuelve la matriz 3x3 que mapea destino -> origen, de modo que para
// cada pixel del rectangulo de salida sabemos donde samplear en la foto
// original. Implementacion JS pura, sin dependencias.

export interface Point {
  x: number;
  y: number;
}

/**
 * Resuelve el sistema lineal 8x8 que da los coeficientes de la
 * homografia que mapea dst[i] -> src[i] para i=0..3.
 * Retorna [a, b, c, d, e, f, g, h] tales que:
 *   src.x = (a*dst.x + b*dst.y + c) / (g*dst.x + h*dst.y + 1)
 *   src.y = (d*dst.x + e*dst.y + f) / (g*dst.x + h*dst.y + 1)
 */
export function solveHomographyDstToSrc(src: Point[], dst: Point[]): number[] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error("Se requieren exactamente 4 puntos en src y dst");
  }
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const dx = dst[i].x;
    const dy = dst[i].y;
    const sx = src[i].x;
    const sy = src[i].y;
    A.push([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx]);
    B.push(sx);
    A.push([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy]);
    B.push(sy);
  }
  return gaussianSolve(A, B);
}

function gaussianSolve(A: number[][], B: number[]): number[] {
  const n = B.length;
  const M: number[][] = A.map((row, i) => [...row, B[i]]);
  // Eliminacion con pivoteo parcial
  for (let k = 0; k < n; k++) {
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > Math.abs(M[maxRow][k])) maxRow = i;
    }
    if (maxRow !== k) {
      const tmp = M[k]; M[k] = M[maxRow]; M[maxRow] = tmp;
    }
    if (Math.abs(M[k][k]) < 1e-10) {
      throw new Error("Sistema singular — los 4 puntos son colineales o casi colineales");
    }
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * Aplica la homografia al canvas de origen, generando un canvas de
 * salida de outW × outH pixeles que contiene el cuadrilatero
 * srcQuad "enderezado" a rectangulo.
 * srcQuad: 4 puntos en sentido horario empezando por arriba-izquierda
 *   (TL, TR, BR, BL).
 */
export function applyPerspective(
  srcCanvas: HTMLCanvasElement,
  srcQuad: Point[],
  outW: number,
  outH: number
): HTMLCanvasElement {
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const h = solveHomographyDstToSrc(srcQuad, dst);

  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) throw new Error("Canvas sin contexto");
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;
  const srcImage = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcPixels = srcImage.data;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Canvas de salida sin contexto");
  const outImage = outCtx.createImageData(outW, outH);
  const outPixels = outImage.data;

  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const denom = h[6] * u + h[7] * v + 1;
      const sx = (h[0] * u + h[1] * v + h[2]) / denom;
      const sy = (h[3] * u + h[4] * v + h[5]) / denom;

      const outIdx = (v * outW + u) * 4;

      if (sx < 0 || sx >= srcW - 1 || sy < 0 || sy >= srcH - 1) {
        outPixels[outIdx] = 255;
        outPixels[outIdx + 1] = 255;
        outPixels[outIdx + 2] = 255;
        outPixels[outIdx + 3] = 255;
        continue;
      }

      // Bilinear sampling
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const dx = sx - x0;
      const dy = sy - y0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;
      const w00 = (1 - dx) * (1 - dy);
      const w10 = dx * (1 - dy);
      const w01 = (1 - dx) * dy;
      const w11 = dx * dy;
      outPixels[outIdx] = w00 * srcPixels[i00] + w10 * srcPixels[i10] + w01 * srcPixels[i01] + w11 * srcPixels[i11];
      outPixels[outIdx + 1] = w00 * srcPixels[i00 + 1] + w10 * srcPixels[i10 + 1] + w01 * srcPixels[i01 + 1] + w11 * srcPixels[i11 + 1];
      outPixels[outIdx + 2] = w00 * srcPixels[i00 + 2] + w10 * srcPixels[i10 + 2] + w01 * srcPixels[i01 + 2] + w11 * srcPixels[i11 + 2];
      outPixels[outIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outImage, 0, 0);
  return outCanvas;
}
