'use client';
import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { avatarBuilder } from './avatarBuilder';

export default function AvatarPreview({
  color,
  accessory,
}: {
  color: string;
  accessory: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    live = useRef({ color, accessory });
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    live.current = { color, accessory };
  }, [color, accessory]);
  useEffect(() => {
    if (!host.current) return;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setUnavailable(true);
      return;
    }
    const el = host.current,
      scene = new T.Scene(),
      camera = new T.PerspectiveCamera(32, 1, 0.1, 30);
    camera.position.set(0, 1.45, 5.7);
    camera.lookAt(0, 1.2, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const geometries: T.BufferGeometry[] = [],
      materials: T.Material[] = [];
    const mat = (color: string) => {
      const m = new T.MeshStandardMaterial({ color, roughness: 0.65 });
      materials.push(m);
      return m;
    };
    const mesh = (
      g: T.BufferGeometry,
      m: T.Material,
      parent: T.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      geometries.push(g);
      const o = new T.Mesh(g, m);
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    const box = (
      w: number,
      h: number,
      d: number,
      m: T.Material,
      p: T.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => mesh(new RoundedBoxGeometry(w, h, d, 1, 0.045), m, p, x, y, z);
    const sphere = (
      r: number,
      m: T.Material,
      p: T.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => mesh(new T.SphereGeometry(r, 16, 12), m, p, x, y, z);
    const { makeAvatar, addAccessories } = avatarBuilder({
      mesh,
      box,
      sphere,
      skin: mat('#a4bbc9'),
      eyeBag: mat('#8fa8bc'),
      browMat: mat('#354d65'),
      padding: mat('#101d28'),
      white: mat('#e8f0e8'),
      black: mat('#091b25'),
      steel: mat('#355466'),
      amber: mat('#e6ad71'),
      dark: mat('#142b37'),
    });
    const shirt = mat(live.current.color),
      avatar = makeAvatar(shirt),
      wear = addAccessories(avatar.body);
    scene.add(avatar.g);
    scene.add(new T.HemisphereLight('#e0f5ff', '#384960', 2.5));
    const key = new T.DirectionalLight('#ffffff', 3);
    key.position.set(2, 4, 5);
    scene.add(key);
    const rim = new T.DirectionalLight('#9cdde8', 2);
    rim.position.set(-3, 2, -2);
    scene.add(rim);
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      angle = 0,
      dragging = false,
      lastX = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (dragging) {
        angle += (e.clientX - lastX) * 0.013;
        lastX = e.clientX;
      }
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    const draw = (t: number) => {
      shirt.color.set(live.current.color);
      wear(live.current.accessory);
      avatar.g.rotation.y =
        angle + (reduced.matches ? -0.15 : Math.sin(t / 2200) * 0.12);
      avatar.body.position.y = reduced.matches ? 0 : Math.sin(t / 700) * 0.014;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      className="avatar-preview"
      ref={host}
      role="img"
      aria-label={`Your Noobius preview, ${accessory === 'cap' ? 'wearing a cap' : 'wearing a headset'}`}
    >
      {unavailable && <img src="/assets/noobius.jpeg" alt="Noobius" />}
    </div>
  );
}
