"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FADE_MS = 600;
const SAFETY_MS = 25_000;

/**
 * Full-screen intro video (public/intro.mp4) shown on the home page before the student login.
 * Plays to the end every time the site is opened — no skip or sound buttons, by request.
 * After it ends, the flag on <html> stops it replaying when the student navigates back home
 * inside the app. SAFETY_MS ends it if the video stalls.
 */
export function IntroLoader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    setTimeout(() => {
      setVisible(false);
      document.body.style.overflow = "";
      document.documentElement.dataset.intro = "skip";
      document.getElementById("login-niat")?.focus({ preventScroll: true });
    }, FADE_MS);
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.intro === "skip") {
      doneRef.current = true;
      setVisible(false);
      return;
    }
    document.body.style.overflow = "hidden";
    const v = videoRef.current;
    if (v) {
      v.muted = true;
      v.play()?.catch(() => {});
    }
    const safetyT = setTimeout(finish, SAFETY_MS);
    return () => {
      clearTimeout(safetyT);
      document.body.style.overflow = "";
    };
  }, [finish]);

  return (
    <>
      {visible && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Intro animation"
          className="intro-overlay fixed inset-0 z-[100] flex items-center justify-center bg-bg transition-opacity ease-out"
          style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms`, pointerEvents: fading ? "none" : "auto" }}
        >
          <video
            ref={videoRef}
            src="/intro.mp4"
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={finish}
            onError={finish}
            aria-hidden
            // White video background blends into the paper colour; in dark mode it sits on a paper card.
            className="pointer-events-none h-auto w-[min(92vw,90dvh)] max-w-[760px] select-none [clip-path:inset(4px)] mix-blend-multiply dark:rounded-3xl dark:border-2 dark:border-ink dark:bg-white dark:mix-blend-normal"
          />

        </div>
      )}
    </>
  );
}

/** Footer link: reload the home page so the intro plays again. */
export function ReplayIntroLink() {
  return (
    <button
      type="button"
      className="underline underline-offset-2"
      onClick={() => {
        window.location.assign("/");
      }}
    >
      Replay intro
    </button>
  );
}
