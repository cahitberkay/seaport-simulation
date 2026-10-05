import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Stylised bay water: a flat plane whose normals and colour are perturbed procedurally
 * (no vertex waves needed at this scale), with drifting light streaks and a lighter band
 * along the shorelines.
 */
export function Water() {
  const { mat, uniforms } = useMemo(() => {
    const uniforms = { uTime: { value: 0 } }
    const mat = new THREE.MeshStandardMaterial({ color: '#7cc0ea', roughness: 0.32, metalness: 0.05 })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterXZ = (modelMatrix * vec4(position, 1.0)).xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          varying vec2 vWaterXZ;
          float wv(vec2 p) {
            return sin(p.x * 0.09 + uTime * 0.9) * 0.5
                 + sin(p.y * 0.12 - uTime * 0.7) * 0.45
                 + sin((p.x + p.y) * 0.05 + uTime * 0.5) * 0.6
                 + sin((p.x * 0.7 - p.y) * 0.23 + uTime * 1.7) * 0.22;
          }
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec2 p = vWaterXZ;
            float n = vnoise(p * 0.004) * 0.6 + vnoise(p * 0.012) * 0.4;
            vec3 deep = vec3(0.07, 0.30, 0.62);
            vec3 shallow = vec3(0.20, 0.52, 0.80);
            float shore = max(smoothstep(70.0, 0.0, p.y), smoothstep(620.0, 760.0, p.y));
            diffuseColor.rgb = mix(deep, shallow, clamp(n * 0.55 + shore * 0.6, 0.0, 1.0));
            float streak = sin(p.x * 0.035 + sin(p.y * 0.021 + uTime * 0.25) * 2.4 + uTime * 0.35);
            float s2 = vnoise(p * 0.03 + vec2(uTime * 0.05, 0.0));
            diffuseColor.rgb += vec3(0.22) * smoothstep(0.9, 1.0, streak) * smoothstep(0.45, 0.8, s2);
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 p = vWaterXZ;
            float e = 0.6;
            float dx = wv(p + vec2(e, 0.0)) - wv(p - vec2(e, 0.0));
            float dz = wv(p + vec2(0.0, e)) - wv(p - vec2(0.0, e));
            vec3 wn = normalize(vec3(-dx * 0.35, 1.0, -dz * 0.35));
            normal = normalize(mix(normal, (viewMatrix * vec4(wn, 0.0)).xyz, 0.85));
          }`,
        )
    }
    return { mat, uniforms }
  }, [])

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime
  })

  return (
    <mesh material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[12000, 12000]} />
    </mesh>
  )
}
