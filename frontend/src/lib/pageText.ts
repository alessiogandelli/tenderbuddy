// The text of a PDF page as pdf.js reads it, reduced to what the price cells
// need: where each run of text sits, in fractions of the page (top-left origin).
// The offer export (backend/app/pipeline/offer_pdf.py) puts every amount on the
// baseline of its row's own text; the on-screen cells follow the same rule, so
// what the reviewer sees is where the PDF will print it.
import type { PDFPageProxy } from "pdfjs-dist";

export interface TextRun {
  x0: number;
  x1: number;
  /** Baseline, and the vertical middle of the glyphs. */
  baseline: number;
  middle: number;
}

/** How far left of a price cell the row's text (unit, quantity) is looked for. */
const ROW_TEXT_REACH_PT = 160;

export async function readTextRuns(page: PDFPageProxy): Promise<{ runs: TextRun[]; reach: number }> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [, , c, d, e, f] = item.transform as number[];
    const size = Math.hypot(c, d) || item.height || 0;
    const [x, y] = viewport.convertToViewportPoint(e, f);
    const [xEnd] = viewport.convertToViewportPoint(e + item.width, f);
    const baseline = y / viewport.height;
    runs.push({
      x0: Math.min(x, xEnd) / viewport.width,
      x1: Math.max(x, xEnd) / viewport.width,
      baseline,
      middle: baseline - (size * 0.35) / viewport.height,
    });
  }
  return { runs, reach: ROW_TEXT_REACH_PT / viewport.width };
}

export interface CellAnchor {
  /** The row's baseline, as a fraction of the cell's height (null = not found). */
  baseline: number | null;
  /** The PDF already has text inside this cell (e.g. an exported offer). */
  prefilled: boolean;
}

/** Same rule as the export: the topmost row text left of the cell, inside its band. */
export function cellAnchor(box: number[], runs: TextRun[], reach: number): CellAnchor {
  const [x0, y0, x1, y1] = box;
  const height = y1 - y0;
  const slack = 1 / 600; // about one point
  const row = runs
    .filter((run) => run.x1 <= x0 + slack && run.x0 >= x0 - reach && run.middle >= y0 && run.middle <= y1)
    .sort((a, b) => a.middle - b.middle)[0];
  const prefilled = runs.some(
    (run) => run.x0 >= x0 - slack && run.x1 <= x1 + slack && run.middle >= y0 && run.middle <= y1,
  );
  return {
    baseline: row && height > 0 ? (row.baseline - y0) / height : null,
    prefilled,
  };
}
