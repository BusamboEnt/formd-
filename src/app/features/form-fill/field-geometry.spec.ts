import { toPdfRect, toScreenRect } from './field-geometry';
import { FieldRect } from '../../core/models/form-field.model';

const A4_HEIGHT = 842;

const FIELD: FieldRect = { page: 0, x: 160, y: 712, width: 240, height: 20 };

describe('toScreenRect', () => {
  // The flip is the whole point. Getting it backwards mirrors every field to
  // the wrong half of the page — plausible-looking, and completely wrong.
  it('measures top from the top of the page, not the bottom', () => {
    const screen = toScreenRect(FIELD, A4_HEIGHT, 1);
    // 842 - 712 - 20
    expect(screen.top).toBe(110);
  });

  it('leaves x alone, since both systems agree on it', () => {
    expect(toScreenRect(FIELD, A4_HEIGHT, 1).left).toBe(160);
  });

  it('carries the size through', () => {
    const screen = toScreenRect(FIELD, A4_HEIGHT, 1);
    expect(screen.width).toBe(240);
    expect(screen.height).toBe(20);
  });

  it('applies the render scale to every dimension', () => {
    const screen = toScreenRect(FIELD, A4_HEIGHT, 0.5);
    expect(screen.left).toBe(80);
    expect(screen.top).toBe(55);
    expect(screen.width).toBe(120);
    expect(screen.height).toBe(10);
  });

  it('puts a field at the very bottom of the page at the very bottom on screen', () => {
    const footer: FieldRect = { page: 0, x: 0, y: 0, width: 100, height: 20 };
    const screen = toScreenRect(footer, A4_HEIGHT, 1);
    expect(screen.top).toBe(822);
    expect(screen.top + screen.height).toBe(A4_HEIGHT);
  });

  it('puts a field at the very top of the page at the very top on screen', () => {
    const header: FieldRect = { page: 0, x: 0, y: A4_HEIGHT - 20, width: 100, height: 20 };
    expect(toScreenRect(header, A4_HEIGHT, 1).top).toBe(0);
  });
});

describe('toPdfRect', () => {
  it('is the exact inverse of toScreenRect', () => {
    const screen = toScreenRect(FIELD, A4_HEIGHT, 1);
    expect(toPdfRect(screen, A4_HEIGHT, 1, 0)).toEqual(FIELD);
  });

  it('round-trips at a non-unit scale', () => {
    const scale = 0.735;
    const screen = toScreenRect(FIELD, A4_HEIGHT, scale);
    const back = toPdfRect(screen, A4_HEIGHT, scale, 0);

    expect(back.x).toBeCloseTo(FIELD.x, 6);
    expect(back.y).toBeCloseTo(FIELD.y, 6);
    expect(back.width).toBeCloseTo(FIELD.width, 6);
    expect(back.height).toBeCloseTo(FIELD.height, 6);
  });

  it('keeps the page index it was given', () => {
    expect(toPdfRect({ left: 0, top: 0, width: 10, height: 10 }, A4_HEIGHT, 1, 3).page).toBe(3);
  });
});
