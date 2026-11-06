// Grainy cloud background, drawn with WebGL. The clouds shift slightly on scroll.
// If WebGL isn't available the page just shows the background color from the CSS.
(function () {
  "use strict";

  const canvas = document.getElementById("clouds");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return;

  const VERTEX = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
  const FRAGMENT = `
    precision highp float;
    uniform float uScale, uDrift, uCloudSize;
    const float TAU = 6.2831853;

    float hash(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
    }

    // Color ramp: tan, gray, blue, dark blue, near black
    vec3 ramp(float v) {
      vec3 tan_ = vec3(0.835, 0.725, 0.530), pale = vec3(0.620, 0.630, 0.640);
      vec3 blue = vec3(0.370, 0.470, 0.610), deep = vec3(0.215, 0.255, 0.330), ink = vec3(0.100, 0.100, 0.120);
      if (v < 0.3) return mix(tan_, pale, v / 0.3);
      if (v < 0.58) return mix(pale, blue, (v - 0.3) / 0.28);
      if (v < 0.82) return mix(blue, deep, (v - 0.58) / 0.24);
      return mix(deep, ink, min((v - 0.82) / 0.14, 1.0));
    }

    void main() {
      vec2 p = gl_FragCoord.xy / uScale / uCloudSize;

      // Warp the coordinates so the blobs aren't perfectly round
      vec2 w = p + vec2(uDrift * 0.03, -uDrift * 0.02);
      p += 0.5 * (vec2(noise(w * 1.3 + 3.7), noise(w * 1.3 + 19.1)) - 0.5)
         + 0.16 * (vec2(noise(w * 4.1 + 41.0), noise(w * 4.1 + 7.3)) - 0.5);

      // Add up the blobs from this cell and its neighbors
      vec2 home = floor(p), f = fract(p);
      float cover = 0.0, depth = 0.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y)), n = home + o;
          float a = hash(n + 1.3), b = hash(n + 5.9), c = hash(n + 9.4), d = hash(n + 13.7), e = hash(n + 21.2);
          if (e < 0.05) continue; // skip a few so more tan shows through
          vec2 center = o + 0.5 + (vec2(a, b) - 0.5) * 0.7
                      + 0.09 * vec2(sin(uDrift + a * TAU), cos(uDrift * 0.8 + b * TAU));
          float size = mix(0.34, 0.54, c);
          vec2 to = center - f;
          float dist2 = dot(to, to);
          // Fade out before the edge of the search area to avoid seams
          float reach = 1.0 - smoothstep(0.36, 0.98, dist2);
          float weight = exp(-dist2 / (size * size)) * reach;
          cover += weight;
          depth += weight * d;
        }
      }
      depth /= max(cover, 0.001);
      float amount = 1.0 - exp(-cover * 3.4);

      // Tan in the gaps, darker toward the middle of each blob
      float inside = smoothstep(0.34, 0.8, amount);
      float v = 0.05 + inside * mix(0.36, 0.9, smoothstep(0.1, 1.0, depth));
      v += inside * 0.34 * (noise(p * 2.3 + 11.0) - 0.5);

      // Grain, heavier along the blob edges
      vec2 fine = floor(gl_FragCoord.xy);
      float g1 = hash(fine + 0.5), g2 = hash(floor(fine / 2.0) * 1.7 + 40.0);
      float edge = 1.0 - abs(2.0 * inside - 1.0);
      v += (g1 - 0.5) * (0.15 + 0.3 * edge) + (g2 - 0.5) * (0.1 + 0.26 * edge);
      vec3 color = ramp(clamp(v, 0.0, 1.0));
      color += (hash(fine * 0.73 + 90.0) - 0.5) * 0.035;
      gl_FragColor = vec4(color, 1.0);
    }`;

  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const program = gl.createProgram();
  try {
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (err) {
    console.warn("Background not drawn:", err.message);
    return;
  }
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const attribute = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

  const uScale = gl.getUniformLocation(program, "uScale");
  const uDrift = gl.getUniformLocation(program, "uDrift");
  const uCloudSize = gl.getUniformLocation(program, "uCloudSize");

  // Only redraws when the scroll position or window size changes

  const DRIFT_PER_PIXEL = 0.0005; // how fast the clouds move with scroll
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let shown = null, scale = 1, ticking = false;

  function frame() {
    ticking = false;
    const target = reduceMotion.matches ? 0 : window.scrollY * DRIFT_PER_PIXEL;
    if (shown === null) shown = target;
    else shown += (target - shown) * 0.1;
    if (Math.abs(target - shown) < 0.0002) shown = target;
    gl.uniform1f(uScale, scale);
    gl.uniform1f(uDrift, shown);
    gl.uniform1f(uCloudSize, Math.max(110, Math.min(190, window.innerWidth * 0.11)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (shown !== target) request();
  }

  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }

  function resize() {
    scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(window.innerWidth * scale), h = Math.round(window.innerHeight * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    request();
  }

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", request, { passive: true });
  resize();
})();
