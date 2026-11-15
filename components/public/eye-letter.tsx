"use client";

import { useEffect, useRef } from "react";

/**
 * A letter "O" drawn as a googly eye: the pupil follows the pointer (or finger), wanders
 * on its own when idle, and blinks now and then. Purely decorative — the heading carries
 * the real text for screen readers.
 */
export function EyeLetter() {
  const eyeRef = useRef<HTMLSpanElement>(null);
  const pupilRef = useRef<HTMLSpanElement>(null);
  const lidRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const eye = eyeRef.current;
    const pupil = pupilRef.current;
    const lid = lidRef.current;
    if (!eye || !pupil || !lid) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let target = { x: 0, y: 0.15 }; // -1..1 within the socket
    const cur = { x: 0, y: 0 };
    let lastMove = 0;
    let raf = 0;
    let blinkT: ReturnType<typeof setTimeout> | undefined;

    const aim = (px: number, py: number) => {
      const r = eye.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 220); // far pointer → pupil at the rim
      target = { x: (dx / d) * reach, y: (dy / d) * reach };
      lastMove = performance.now();
      if (reduce) apply(target);
    };
    const apply = (p: { x: number; y: number }) => {
      pupil.style.transform = `translate(calc(-50% + ${p.x * 34}%), calc(-50% + ${p.y * 30}%))`;
    };
    const onMove = (e: PointerEvent) => aim(e.clientX, e.clientY);

    const tick = (now: number) => {
      // Idle for 3 s → glance around on its own.
      if (now - lastMove > 3000 && Math.random() < 0.012) {
        target = { x: Math.random() * 1.6 - 0.8, y: Math.random() * 1.2 - 0.5 };
      }
      cur.x += (target.x - cur.x) * 0.14;
      cur.y += (target.y - cur.y) * 0.14;
      apply(cur);
      raf = requestAnimationFrame(tick);
    };

    const blink = () => {
      lid.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }, { transform: "scaleY(0)" }], { duration: 180, easing: "ease-in-out" });
      blinkT = setTimeout(blink, 2200 + Math.random() * 4500);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    if (reduce) apply(target);
    else {
      raf = requestAnimationFrame(tick);
      blinkT = setTimeout(blink, 1500 + Math.random() * 2000);
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(blinkT);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);

  return (
    <span
      ref={eyeRef}
      aria-hidden
      // Sized to the display face's cap height so it sits in the word like a real "O".
      className="relative mx-[0.02em] inline-block h-[0.74em] w-[0.7em] translate-y-[0.02em] overflow-hidden rounded-[50%] bg-ink align-baseline"
    >
      <span className="absolute inset-[19%_17%] overflow-hidden rounded-[50%] bg-bg">
        <span ref={pupilRef} className="absolute top-1/2 left-1/2 h-[52%] w-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink will-change-transform" />
        <span ref={lidRef} className="absolute inset-0 origin-top scale-y-0 bg-ink" />
      </span>
    </span>
  );
}
