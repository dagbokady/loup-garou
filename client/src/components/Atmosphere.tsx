import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Ambiance 3D légère (Three.js) posée sur l'illustration de fond :
 * - nuit : étoiles scintillantes + lucioles qui dérivent en profondeur ;
 * - jour : poussières dorées dans la lumière.
 * Une seule géométrie de points + un shader : très peu coûteux.
 * Rendu figé si l'utilisateur préfère réduire les animations, pause si l'onglet est caché.
 */
export default function Atmosphere({ mode }: { mode: 'day' | 'night' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch {
      return; // WebGL indisponible : l'illustration seule suffit
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 10;

    const COUNT = window.innerWidth < 640 ? 70 : 140;
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const kinds = new Float32Array(COUNT); // 0 = luciole / poussière, 1 = étoile
    for (let i = 0; i < COUNT; i++) {
      const star = i % 3 === 0;
      kinds[i] = star ? 1 : 0;
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = star ? 3 + Math.random() * 6 : (Math.random() - 0.65) * 14;
      positions[i * 3 + 2] = star ? -20 : (Math.random() - 0.5) * 12;
      seeds[i] = Math.random() * 100;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('kind', new THREE.BufferAttribute(kinds, 1));

    const uniforms = {
      uTime: { value: 0 },
      uNight: { value: modeRef.current === 'night' ? 1 : 0 },
      uScale: { value: window.innerHeight / 2 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float seed;
        attribute float kind;
        uniform float uTime;
        uniform float uNight;
        uniform float uScale;
        varying float vAlpha;
        varying float vKind;
        void main() {
          vec3 p = position;
          if (kind < 0.5) {
            p.x += sin(uTime * 0.15 + seed) * 1.2;
            p.y += sin(uTime * 0.22 + seed * 1.7) * 0.8;
            p.z += cos(uTime * 0.12 + seed) * 0.8;
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float twinkle = 0.55 + 0.45 * sin(uTime * (kind > 0.5 ? 1.3 : 2.2) + seed * 3.0);
          float size = kind > 0.5 ? 0.05 : mix(0.07, 0.11, uNight);
          gl_PointSize = size * uScale / -mv.z;
          vAlpha = twinkle * (kind > 0.5 ? uNight : mix(0.35, 0.9, uNight));
          vKind = kind;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying float vAlpha;
        varying float vKind;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float glow = smoothstep(0.5, 0.0, d);
          vec3 firefly = mix(vec3(1.0, 0.86, 0.55), vec3(0.98, 0.92, 0.55), uNight);
          vec3 color = vKind > 0.5 ? vec3(0.85, 0.88, 1.0) : firefly;
          gl_FragColor = vec4(color, glow * glow * vAlpha);
        }`,
    });
    scene.add(new THREE.Points(geometry, material));

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.uScale.value = h / 2;
    };
    resize();
    window.addEventListener('resize', resize);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let frame = 0;
    const tick = () => {
      const target = modeRef.current === 'night' ? 1 : 0;
      uniforms.uNight.value += (target - uniforms.uNight.value) * 0.03; // transition douce jour/nuit
      uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
      if (!reduced) frame = requestAnimationFrame(tick);
    };
    tick();
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduced) frame = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
