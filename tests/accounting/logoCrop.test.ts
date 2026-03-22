import { describe, expect, it } from 'vitest';

import { clampLogoOffset, getLogoCropDrawRect, getLogoScaledSize } from '../../utils/logoCrop';

describe('logo crop utilities', () => {
  it('scales the image to fit fully inside the square crop frame', () => {
    const scaled = getLogoScaledSize(200, { width: 400, height: 100 }, 1);

    expect(scaled.width).toBe(200);
    expect(scaled.height).toBe(50);
  });

  it('locks dragging when the full logo already fits inside the frame', () => {
    const offset = clampLogoOffset(200, { width: 400, height: 100 }, 1, { x: 999, y: -999 });

    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it('returns a draw rect scaled to the export canvas', () => {
    const rect = getLogoCropDrawRect(512, 256, { width: 256, height: 256 }, 2, { x: 32, y: -16 });

    expect(rect).toEqual({
      x: -192,
      y: -288,
      width: 1024,
      height: 1024
    });
  });
});
