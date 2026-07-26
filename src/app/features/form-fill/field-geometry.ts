import { FieldRect } from '../../core/models/form-field.model';

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converts a PDF field rectangle into CSS offsets on a rendered page.
 *
 * The two coordinate systems disagree about which way is up. PDF measures y
 * from the **bottom** of the page; CSS measures top from the **top**. A field
 * 712 units up an 842-unit page sits 842 − 712 − 20 = 110 units below its top
 * edge, and getting this backwards puts every field on the wrong half of the
 * document — mirrored, not obviously broken, which is worse.
 *
 * This is the single place the flip happens; everything else stays in PDF
 * space, where pdf-lib and the stored definition already agree.
 */
export function toScreenRect(rect: FieldRect, pdfPageHeight: number, scale: number): ScreenRect {
  return {
    left: rect.x * scale,
    top: (pdfPageHeight - rect.y - rect.height) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** The inverse, for turning a click or drag on a rendered page back into a field rect. */
export function toPdfRect(
  screen: ScreenRect,
  pdfPageHeight: number,
  scale: number,
  page: number
): FieldRect {
  const height = screen.height / scale;
  return {
    page,
    x: screen.left / scale,
    y: pdfPageHeight - screen.top / scale - height,
    width: screen.width / scale,
    height,
  };
}
