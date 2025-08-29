import { useEffect, useRef } from "react";
import Link from "next/link";
import * as THREE from "three";

export default function HeaderGlobe({ href }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const slot = containerRef.current;
    if (!slot) return;

    const width = slot.clientWidth || 32;
    const height = slot.clientHeight || 32;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    slot.appendChild(renderer.domElement);
    // Ensure canvas sits below overlay border
    try {
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.top = "0";
      renderer.domElement.style.left = "0";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.zIndex = "1";
      renderer.domElement.style.pointerEvents = "none";
    } catch {}

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height || 1, 0.1, 50);
    camera.position.z = 6.6;

    const geometry = new THREE.SphereGeometry(2, 24, 16);
    const uniforms = {
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 1 },
      uLatCount: { value: 8.0 },
      uLonCount: { value: 16.0 },
      uThickness: { value: 0.06 },
    };
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms,
      vertexShader: `
        varying vec3 vObjNormal;
        void main() {
          vObjNormal = normalize(normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vObjNormal;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uLatCount;
        uniform float uLonCount;
        uniform float uThickness; // 0..0.5 of cell size

        const float PI = 3.14159265358979323846264;

        float lineMask(float angle, float spacing, float thickness) {
          float m = mod(angle, spacing);
          float d = min(m, spacing - m) / spacing; // 0..0.5 normalized
          return 1.0 - smoothstep(thickness, thickness + 0.02, d);
        }

        void main() {
          vec3 n = normalize(vObjNormal);
          float lat = acos(clamp(n.y, -1.0, 1.0)); // 0..PI
          float lon = atan(n.z, n.x); // -PI..PI
          if (lon < 0.0) lon += 2.0 * PI; // 0..2PI

          float latSpacing = PI / max(uLatCount, 1.0);
          float lonSpacing = (2.0 * PI) / max(uLonCount, 1.0);

          float latL = lineMask(lat, latSpacing, uThickness);
          float lonL = lineMask(lon, lonSpacing, uThickness);
          float mask = max(latL, lonL);

          if (mask <= 0.0) discard;
          gl_FragColor = vec4(uColor, mask * uOpacity);
        }
      `,
    });
    const globe = new THREE.Mesh(geometry, material);
    scene.add(globe);

    // Optional tilt so the globe spins on a single, slightly tilted axis
    globe.rotation.x = 0.25; // ~14° subtle tilt
    globe.rotation.z = 0.08; // slight oblique tilt for visual depth
    // Slightly scale down to avoid any edge cropping within the canvas
    globe.scale.set(0.98, 0.98, 0.98);

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isReduced = () => mediaQuery.matches;

    let rafId;
    const tick = () => {
      rafId = window.requestAnimationFrame(tick);
      if (!isReduced()) {
        globe.rotation.y += 0.006; // slower spin around one fixed axis
      }
      renderer.render(scene, camera);
    };
    tick();

    const handleResize = () => {
      const w = slot.clientWidth || 32;
      const h = slot.clientHeight || 32;
      renderer.setSize(w, h, false);
      camera.aspect = (w / h) || 1;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(slot);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (slot.contains(renderer.domElement)) {
        slot.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        width: "32px",
        height: "32px",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {/* persistent circular stroke overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: "50%",
          border: "1px solid #ffffff",
          boxSizing: "border-box",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      {href ? (
        <Link
          href={href}
          aria-label="Go to home"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 3,
            pointerEvents: "auto",
          }}
        />
      ) : null}
      <noscript>
        <svg width="32" height="32" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" strokeWidth="2" />
          <ellipse cx="50" cy="50" rx="45" ry="20" fill="none" stroke="#ffffff" strokeWidth="1" />
          <ellipse cx="50" cy="50" rx="20" ry="45" fill="none" stroke="#ffffff" strokeWidth="1" />
        </svg>
      </noscript>
    </div>
  );
}


