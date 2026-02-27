import { useEffect, useRef } from 'react';

const VERTEX_SHADER = `#version 300 es
in vec4 position;
void main() {
  gl_Position = position;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 O;
uniform float time;
uniform vec2 resolution;
uniform vec2 move;
uniform float zoom;
uniform vec2 wheel;
#define FC gl_FragCoord.xy
#define R resolution
#define MN min(R.x,R.y)
#define T (PI*8.+time)
#define S smoothstep
#define SE(v,s) S(s+1./MN,s-1./MN,v)
#define hue(a) (.5+.5*cos(PI*(a)-vec3(1,.5,.5)*PI))
#define PI radians(180.)
float box(vec2 p, float s, float r) {
  p=abs(p)-s+r;
  return length(max(p,.0))+min(.0,max(p.x,p.y))-r;
}
vec3 pattern(vec2 uv, float tc, float ta) {
  vec2 o=vec2(2.5,1.5);
  vec2 p=uv*1.5, id=clamp(.5+round(p/.25-.5),-o,o);
  p-=clamp(.5+round(p/.25-.5),-o,o)*.25;
  float d=box(p,.1,.003);
  vec3 col=vec3(0);
  id=vec2(-id.x,-id.y);
  float k=3., t=mod(ta*k,20.);
  float e=SE(d,.0);
  col+=hue(PI/2.+floor(tc))*e;
  if (t > 5. && t <= 15.) {
    float tt=floor(mod((ta*k-5.)*3.5,35.));
    vec2 q=abs(id);
    col*=tt>=floor(q.x+q.y)?1.:.125;
  } else if (t > 15.) {
    float tt=floor(mod((ta*k-20.)*5.,25.));
    vec2 q=abs(id);
    col*=tt>=floor(q.x+q.y)?.125:1.;
  } else {
    float tt=floor(mod(ta*k*6.,30.));
    vec2 q=id+o+.5;
    col*=tt>=floor(q.x+q.y*(R.x>R.y?6.:4.))?1.:.125;
  }
  return col;
}
void divide(inout vec2 p) {
  p.x=mod(p.x*2.+.5,2.)-1.;
  p.y-=clamp(round(p.y),.0,6.);
}
void main() {
  vec2 uv=(FC-.5*R)/MN;
  if (R.y<R.x) { uv=uv.yx; }
  vec3 col=vec3(0);
  float g=R.y<R.x?abs(uv.y)*.25:.0, k=clamp(dot(g,g),.0,1.),
  f=.2, t=f*T, tt=T*.5, wy=-wheel.y/MN;
  uv*=.5;
  vec2
  p=vec2(uv.x-k,0.75)/abs(uv.y)-vec2(0.0+t*1.00-wy*1.00,-1.),
  q=vec2(uv.x-k,1.25)/abs(uv.y)-vec2(1.0+t*0.50-wy*0.50,+1.),
  r=vec2(uv.x-k,1.50)/abs(uv.y)-vec2(2.0+t*0.25-wy*0.25,+1.);
  divide(p); divide(q); divide(r);
  col+=pattern(p,t,tt);
  col+=pattern(q,t+(PI/2.)*f,tt+.2);
  col+=pattern(r,t+PI*f,tt+.4);
  col/=1.+exp(-col);
  col=pow(col,vec3(.4545));
  col=mix(vec3(0),col,min(time*.3,1.));
  uv=FC/R;
  float vig=uv.x*uv.y*(1.-uv.x)*(1.-uv.y);
  col=mix(col,col*col*.1,S(1.,.0,pow(vig*25.,.3)));
  O=vec4(col,1);
}`;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function WebGLCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const stateRef = useRef({
    mouse: { x: 0, y: 0 },
    targetMouse: { x: 0, y: 0 },
    wheel: { x: 0, y: 0 },
    targetWheel: { x: 0, y: 0 },
    startTime: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) return;

    const dpr = 0.5;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAGMENT_SHADER);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uTime = gl.getUniformLocation(program, 'time');
    const uRes = gl.getUniformLocation(program, 'resolution');
    const uMove = gl.getUniformLocation(program, 'move');
    const uZoom = gl.getUniformLocation(program, 'zoom');
    const uWheel = gl.getUniformLocation(program, 'wheel');

    const state = stateRef.current;
    state.startTime = performance.now() / 1000;

    const render = () => {
      const t = performance.now() / 1000 - state.startTime;
      state.mouse.x = lerp(state.mouse.x, state.targetMouse.x, 0.05);
      state.mouse.y = lerp(state.mouse.y, state.targetMouse.y, 0.05);
      state.wheel.x = lerp(state.wheel.x, state.targetWheel.x, 0.05);
      state.wheel.y = lerp(state.wheel.y, state.targetWheel.y, 0.05);

      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMove, state.mouse.x, state.mouse.y);
      gl.uniform1f(uZoom, 1);
      gl.uniform2f(uWheel, state.wheel.x, state.wheel.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    const onMouseMove = (e: MouseEvent) => {
      state.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      state.targetMouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onWheel = (e: WheelEvent) => {
      state.targetWheel.y += e.deltaY * 0.5;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('wheel', onWheel);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
