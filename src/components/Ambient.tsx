import { useEffect, useRef } from "react";

const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_intensity;
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
  float t=u_time*0.08;
  vec2 uv=gl_FragCoord.xy/u_res;
  uv=(uv-0.5)/1.18+0.5;
  vec2 q=vec2(snoise(uv*0.5+vec2(t*0.6,t*0.4)),snoise(uv*0.5+vec2(-t*0.5,t*0.7)+vec2(43.12,17.89)));
  vec2 r=vec2(snoise(uv*1.1+q*0.7+vec2(1.7,9.2)),snoise(uv*1.1+q*0.7+vec2(8.3,2.8)));
  vec2 w=uv+(q*0.6+r*0.4)*u_intensity*0.28;
  vec3 col=vec3(0.);
  float total=0.;
  for(int i=0;i<9;i++){
    float fi=float(i);
    vec2 off=vec2(snoise(w*3.+fi*7.31),snoise(w*3.-fi*4.17))*0.012;
    vec2 suv=clamp(w+off,0.001,0.999);
    col+=texture2D(u_tex,suv).rgb;
    total+=1.;
  }
  col/=total;
  float sat=1.3;
  float l=dot(col,vec3(0.299,0.587,0.114));
  col=mix(vec3(l),col,sat);
  vec2 d=uv-0.5;
  col*=1.0-dot(d,d)*0.9;
  gl_FragColor=vec4(col,1.);
}
`;

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
  const stateRef = useRef<{ gl: WebGLRenderingContext | null; tex: WebGLTexture | null; uni: Record<string, WebGLUniformLocation | null> }>({ gl: null, tex: null, uni: {} });
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
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const st = stateRef.current;
    st.gl = gl;
    st.tex = tex;
    st.uni = {
      u_tex: gl.getUniformLocation(prog, "u_tex"),
      u_res: gl.getUniformLocation(prog, "u_res"),
      u_time: gl.getUniformLocation(prog, "u_time"),
      u_intensity: gl.getUniformLocation(prog, "u_intensity"),
    };
    const img = new Image();
    img.onload = () => {
      if (stateRef.current.tex !== tex) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      canvas.style.opacity = "1";
    };
    img.src = src;
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth / 2));
      const h = Math.max(1, Math.floor(canvas.clientHeight / 2));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    let raf = 0;
    let last = 0;
    let acc = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      last = now;
      if (document.hidden) return;
      if (dt < 31) return;
      if (!playingRef.current) {
        acc = 0;
        return;
      }
      acc += dt;
      resize();
      const g = stateRef.current.gl;
      if (!g || !stateRef.current.tex) return;
      g.viewport(0, 0, canvas.width, canvas.height);
      g.uniform2f(stateRef.current.uni.u_res!, canvas.width, canvas.height);
      g.uniform1f(stateRef.current.uni.u_time!, (now - t0 + acc) / 1000);
      g.uniform1f(stateRef.current.uni.u_intensity!, 1);
      g.activeTexture(gl.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, stateRef.current.tex);
      g.uniform1i(stateRef.current.uni.u_tex!, 0);
      g.drawArrays(g.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stateRef.current.gl = null;
      stateRef.current.tex = null;
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
