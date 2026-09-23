/* Lightweight particle systems for ambient events. Each system starts,
   follows the player loosely, and stops cleanly. No escape from cozy. */
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

function makePoints(count, color, size, opacity = 0.9) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  return points;
}

class ParticleSystem {
  constructor(scene, { count, color, size, opacity, area, vy, vx, vz, ground = false, flicker = false }) {
    this.scene = scene;
    this.count = count;
    this.area = area;
    this.vy = vy;
    this.vx = vx || 0;
    this.vz = vz || 0;
    this.ground = ground;
    this.flicker = flicker;
    this.points = makePoints(count, color, size, opacity);
    this.vels = new Float32Array(count * 3);
    this.rng = mulberry32(count * 7919 + 3);
    scene.add(this.points);
    this.active = false;
    this.t = 0;
  }

  start(center) {
    this.active = true;
    this.t = 0;
    this.center = center.clone();
    const pos = this.points.geometry.attributes.position;
    for (let i = 0; i < this.count; i++) {
      pos.setXYZ(
        i,
        center.x + (this.rng() - 0.5) * this.area,
        center.y + (this.ground ? this.rng() * 2.5 : this.rng() * 14 + 1),
        center.z + (this.rng() - 0.5) * this.area,
      );
      this.vels[i * 3] = this.vx + (this.rng() - 0.5) * 0.4;
      this.vels[i * 3 + 1] = this.vy + (this.rng() - 0.5) * 0.3;
      this.vels[i * 3 + 2] = this.vz + (this.rng() - 0.5) * 0.4;
    }
    pos.needsUpdate = true;
    this.points.visible = true;
    this.points.material.opacity = 0.9;
  }

  update(dt, playerPos) {
    if (!this.active) return;
    this.t += dt;
    const pos = this.points.geometry.attributes.position;
    for (let i = 0; i < this.count; i++) {
      let x = pos.getX(i) + this.vels[i * 3] * dt;
      let y = pos.getY(i) + this.vels[i * 3 + 1] * dt;
      let z = pos.getZ(i) + this.vels[i * 3 + 2] * dt;
      // Wrap into a box around the player.
      const R = this.area / 2;
      if (x - playerPos.x > R) x -= this.area; else if (x - playerPos.x < -R) x += this.area;
      if (z - playerPos.z > R) z -= this.area; else if (z - playerPos.z < -R) z += this.area;
      if (y < playerPos.y - 1) y = playerPos.y + 12 + this.rng() * 4;
      if (y > playerPos.y + 22) y = playerPos.y + 0.5;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    if (this.flicker) {
      this.points.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 2.1));
    }
    // Drift the emitter with the player so particles are always around.
    this.center.lerp(playerPos, Math.min(1, dt * 0.4));
  }

  stop() {
    this.active = false;
    this.points.visible = false;
  }
}

class AuroraSystem {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.PlaneGeometry(600, 140, 48, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        uniform float time;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z += sin(uv.x * 9.0 + time * 0.7) * 26.0;
          p.y += sin(uv.x * 5.0 + time * 0.45) * 9.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float time;
        void main() {
          float band = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          float wave = 0.65 + 0.35 * sin(vUv.x * 22.0 + time * 1.1);
          vec3 col = mix(vec3(0.45, 0.85, 0.65), vec3(0.55, 0.6, 0.95), 0.5 + 0.5 * sin(vUv.x * 7.0 + time * 0.3));
          gl_FragColor = vec4(col, band * wave * 0.34);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.active = false;
    this.t = 0;
  }
  start(center) {
    this.active = true; this.t = 0;
    this.mesh.visible = true;
    this.base = center.clone();
  }
  update(dt, playerPos) {
    if (!this.active) return;
    this.t += dt;
    this.mesh.material.uniforms.time.value = this.t;
    this.mesh.position.set(playerPos.x, playerPos.y + 85, playerPos.z - 160);
  }
  stop() { this.active = false; this.mesh.visible = false; }
}

class ShootingStarsSystem {
  constructor(scene) {
    this.scene = scene;
    this.stars = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
      const m = new THREE.LineBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0 });
      const line = new THREE.Line(g, m);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.stars.push({ line, life: 0, delay: 2 + i * 4, vel: new THREE.Vector3() });
    }
    this.active = false;
    this.t = 0;
  }
  start() { this.active = true; this.t = 0; for (const s of this.stars) s.life = 0; }
  update(dt, playerPos) {
    if (!this.active) return;
    this.t += dt;
    for (const s of this.stars) {
      if (this.t > s.delay && s.life === 0) {
        s.life = 1.6;
        s.line.visible = true;
        const from = new THREE.Vector3(playerPos.x + (Math.random() - 0.5) * 300, playerPos.y + 90 + Math.random() * 60, playerPos.z + (Math.random() - 0.5) * 300);
        s.vel.set(-60 - Math.random() * 60, -25 - Math.random() * 20, (Math.random() - 0.5) * 40);
        const pos = s.line.geometry.attributes.position;
        pos.setXYZ(0, from.x, from.y, from.z);
        pos.setXYZ(1, from.x, from.y, from.z);
        pos.needsUpdate = true;
        s.line.material.opacity = 0.9;
      } else if (s.life > 0) {
        s.life -= dt;
        const pos = s.line.geometry.attributes.position;
        const hx = pos.getX(1) - s.vel.x * dt, hy = pos.getY(1) - s.vel.y * dt, hz = pos.getZ(1) - s.vel.z * dt;
        pos.setXYZ(0, pos.getX(1), pos.getY(1), pos.getZ(1));
        pos.setXYZ(1, hx, hy, hz);
        pos.needsUpdate = true;
        s.line.material.opacity = Math.max(0, s.life / 1.6);
        if (s.life <= 0) { s.line.visible = false; s.delay = this.t + 3 + Math.random() * 6; }
      }
    }
  }
  stop() { this.active = false; for (const s of this.stars) { s.line.visible = false; s.life = 0; } }
}

class BirdFlockSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.birds = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x5a5f6a, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 3), mat);
      b.rotation.x = Math.PI / 2;
      this.group.add(b);
      this.birds.push(b);
    }
    this.group.visible = false;
    scene.add(this.group);
    this.active = false;
    this.t = 0;
  }
  start(center) {
    this.active = true; this.t = 0;
    this.group.visible = true;
    this.from = center.clone().add(new THREE.Vector3(-220, 45 + Math.random() * 20, 60 + Math.random() * 60));
    this.to = center.clone().add(new THREE.Vector3(280, 55 + Math.random() * 20, -40 - Math.random() * 80));
  }
  update(dt, playerPos) {
    if (!this.active) return;
    this.t += dt;
    const f = this.t / 34;
    this.group.position.lerpVectors(this.from, this.to, f);
    this.group.children.forEach((b, i) => {
      const a = this.t * 9 + i * 1.3;
      b.position.set(Math.sin(a) * 2.2 + (i % 3) * 2.4 - 2.4, Math.cos(a * 0.7) * 1.1 + Math.floor(i / 3) * 2.2, Math.cos(a) * 2.2);
      b.rotation.y = Math.sin(a) * 0.35;
    });
    if (f >= 1) this.stop();
  }
  stop() { this.active = false; this.group.visible = false; }
}

export function buildAmbientSystems(scene) {
  return {
    fireflies: new ParticleSystem(scene, { count: 90, color: 0xd8f090, size: 0.28, opacity: 0.9, area: 60, vy: 0.12, flicker: true, ground: false }),
    butterflies: new ParticleSystem(scene, { count: 40, color: 0xf2b8d0, size: 0.34, opacity: 0.95, area: 50, vy: 0.08, vz: 0.3 }),
    rain: new ParticleSystem(scene, { count: 700, color: 0xa8c8dc, size: 0.14, opacity: 0.55, area: 90, vy: -14 }),
    fallingLeaves: new ParticleSystem(scene, { count: 120, color: 0xd8a86a, size: 0.3, opacity: 0.9, area: 70, vy: -0.9, vx: 0.5 }),
    snow: new ParticleSystem(scene, { count: 500, color: 0xf0f4f8, size: 0.22, opacity: 0.85, area: 90, vy: -1.6, vx: 0.3 }),
    birds: new BirdFlockSystem(scene),
    aurora: new AuroraSystem(scene),
    shootingStars: new ShootingStarsSystem(scene),
    windGusts: new ParticleSystem(scene, { count: 60, color: 0xe8e4d8, size: 0.4, opacity: 0.28, area: 110, vx: 9, vy: 0.2 }),
    waves: new ParticleSystem(scene, { count: 30, color: 0xbfe0e8, size: 0.6, opacity: 0.3, area: 130, vx: 1.4, vy: 0.05 }),
  };
}
