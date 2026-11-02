import { BlurFilter, Filter, GlProgram, Geometry, Mesh, Shader, Texture } from "pixi.js";
import { parseColor } from "./color";

const MAX_STOPS = 8;
const MAX_MESH = 16;

const MESH_VERT = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

const ANGULAR_FRAG = `
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColors[${MAX_STOPS}];
uniform float uPos[${MAX_STOPS}];
uniform float uN;
uniform vec2 uCenter;
uniform float uRot;
uniform float uOpacity;
void main() {
  vec2 d = vUV - uCenter;
  float a = atan(d.x, -d.y) / 6.2831853;
  float t = fract(a + uRot);
  vec4 c = uColors[0];
  for (int i = 0; i < ${MAX_STOPS - 1}; i++) {
    if (float(i + 1) >= uN) break;
    float p0 = uPos[i], p1 = uPos[i + 1];
    if (t >= p0) c = (t <= p1) ? mix(uColors[i], uColors[i + 1], (t - p0) / max(p1 - p0, 1e-5)) : uColors[i + 1];
  }
  c.a *= uOpacity;
  finalColor = vec4(c.rgb * c.a, c.a);
}`;

const MESH_FRAG = `
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColors[${MAX_MESH}];
uniform float uCols;
uniform float uRows;
uniform float uOpacity;
vec4 at(float ix, float iy) {
  float idx = iy * uCols + ix;
  vec4 c = uColors[0];
  for (int k = 0; k < ${MAX_MESH}; k++) if (float(k) == idx) c = uColors[k];
  return c;
}
void main() {
  float gx = clamp(vUV.x, 0.0, 1.0) * (uCols - 1.0);
  float gy = clamp(vUV.y, 0.0, 1.0) * (uRows - 1.0);
  float x0 = min(floor(gx), uCols - 2.0), y0 = min(floor(gy), uRows - 2.0);
  vec2 f = vec2(gx - x0, gy - y0);
  f = f * f * (3.0 - 2.0 * f);
  vec4 c = mix(mix(at(x0, y0), at(x0 + 1.0, y0), f.x), mix(at(x0, y0 + 1.0), at(x0 + 1.0, y0 + 1.0), f.x), f.y);
  c.a *= uOpacity;
  finalColor = vec4(c.rgb * c.a, c.a);
}`;

const quad = (w: number, h: number) => new Geometry({
  attributes: { aPosition: [0, 0, w, 0, w, h, 0, h], aUV: [0, 0, 1, 0, 1, 1, 0, 1] },
  indexBuffer: [0, 1, 2, 0, 2, 3],
});

const rgba = (hex: string) => { const { color, alpha } = parseColor(hex); return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, alpha]; };

export function angularMesh(w: number, h: number, stops: { color: string; position: number }[], center: { x: number; y: number }, rotationDeg: number, opacity: number): Mesh<Geometry, Shader> {
  const colors = new Float32Array(MAX_STOPS * 4), pos = new Float32Array(MAX_STOPS);
  const s = stops.slice(0, MAX_STOPS);
  s.forEach((st, i) => { colors.set(rgba(st.color), i * 4); pos[i] = st.position; });
  const shader = Shader.from({
    gl: { vertex: MESH_VERT, fragment: ANGULAR_FRAG },
    resources: {
      u: {
        uColors: { value: colors, type: "vec4<f32>", size: MAX_STOPS },
        uPos: { value: pos, type: "f32", size: MAX_STOPS },
        uN: { value: s.length, type: "f32" },
        uCenter: { value: [center.x, center.y], type: "vec2<f32>" },
        uRot: { value: rotationDeg / 360, type: "f32" },
        uOpacity: { value: opacity, type: "f32" },
      },
    },
  });
  return new Mesh<Geometry, Shader>({ geometry: quad(w, h), shader });
}

export function meshGradientMesh(w: number, h: number, cols: number, rows: number, colorList: string[], opacity: number): Mesh<Geometry, Shader> {
  const colors = new Float32Array(MAX_MESH * 4);
  colorList.slice(0, MAX_MESH).forEach((c, i) => colors.set(rgba(c), i * 4));
  const shader = Shader.from({
    gl: { vertex: MESH_VERT, fragment: MESH_FRAG },
    resources: {
      u: {
        uColors: { value: colors, type: "vec4<f32>", size: MAX_MESH },
        uCols: { value: Math.max(2, cols), type: "f32" },
        uRows: { value: Math.max(2, rows), type: "f32" },
        uOpacity: { value: opacity, type: "f32" },
      },
    },
  });
  return new Mesh<Geometry, Shader>({ geometry: quad(w, h), shader });
}

const BACKDROP_VERT = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const BACKDROP_FRAG = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform vec4 uInputSize;
uniform float uRadius;
void main(void) {
  vec4 front = texture(uTexture, vTextureCoord);
  vec4 back = texture(uBackTexture, vTextureCoord);
  float sigma = max(uRadius * 0.5, 0.01);
  float step = max(uRadius / 6.0, 0.5);
  vec4 sum = vec4(0.0);
  float tot = 0.0;
  for (int i = -6; i <= 6; i++) {
    for (int j = -6; j <= 6; j++) {
      vec2 o = vec2(float(i), float(j)) * step;
      float w = exp(-dot(o, o) / (2.0 * sigma * sigma));
      sum += texture(uBackTexture, clamp(vTextureCoord + o * uInputSize.zw, 0.0, 1.0)) * w;
      tot += w;
    }
  }
  finalColor = mix(back, sum / tot, front.a);
}`;

/** Blurs whatever is rendered behind the node, only where the node's (opaque) shape covers. */
export function backdropBlurFilter(radius: number): Filter {
  return new Filter({
    glProgram: GlProgram.from({ vertex: BACKDROP_VERT, fragment: BACKDROP_FRAG, name: "pen-backdrop-blur" }),
    blendRequired: true,
    resources: {
      uBackTexture: Texture.EMPTY,
      blurUniforms: { uRadius: { value: radius, type: "f32" } },
    },
  });
}

export function setBackdropRadius(f: Filter, r: number) { (f.resources as any).blurUniforms.uniforms.uRadius = r; }

export const gaussian = (radius: number) => new BlurFilter({ strength: radius, quality: 4 });
