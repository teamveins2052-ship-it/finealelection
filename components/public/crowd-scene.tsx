"use client";

import { useEffect, useRef } from "react";

/**
 * Hand-drawn campus crowd behind the landing hero (original artwork, drawn in code):
 * chubby paper students wander in little groups, chat in speech bubbles, and walk up to a
 * giant voting machine that looms in from the top edge to press their button.
 * Plain 2D canvas (no 3D library) so it stays small and never touches the voting path.
 * Reduced motion → one still frame. Hidden tab → paused.
 */

const CLUBS = ["nsgc", "sports", "media", "genai", "cultural", "tech"] as const;
const CHATTER = ["hi!", "voted!", "which club?", "go Tech!", "ok", "nice", "me too", "hello", "vote!", "so cool", "who's in?", "hey", "Media!", "GenAI ftw", "see you", "yeah", "same", "lol"];
const SIGNS = ["VOTE!", "NIAT '26", "GO VOTE", "YOUR VOICE"];

interface Agent {
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  phase: number;
  dir: 1 | -1;
  wait: number; // seconds to idle before the next target
  color: string | null; // club shirt
  hair: "cap" | "hair" | null;
  sign: string | null;
  goingToVote: boolean;
  bubble: { text: string; until: number } | null;
  press: number; // >0 while pressing the machine (seconds left)
}

interface Palette {
  ink: string;
  surface: string;
  muted: string;
  clubs: string[];
  display: string; // font stacks, read once (not per frame)
  body: string;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const bodyCs = getComputedStyle(document.body);
  return {
    ink: v("--ink"), surface: v("--surface"), muted: v("--text-muted"), clubs: CLUBS.map((c) => v(`--club-${c}`)),
    display: bodyCs.getPropertyValue("--font-display-face").trim() || "sans-serif",
    body: bodyCs.fontFamily || "sans-serif",
  };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)] as T;

export function CrowdScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pal = readPalette();
    let w = 0;
    let h = 0;
    let agents: Agent[] = [];
    // Giant voting machine: centre x, top-edge y, scale, tilt. Its front edge is where students vote.
    let evm = { x: 0, y: 0, s: 1, rot: 0, frontY: 0 };
    let raf = 0;
    let last = performance.now();
    let nextChat = 0;
    let time = 0;
    let beep = 0; // machine light flash

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Desktop: looms over the top-right like a landmark. Phones: across the top, above the headline.
      if (w >= 1024) {
        const s = Math.min(1.35, w / 1150);
        evm = { x: w * 0.8, y: -40 * s, s, rot: -0.1, frontY: 0 };
      } else if (w >= 640) {
        evm = { x: w * 0.72, y: -30, s: 0.95, rot: -0.1, frontY: 0 };
      } else {
        evm = { x: w * 0.68, y: -46, s: 0.62, rot: -0.1, frontY: 0 };
      }
      evm.frontY = evm.y + 250 * evm.s;
    };

    const minY = () => Math.max(evm.frontY + 24, h * 0.12);
    const randomSpot = () => ({ x: rand(-20, w + 20), y: rand(minY(), h * 0.99) });
    const evmSpot = () => ({ x: evm.x + rand(-220, 200) * evm.s, y: evm.frontY + rand(18, 40) * evm.s });

    // Half the time, head for a spot near someone else's destination → little groups form.
    const nextTarget = (self: Agent) => {
      if (Math.random() < 0.5 && agents.length > 1) {
        const other = pick(agents);
        if (other !== self) return { x: other.tx + rand(-38, 38), y: Math.max(minY(), other.ty + rand(-22, 22)) };
      }
      return randomSpot();
    };

    const makeAgent = (cx?: number, cy?: number): Agent => {
      const p = cx !== undefined && cy !== undefined ? { x: cx + rand(-40, 40), y: Math.max(minY(), cy + rand(-24, 24)) } : randomSpot();
      return {
        x: p.x, y: p.y, tx: p.x, ty: p.y, speed: rand(16, 28), phase: rand(0, Math.PI * 2), dir: Math.random() < 0.5 ? 1 : -1, wait: rand(0, 3),
        color: Math.random() < 0.35 ? pick(pal.clubs) : null,
        hair: Math.random() < 0.3 ? "cap" : Math.random() < 0.45 ? "hair" : null,
        sign: Math.random() < 0.08 ? pick(SIGNS) : null,
        goingToVote: false, bubble: null, press: 0,
      };
    };

    const populate = () => {
      const n = w < 640 ? 24 : w < 1024 ? 42 : 72;
      agents = [];
      while (agents.length < n) {
        const c = randomSpot();
        const size = Math.floor(rand(1, 5));
        for (let i = 0; i < size && agents.length < n; i++) agents.push(makeAgent(c.x, c.y));
      }
    };

    const depth = (y: number) => (w < 640 ? 0.85 : 0.9) * (0.7 + 0.55 * Math.min(1, Math.max(0, y / h)));

    const say = (a: Agent, text: string, ms = 2200) => {
      a.bubble = { text, until: time + ms / 1000 };
    };

    // ---- drawing helpers ----
    const stroke = (alpha: number, width = 1.6) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    const fill = (color: string, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fill();
    };
    /** Paper fill + soft pencil shading on the lower-right, then outline. Path must be set. */
    const shadedBlob = (path: () => void, sx: number, sy: number, rx: number, ry: number, shirt: string | null) => {
      path();
      fill(pal.surface);
      ctx.save();
      path();
      ctx.clip();
      if (shirt) {
        ctx.beginPath();
        ctx.rect(sx - rx * 3, sy - ry * 0.15, rx * 6, ry * 3);
        fill(shirt, 0.85);
      }
      ctx.beginPath();
      ctx.ellipse(sx + rx * 0.55, sy + ry * 0.45, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
      fill(pal.ink, 0.1);
      ctx.restore();
      path();
      stroke(0.42);
    };

    // ---- giant voting machine ----
    const drawEvm = () => {
      const { x, y, s, rot } = evm;
      const W = 560 * s;
      const H = 250 * s;
      const T = 26 * s; // body thickness (front edge)
      ctx.save();
      // long soft shadow on the ground
      ctx.beginPath();
      ctx.ellipse(x + 90 * s, y + H + 22 * s, W * 0.62, 38 * s, -0.06, 0, Math.PI * 2);
      fill(pal.ink, 0.07);

      ctx.translate(x, y);
      ctx.rotate(rot);
      const left = -W / 2;
      // front edge (thickness)
      ctx.beginPath();
      ctx.roundRect(left, H - 18 * s, W, T + 18 * s, 18 * s);
      fill(pal.surface);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = pal.ink;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(left, H, W, T);
      ctx.restore();
      stroke(0.5, 2.4 * s);
      // top face
      ctx.beginPath();
      ctx.roundRect(left, 0 - 200 * s, W, H + 200 * s, 22 * s);
      fill(pal.surface);
      stroke(0.5, 2.4 * s);
      // pencil hatching for that hand-drawn feel
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(left, -200 * s, W, H + 200 * s, 22 * s);
      ctx.clip();
      ctx.lineWidth = 1;
      ctx.strokeStyle = pal.ink;
      ctx.globalAlpha = 0.06;
      for (let i = -20; i < 40; i++) {
        ctx.beginPath();
        ctx.moveTo(left + i * 16 * s, H);
        ctx.lineTo(left + i * 16 * s + 140 * s, -200 * s);
        ctx.stroke();
      }
      ctx.restore();

      // ballot panel: candidate rows on the left, blue-ish buttons on the right
      const rows = 7;
      const rowH = 30 * s;
      const px = left + 34 * s;
      const py = H - 34 * s - rows * rowH;
      ctx.beginPath();
      ctx.roundRect(px, py, W * 0.62, rows * rowH, 8 * s);
      fill(pal.surface);
      stroke(0.4, 1.6 * s);
      for (let i = 0; i < rows; i++) {
        const ry = py + i * rowH;
        if (i > 0) {
          ctx.beginPath();
          ctx.moveTo(px, ry);
          ctx.lineTo(px + W * 0.62, ry);
          stroke(0.25, 1.2 * s);
        }
        // name scribble + symbol box
        ctx.beginPath();
        ctx.roundRect(px + 12 * s, ry + 9 * s, 26 * s, 13 * s, 3 * s);
        stroke(0.35, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(px + 48 * s, ry + 16 * s);
        ctx.lineTo(px + 48 * s + (110 + ((i * 37) % 70)) * s, ry + 16 * s);
        stroke(0.3, 3 * s);
        // light + button
        const bx = px + W * 0.62 + 40 * s;
        ctx.beginPath();
        ctx.arc(bx, ry + rowH / 2, 4.5 * s, 0, Math.PI * 2);
        const lit = beep > 0 && i === 3;
        fill(lit ? pal.clubs[0] ?? pal.ink : pal.surface);
        stroke(0.45, 1.2 * s);
        ctx.beginPath();
        ctx.ellipse(bx + 46 * s, ry + rowH / 2, 22 * s, 10 * s, 0, 0, Math.PI * 2);
        fill(pal.ink, 0.72);
      }
      // label
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = pal.ink;
      ctx.font = `${Math.round(34 * s)}px ${pal.display}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("VOTE", px, py - 16 * s);
      ctx.globalAlpha = 0.45;
      ctx.font = `800 ${Math.round(12 * s)}px ${pal.body}`;
      ctx.fillText("NIAT ELECTIONS '26", px + 110 * s, py - 18 * s);
      ctx.restore();
    };

    // ---- a chubby student ----
    const drawAgent = (a: Agent) => {
      const k = depth(a.y);
      const moving = a.wait <= 0 && a.press <= 0;
      const swing = moving ? Math.sin(a.phase) : 0;
      const bob = moving ? Math.abs(Math.sin(a.phase)) * 1.6 * k : 0;
      const { x, y } = a;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // ground shadow, cast to the right like the giant's
      ctx.beginPath();
      ctx.ellipse(x + 9 * k, y + 1 * k, 13 * k, 4.2 * k, 0, 0, Math.PI * 2);
      fill(pal.ink, 0.11);
      // feet
      for (const side of [-1, 1] as const) {
        ctx.beginPath();
        ctx.ellipse(x + side * 4 * k + side * swing * 2.4 * k, y - 1.5 * k, 3.6 * k, 2.4 * k, 0, 0, Math.PI * 2);
        fill(pal.surface);
        stroke(0.42);
      }
      const bodyY = y - 13 * k - bob;
      // back arm (behind body)
      const armSwing = a.press > 0 ? -1.2 : swing * 0.5;
      // body
      shadedBlob(
        () => {
          ctx.beginPath();
          ctx.ellipse(x, bodyY, 9 * k, 11 * k, 0, 0, Math.PI * 2);
        },
        x, bodyY, 9 * k, 11 * k, a.color,
      );
      // arms
      for (const side of [-1, 1] as const) {
        if (a.sign && side === a.dir) continue;
        const reach = a.press > 0 && side === 1 ? -8 * k : 0;
        ctx.beginPath();
        ctx.ellipse(x + side * 9.5 * k, bodyY + 2 * k + side * armSwing * 2 * k + reach, 2.8 * k, 5 * k, side * 0.25, 0, Math.PI * 2);
        fill(pal.surface);
        stroke(0.42);
      }
      // head
      const hy = bodyY - 17 * k;
      shadedBlob(
        () => {
          ctx.beginPath();
          ctx.arc(x, hy, 8 * k, 0, Math.PI * 2);
        },
        x, hy, 8 * k, 8 * k, null,
      );
      if (a.hair === "cap") {
        ctx.beginPath();
        ctx.arc(x, hy, 8 * k, Math.PI * 1.02, Math.PI * 1.98);
        ctx.lineTo(x + a.dir * 11 * k, hy - 1 * k);
        ctx.closePath();
        fill(pal.ink, 0.82);
      } else if (a.hair === "hair") {
        ctx.beginPath();
        ctx.ellipse(x, hy - 3 * k, 7.6 * k, 5 * k, 0, Math.PI, Math.PI * 2);
        fill(pal.ink, 0.7);
      }
      // placard on a pole
      if (a.sign) {
        const px = x + 10 * a.dir * k;
        ctx.beginPath();
        ctx.moveTo(px, bodyY + 4 * k);
        ctx.lineTo(px, bodyY - 40 * k);
        stroke(0.55, 1.8);
        ctx.font = `800 ${Math.max(8, Math.round(9 * k))}px ${pal.body}`;
        const tw = ctx.measureText(a.sign).width + 10 * k;
        const sy = bodyY - 56 * k;
        ctx.beginPath();
        ctx.rect(px - tw / 2, sy, tw, 17 * k);
        fill(pal.surface);
        stroke(0.55);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = pal.ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(a.sign, px, sy + 8.5 * k);
      }
      ctx.restore();
    };

    const drawBubble = (a: Agent) => {
      if (!a.bubble) return;
      const k = depth(a.y);
      ctx.save();
      ctx.font = `700 13px ${pal.body}`;
      const tw = ctx.measureText(a.bubble.text).width;
      const bw = tw + 22;
      const bh = 26;
      const bx = a.x - bw / 2;
      const by = a.y - (a.sign ? 76 : 50) * k - bh - 6;
      const fade = Math.min(1, (a.bubble.until - time) * 3);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 11);
      ctx.moveTo(a.x - 5, by + bh);
      ctx.lineTo(a.x, by + bh + 7);
      ctx.lineTo(a.x + 5, by + bh);
      fill(pal.surface, 0.95 * fade);
      stroke(0.45 * fade);
      ctx.globalAlpha = 0.8 * fade;
      ctx.fillStyle = pal.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(a.bubble.text, a.x, by + bh / 2 + 0.5);
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      drawEvm();
      const sorted = [...agents].sort((p, q) => p.y - q.y);
      sorted.forEach(drawAgent);
      sorted.forEach(drawBubble);
    };

    // ---- simulation ----
    const step = (dt: number) => {
      time += dt;
      beep = Math.max(0, beep - dt);
      for (const a of agents) {
        if (a.bubble && a.bubble.until < time) a.bubble = null;
        if (a.press > 0) {
          a.press -= dt;
          continue;
        }
        if (a.wait > 0) {
          a.wait -= dt;
          if (a.wait <= 0) {
            a.goingToVote = Math.random() < 0.18;
            const t = a.goingToVote ? evmSpot() : nextTarget(a);
            a.tx = t.x;
            a.ty = t.y;
          }
          continue;
        }
        const dx = a.tx - a.x;
        const dy = a.ty - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 2) {
          a.wait = rand(1, 5);
          if (a.goingToVote) {
            a.press = 0.7;
            beep = 0.6;
            say(a, pick(["beep!", "voted!", "done ✓"]), 1800);
            a.goingToVote = false;
          }
          continue;
        }
        const v = a.speed * depth(a.y);
        a.x += (dx / dist) * v * dt;
        a.y += (dy / dist) * v * dt;
        a.dir = dx >= 0 ? 1 : -1;
        a.phase += dt * v * 0.4;
      }
      if (time > nextChat) {
        nextChat = time + rand(0.6, 1.4);
        const talking = agents.filter((a) => a.bubble).length;
        if (talking < (w < 640 ? 2 : 5)) {
          const a = pick(agents);
          if (a.x > 20 && a.x < w - 20) say(a, pick(CHATTER));
        }
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (reduce) draw();
      else raf = requestAnimationFrame(frame);
    };

    // Tap empty space → the nearest few students turn and say hi.
    const onPointer = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("a,button,input,label,select,textarea,[role=dialog]")) return;
      const dist = (a: Agent) => Math.hypot(a.x - e.clientX, a.y - e.clientY);
      [...agents].sort((p, q) => dist(p) - dist(q)).slice(0, 3).forEach((a, i) => {
        say(a, pick(["hi!", "hey!", "oh!", "vote!"]), 1800 + i * 200);
        a.dir = e.clientX >= a.x ? 1 : -1;
      });
      if (reduce) draw();
    };

    const onResize = () => {
      layout();
      agents.forEach((a) => {
        a.x = Math.min(a.x, w + 20);
        a.y = Math.min(Math.max(a.y, minY()), h);
      });
      if (reduce) draw();
    };
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    // Re-read colours when the light/dark theme flips.
    const themeObs = new MutationObserver(() => {
      pal = readPalette();
      agents.forEach((a) => {
        if (a.color) a.color = pick(pal.clubs);
      });
      if (reduce) draw();
    });

    layout();
    populate();
    start();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointerdown", onPointer);
    document.addEventListener("visibilitychange", onVisibility);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObs.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-dvh w-screen" />;
}
