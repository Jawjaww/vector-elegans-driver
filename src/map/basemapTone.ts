/**
 * The liberty basemap is a near-white wash: land, buildings and minor roads
 * sit on top of each other. This shifts that style a step darker and opens
 * the gap between them. Route layers are painted afterwards by the app and
 * are not part of the style this touches.
 *
 * The script runs inside the map WebView, so it is plain JavaScript in a
 * string. Babel never rewrites that string, which is what keeps the copy
 * the WebView evaluates identical to the copy the tests call.
 */
export const BASEMAP_TONE_JS = `
function rgbToHsl(r, g, b) {
  var R = r / 255, G = g / 255, B = b / 255;
  var max = Math.max(R, G, B), min = Math.min(R, G, B);
  var l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l };
  var d = max - min;
  var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  var h = 0;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h = h * 60;
  if (h < 0) h += 360;
  return { h: h, s: s, l: l };
}

function hslToRgb(h, s, l) {
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var hp = h / 60;
  var x = c * (1 - Math.abs(hp % 2 - 1));
  var m = l - c / 2;
  var rp = 0, gp = 0, bp = 0;
  if (hp < 1) { rp = c; gp = x; }
  else if (hp < 2) { rp = x; gp = c; }
  else if (hp < 3) { gp = c; bp = x; }
  else if (hp < 4) { gp = x; bp = c; }
  else if (hp < 5) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255)
  };
}

function parseColor(input) {
  var s = String(input).trim();
  var hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    var h = hex[1];
    if (h.length === 3 || h.length === 4) {
      var expanded = "";
      for (var i = 0; i < h.length; i++) expanded += h.charAt(i) + h.charAt(i);
      h = expanded;
    }
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  }
  var rgb = /^rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*(?:,\\s*([\\d.]+)\\s*)?\\)$/i.exec(s);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] == null ? 1 : Number(rgb[4])
    };
  }
  var hsl = /^hsla?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)%\\s*,\\s*([\\d.]+)%\\s*(?:,\\s*([\\d.]+)\\s*)?\\)$/i.exec(s);
  if (hsl) {
    var from = hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
    return { r: from.r, g: from.g, b: from.b, a: hsl[4] == null ? 1 : Number(hsl[4]) };
  }
  return null;
}

function toneChannels(r, g, b) {
  var hsl = rgbToHsl(r, g, b);
  var s = hsl.s;
  var l = hsl.l;
  if (s < 0.08 && l > 0.93) {
    l = l - 0.02;
  } else if (l > 0.7) {
    l = l - (0.065 + (1 - Math.min(s, 1)) * 0.035);
    if (s > 0.12) s = Math.min(1, s * 1.14);
  } else {
    l = l - 0.04;
    s = Math.min(1, s * 1.16);
  }
  if (l < 0) l = 0;
  if (l > 1) l = 1;
  if (s < 0) s = 0;
  if (s > 1) s = 1;
  return hslToRgb(hsl.h, s, l);
}

function toneBasemapColor(input) {
  var parsed = parseColor(input);
  if (!parsed) return input;
  var next = toneChannels(parsed.r, parsed.g, parsed.b);
  var a = Math.round(parsed.a * 1000) / 1000;
  return "rgba(" + next.r + ", " + next.g + ", " + next.b + ", " + a + ")";
}

function toneBasemapValue(value) {
  if (typeof value === "string") return toneBasemapColor(value);
  if (Object.prototype.toString.call(value) === "[object Array]") {
    var next = [];
    for (var i = 0; i < value.length; i++) next.push(toneBasemapValue(value[i]));
    return next;
  }
  return value;
}

function toneBasemapStyle(style) {
  var layers = style && style.layers ? style.layers : [];
  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];
    if (!layer || !layer.paint || layer.type === "symbol") continue;
    var keys = Object.keys(layer.paint);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].indexOf("color") === -1) continue;
      layer.paint[keys[k]] = toneBasemapValue(layer.paint[keys[k]]);
    }
  }
}
`;

type BasemapToneApi = {
  toneBasemapColor: (input: string) => string;
  toneBasemapStyle: (style: {
    layers?: Array<{
      type?: string;
      paint?: Record<string, unknown>;
    }>;
  }) => void;
};

/** Liberty land `#f8f4f0` after the tone, so the WebView flash matches the map. */
export const BASEMAP_CANVAS = 'rgba(236, 222, 208, 1)';

export function loadBasemapTone(): BasemapToneApi {
  const factory = new Function(
    `${BASEMAP_TONE_JS}\nreturn { toneBasemapColor: toneBasemapColor, toneBasemapStyle: toneBasemapStyle };`,
  ) as () => BasemapToneApi;
  return factory();
}
