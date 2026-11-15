"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Cloudflare Turnstile (bot check for anonymous endpoints, P-API-01). Without a site key
 * (local dev) it immediately yields a placeholder token; servers skip the check without a secret.
 */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) {
      cb.current("dev");
      return;
    }
    let id: string | undefined;
    const render = () => {
      if (el.current && window.turnstile) {
        id = window.turnstile.render(el.current, { sitekey: SITE_KEY, callback: (t: string) => cb.current(t), appearance: "interaction-only" });
      }
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      if (id) window.turnstile?.remove(id);
    };
  }, []);

  return SITE_KEY ? <div ref={el} className="flex justify-center" /> : null;
}
