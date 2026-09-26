"use client";
import { useEffect, useRef, useState } from "react";
import type { Game, Battle } from "@/lib/game";
import { createPixiWorld } from "./pixi-world";

export type WorldCommand = {
  kind: "home" | "realm" | "zoom-in" | "zoom-out" | "focus";
  id?: string;
  nonce: number;
};
export type WorldProps = {
  game: Game;
  me: string;
  selection: number;
  onSelectPlot: (n: number) => void;
  onSelectPlayer: (id: string) => void;
  battle: Battle | null;
  onBattleEnd: () => void;
  onViewChange: (overview: boolean) => void;
  command: WorldCommand | null;
  quality: "high" | "low";
};
export type WorldRuntime = {
  update: (g: Game, me: string, plot: number) => void;
  command: (c: WorldCommand) => void;
  attack: (b: Battle | null) => void;
  dispose: () => void;
};
export default function World(props: WorldProps) {
  const canvasHost = useRef<HTMLDivElement>(null),
    landmarks = useRef<HTMLDivElement>(null),
    runtime = useRef<WorldRuntime | null>(null),
    propsRef = useRef(props);
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    propsRef.current = props;
  });
  useEffect(() => {
    if (!canvasHost.current || !landmarks.current) return;
    // A destroyed WebGL context cannot safely be reused by retries or Fast Refresh.
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "Interactive isometric kingdom. Drag or use arrow keys to pan, pinch or scroll to zoom; tap clearings or rival castles. Camera buttons are also available.",
    );
    canvasHost.current.appendChild(canvas);
    const abort = new AbortController();
    createPixiWorld(canvas, propsRef, landmarks.current, abort.signal)
      .then((world) => {
        if (abort.signal.aborted) {
          world?.dispose();
          return;
        }
        runtime.current = world;
        setLoaded(true);
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          console.error("Pixi world failed", error);
          setError(true);
        }
      });
    return () => {
      abort.abort();
      runtime.current?.dispose();
      runtime.current = null;
      canvas.remove();
    };
  }, [attempt]);
  useEffect(
    () => runtime.current?.update(props.game, props.me, props.selection),
    [props.game, props.me, props.selection],
  );
  useEffect(() => {
    if (props.command) runtime.current?.command(props.command);
  }, [props.command]);
  useEffect(() => runtime.current?.attack(props.battle), [props.battle]);
  return (
    <div className="world">
      <div ref={canvasHost} style={{ position: "absolute", inset: 0 }} />
      <div
        ref={landmarks}
        className="realm-landmarks"
        aria-label="Strongholds on the realm map"
      />
      {!loaded && !error && (
        <div className="world-loading">
          <div className="loading-sigil">♜</div>
          <span>Unfolding the kingdom…</span>
        </div>
      )}
      {error && (
        <div className="world-loading">
          <b>The kingdom could not be drawn.</b>
          <p>
            Check your connection and browser graphics support, then try again.
          </p>
          <button
            className="outline-button"
            onClick={() => {
              setError(false);
              setLoaded(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
