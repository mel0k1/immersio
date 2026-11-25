import { useEffect, useRef } from "react";

const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

// slow drifting color wash built from 3 palette colors — never shows the artwork itself
const FRAG = `
precision mediump float;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec2 u_res;
uniform float u_time;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 permute(vec3 x){return mod289((x*34.+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz;
  x12.xy-=i1;
  i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
  m=m*m;m=m*m;
  vec3 x=2.*fract(p*C.yzx)-1.;
  vec3 h=abs(x)-.5;
  vec3 ox=floor(x+.5);
  vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x=a0.x*x0.x+h.x*x0.y;
  g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  float t=u_time*0.05;
  vec2 q=vec2(snoise(uv*0.9+vec2(t*0.7,t*0.3)),snoise(uv*0.9+vec2(-t*0.4,t*0.6)));
  float m1=smoothstep(-0.7,0.7,snoise(uv*0.55+q*0.35+vec2(t*0.5,0.)));
  float m2=smoothstep(-0.7,0.7,snoise(uv*0.62+q*0.3+vec2(0.,t*0.42)+vec2(31.7,7.3)));
  vec3 col=mix(u_c0,u_c1,m1);
  col=mix(col,u_c2,m2*0.7);
  vec2 d=uv-0.5;
  col*=mix(0.5,1.0,clamp(1.0-dot(d,d)*1.7,0.0,1.0));
  col*=0.8;
  gl_FragColor=vec4(col,1.);
}
`;

const FALLBACK: [number, number, number][] = [
  [42, 38, 66],
  [58, 44, 84],
  [30, 42, 62],
];

function dist2(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

// keep colors dark and muted so the wash never turns garish
function clampDark(c: [number, number, number]): [number, number, number] {
  const [r, g, b] = c;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  const target = 0.22 + Math.min(0.16, l * 0.3); // pull lightness into a narrow dark band
  const k = target / Math.max(0.05, l);
  const boost = 0.75 + sat * 0.5;
  const mid = (r + g + b) / 3;
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, mid + (v - mid) * boost * k)));
  return [f(r), f(g), f(b)];
}

function extractColors(src: string): Promise<[number, number, number][]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const n = 32;
        const c = document.createElement("canvas");
        c.width = n;
        c.height = n;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("no ctx");
        ctx.drawImage(img, 0, 0, n, n);
        const d = ctx.getImageData(0, 0, n, n).data;
        const buckets = new Map<string, { r: number; g: number; b: number; cnt: number }>();
        for (let i = 0; i < d.length; i += 4) {
          const key = `${d[i] >> 5}_${d[i + 1] >> 5}_${d[i + 2] >> 5}`;
          const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, cnt: 0 };
          e.r += d[i];
          e.g += d[i + 1];
          e.b += d[i + 2];
          e.cnt++;
          buckets.set(key, e);
        }
        const tops = [...buckets.values()]
          .sort((a, b) => b.cnt - a.cnt)
          .slice(0, 10)
          .map((e) => [e.r / e.cnt, e.g / e.cnt, e.b / e.cnt] as [number, number, number]);
        const picked: [number, number, number][] = [];
        if (tops.length) picked.push(tops[0]);
        while (picked.length < 3 && tops.length) {
          let best: [number, number, number] | null = null;
          let bestD = -1;
          for (const t of tops) {
            const dmin = Math.min(...picked.map((p) => dist2(p, t)));
            if (dmin > bestD) {
              bestD = dmin;
              best = t;
            }
          }
          if (!best || bestD < 900) break; // remaining colors are too similar
          picked.push(best);
        }
        while (picked.length < 3) {
          const p = picked[picked.length - 1] ?? [40, 40, 48];
          picked.push([p[2] * 0.6 + 14, p[0] * 0.5 + 10, p[1] * 0.6 + 22]);
        }
        resolve(picked.map(clampDark));
      } catch {
        resolve(FALLBACK);
      }
    };
    img.onerror = () => resolve(FALLBACK);
    img.src = src;
  });
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
  return s;
}

export function Ambient({ src, enabled, playing }: { src: string | null; enabled: boolean; playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    gl: WebGLRenderingContext | null;
    uni: Record<string, WebGLUniformLocation | null>;
    colors: [number, number, number][];
    dirty: boolean;
  }>({ gl: null, uni: {}, colors: FALLBACK, dirty: true });
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (!enabled || !src || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false }) as WebGLRenderingContext | null;
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    extractColors(src).then((colors) => {
      stateRef.current.colors = colors;
      stateRef.current.dirty = true;
    });
    const st = stateRef.current;
    st.gl = gl;
    st.uni = {
      u_c0: gl.getUniformLocation(prog, "u_c0"),
      u_c1: gl.getUniformLocation(prog, "u_c1"),
      u_c2: gl.getUniformLocation(prog, "u_c2"),
      u_res: gl.getUniformLocation(prog, "u_res"),
      u_time: gl.getUniformLocation(prog, "u_time"),
    };
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth / 2));
      const h = Math.max(1, Math.floor(canvas.clientHeight / 2));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        st.dirty = true;
      }
    };
    resize();
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      last = now;
      if (document.hidden) return;
      if (dt < 31) return;
      resize();
      const g = st.gl;
      if (!g) return;
      if (!playingRef.current && !st.dirty) return;
      st.dirty = false;
      g.viewport(0, 0, canvas.width, canvas.height);
      const [c0, c1, c2] = st.colors;
      g.uniform3f(st.uni.u_c0!, c0[0] / 255, c0[1] / 255, c0[2] / 255);
      g.uniform3f(st.uni.u_c1!, c1[0] / 255, c1[1] / 255, c1[2] / 255);
      g.uniform3f(st.uni.u_c2!, c2[0] / 255, c2[1] / 255, c2[2] / 255);
      g.uniform2f(st.uni.u_res!, canvas.width, canvas.height);
      g.uniform1f(st.uni.u_time!, (now - t0) / 1000);
      g.drawArrays(g.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(loop);
    canvas.style.opacity = "1";
    return () => {
      cancelAnimationFrame(raf);
      stateRef.current.gl = null;
      canvas.style.opacity = "0";
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [enabled, src]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0,
        transition: "opacity 1s",
        pointerEvents: "none",
      }}
    />
  );
}
