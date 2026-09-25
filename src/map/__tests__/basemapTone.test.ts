// `@types/node` is not in the app's `types` array.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import { BASEMAP_CANVAS, loadBasemapTone } from '../basemapTone';
import { buildMapHtmlTemplate } from '../mapHtmlTemplate';

const { toneBasemapColor, toneBasemapStyle } = loadBasemapTone();

type Rgba = { r: number; g: number; b: number; a: number };

function rgbaOf(css: string): Rgba {
  const match = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(
    css,
  );
  if (!match) throw new Error(`not rgba: ${css}`);
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: Number(match[4]),
  };
}

function lightness(css: string): number {
  const { r, g, b } = rgbaOf(css);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
}

function saturation(css: string): number {
  const { r, g, b } = rgbaOf(css);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

describe('basemap tone', () => {
  const land = toneBasemapColor('#f8f4f0');
  const road = toneBasemapColor('#ffffff');
  const building = toneBasemapColor('hsl(35, 8%, 85%)');
  const water = toneBasemapColor('rgb(158, 189, 255)');
  const park = toneBasemapColor('#d8e8c8');

  it('darkens the liberty land without leaving the light palette', () => {
    const l = lightness(land);
    expect(l).toBeLessThan(0.93);
    expect(l).toBeGreaterThan(0.8);
    expect(BASEMAP_CANVAS).toBe(land);
  });

  it('keeps minor roads lighter than the land, and buildings darker', () => {
    expect(lightness(road)).toBeGreaterThan(lightness(land) + 0.04);
    expect(lightness(building)).toBeLessThan(lightness(land) - 0.04);
  });

  it('pushes water and parks further from the wash', () => {
    expect(saturation(water)).toBeGreaterThan(0.7);
    expect(lightness(water)).toBeLessThan(0.8);
    expect(lightness(park)).toBeLessThan(lightness(road));
    expect(lightness(park)).toBeLessThan(0.82);
  });

  it('keeps alpha and leaves non-colours alone', () => {
    expect(rgbaOf(toneBasemapColor('hsla(98, 61%, 72%, 0.7)')).a).toBe(0.7);
    expect(toneBasemapColor('linear')).toBe('linear');
  });

  it('tones colour stops inside a paint expression and skips labels', () => {
    const style = {
      layers: [
        {
          id: 'land',
          type: 'background',
          paint: {
            'background-color': '#f8f4f0',
            'background-opacity': 1,
          },
        },
        {
          id: 'road',
          type: 'line',
          paint: {
            'line-color': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              'hsl(26, 87%, 62%)',
              6,
              '#fc8',
            ],
          },
        },
        {
          id: 'label',
          type: 'symbol',
          paint: { 'text-color': '#666666' },
        },
      ],
    };
    toneBasemapStyle(style);
    expect(style.layers[0].paint['background-color']).toBe(land);
    expect(style.layers[0].paint['background-opacity']).toBe(1);
    const stops = style.layers[1].paint['line-color'] as unknown[];
    expect(stops[0]).toBe('interpolate');
    expect(stops[1]).toEqual(['linear']);
    expect(stops[4]).not.toBe('hsl(26, 87%, 62%)');
    expect(String(stops[4]).startsWith('rgba(')).toBe(true);
    expect(stops[6]).not.toBe('#fc8');
    expect(style.layers[2].paint['text-color']).toBe('#666666');
  });

  it('is what the map document applies before the first frame', () => {
    const source = readFileSync(join(process.cwd(), 'src/map/mapHtmlTemplate.ts'), 'utf8');
    expect(source).toContain('toneBasemapStyle(style)');
    expect(source).toContain('__veBoot(style)');
    expect(source).toContain('style: mapStyle');
    const html = buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });
    const script = /<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html);
    expect(script).not.toBeNull();
    expect(() => new Function(script![1])).not.toThrow();
    expect(html).toContain(BASEMAP_CANVAS);
  });
});
