"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Castle,
  Swords,
  Users,
  ScrollText,
  Crown,
  Coins,
  Trees,
  Mountain,
  Shield,
  Heart,
  Hammer,
  Flame,
  Sparkles,
  Crosshair,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  Plus,
  Minus,
  Maximize,
  Compass,
  Volume2,
  VolumeX,
  Settings,
  HelpCircle,
  Flag,
  Wind,
  Sun,
  CloudRain,
  DoorOpen,
  Copy,
  Check,
  Globe2,
  RotateCcw,
  LoaderCircle,
  Tent,
  MapPin,
  Footprints,
  Gem,
  Wine,
  Mail,
  X,
  LogOut,
  TriangleAlert,
  Home,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  applyAction,
  createGame,
  runBots,
  BUILDINGS,
  WEAPONS,
  GUESTS,
  WEATHER,
  CLEARINGS,
  canAfford,
  buildCost,
  craftCost,
  betrayalRisk,
  siegeDamage,
  income,
  type Game,
  type Action,
  type Building,
  type Weapon,
  type Resource,
  type Guest,
  type Player,
  type Battle,
} from "@/lib/game";
import type { WorldCommand } from "./world";
import PlayerGuide from "./player-guide";
const World = dynamic(() => import("./world"), {
  ssr: false,
  loading: () => (
    <div className="world-loading">
      <div className="loading-sigil">♜</div>
      <span>Unfolding the kingdom…</span>
    </div>
  ),
});
type GameResponse = {
  game: Game;
  me: string;
  revision: number;
  error?: string;
};
const BUILD_ICONS: Record<Building, LucideIcon> = {
  keep: Castle,
  walls: Shield,
  workshop: Hammer,
  tavern: Wine,
  quarry: Mountain,
};
const WEAPON_ICONS: Record<Weapon, LucideIcon> = {
  trebuchet: Crosshair,
  ballista: Swords,
  goatapult: Flame,
  arcane: Sparkles,
};
const resIcons: Record<Resource, LucideIcon> = {
  gold: Coins,
  wood: Trees,
  stone: Mountain,
};
const stageName = (p: Player) =>
  p.plot === null
    ? "Unclaimed land"
    : p.buildings.keep === 0
      ? "A humble shelter"
      : p.buildings.keep === 1
        ? "Timber stronghold"
        : p.buildings.keep === 2
          ? "Stone castle"
          : "Grand citadel";
const buildName = (b: Building, level: number) =>
  b === "keep"
    ? level === 0
      ? "Timber Hall"
      : level === 1
        ? "Stone Keep"
        : "Grand Citadel"
    : BUILDINGS[b].name;
function Portrait({
  guest,
  className = "",
}: {
  guest: Guest;
  className?: string;
}) {
  const i = GUESTS[guest.kind].index;
  return (
    <div
      role="img"
      aria-label={guest.name}
      className={`portrait portrait-${i} ${className}`}
    />
  );
}
function Cost({
  cost,
  player,
}: {
  cost: Record<Resource, number>;
  player: Player;
}) {
  return (
    <span className="cost">
      {(Object.keys(cost) as Resource[])
        .filter((r) => cost[r] > 0)
        .map((r) => {
          const Icon = resIcons[r];
          return (
            <span className={player[r] < cost[r] ? "short" : ""} key={r}>
              <Icon size={13} />
              {cost[r]}
            </span>
          );
        })}
    </span>
  );
}
function Health({ player }: { player: Player }) {
  return (
    <div className="health">
      <div className="health-top">
        <span>
          <Shield size={13} />
          Stronghold
        </span>
        <span>
          {player.hp}
          <i> / {player.maxHp}</i>
        </span>
      </div>
      <div className="health-track">
        <span
          style={{
            width: `${Math.max(0, (player.hp / player.maxHp) * 100)}%`,
            background: player.hp < player.maxHp * 0.3 ? "#d18e70" : undefined,
          }}
        />
      </div>
    </div>
  );
}
function sound(
  kind: "click" | "launch" | "impact" | "build" | "turn",
  enabled: boolean,
) {
  if (!enabled) return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0.075;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = kind === "impact" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(
      kind === "impact"
        ? 100
        : kind === "launch"
          ? 220
          : kind === "turn"
            ? 440
            : 640,
      ctx.currentTime,
    );
    osc.frequency.exponentialRampToValueAtTime(
      kind === "impact" ? 25 : kind === "launch" ? 60 : 880,
      ctx.currentTime + 0.35,
    );
    osc.connect(gain);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch {}
}

export default function GameClient({ signedIn }: { signedIn: boolean }) {
  const [game, setGame] = useState<Game | null>(null);
  const [me, setMe] = useState("you");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("build");
  const [selection, setSelection] = useState(0);
  const [target, setTarget] = useState("");
  const [weapon, setWeapon] = useState<Weapon>("trebuchet");
  const [dialog, setDialog] = useState<
    "online" | "help" | "settings" | "court" | "chronicle" | "leave" | null
  >(null);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [visitorIndex, setVisitorIndex] = useState(0);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [onlineError, setOnlineError] = useState("");
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [showMobileGuests, setShowMobileGuests] = useState(false);
  const [command, setCommand] = useState<WorldCommand | null>(null);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [seconds, setSeconds] = useState(90);
  const [reduced, setReduced] = useState(false);
  const seen = useRef(new Set<string>());
  const queue = useRef<Battle[]>([]);
  const battleRef = useRef<Battle | null>(null);
  const busyRef = useRef(false);
  const gameRef = useRef<Game | null>(null);
  const soundRef = useRef(false);
  soundRef.current = soundOn;
  gameRef.current = game;
  const commandWorld = (kind: WorldCommand["kind"], id?: string) =>
    setCommand({ kind, id, nonce: Date.now() });
  const displayGame = useCallback((g: Game, initial = false) => {
    if (initial) {
      g.events.forEach((e) => seen.current.add(e.id));
      queue.current = [];
      battleRef.current = null;
      setBattle(null);
    } else {
      const fresh = g.events.filter((e) => !seen.current.has(e.id)).reverse();
      fresh.forEach((e) => {
        seen.current.add(e.id);
        if (e.battle) queue.current.push(e.battle);
      });
      if (
        !battleRef.current &&
        queue.current.length &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        const next = queue.current.shift()!;
        battleRef.current = next;
        setBattle(next);
        sound("launch", soundRef.current);
      } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        queue.current = [];
    }
    setGame(g);
  }, []);
  const load = useCallback(
    async (initial = false) => {
      if (busyRef.current) return;
      try {
        const r = await fetch("/api/game", { cache: "no-store" });
        const content = r.headers.get("content-type");
        if (!content?.includes("application/json"))
          throw new Error(
            "Your sign-in may have expired. Reload to reconnect.",
          );
        const data = (await r.json()) as GameResponse;
        if (!r.ok) throw new Error(data.error);
        displayGame(data.game, initial);
        setMe(data.me);
        setRevision(data.revision);
        setConnected(true);
        setLoadError("");
      } catch (e) {
        setConnected(false);
        setLoadError(
          e instanceof Error
            ? e.message
            : "The royal messenger is taking a detour.",
        );
      }
    },
    [displayGame],
  );
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const touchDevice = window.matchMedia("(pointer: coarse)").matches;
    let preferredQuality: "high" | "low" = touchDevice ? "low" : "high";
    try {
      setSoundOn(localStorage.getItem("castle-sound") === "on");
      const saved = localStorage.getItem("castle-quality");
      if (saved === "low" || saved === "high") preferredQuality = saved;
    } catch {
      /* The game remains playable when browser storage is unavailable. */
    }
    setQuality(preferredQuality);
    if (signedIn) void load(true);
    else {
      displayGame(createGame(), true);
      setConnected(true);
    }
    const code = new URLSearchParams(window.location.search).get("join");
    if (code) {
      setRoomCode(code.toUpperCase().slice(0, 6));
      setDialog("online");
    }
  }, [signedIn, load, displayGame]);
  useEffect(() => {
    if (!signedIn) return;
    const id = setInterval(
      () => {
        if (!document.hidden) void load();
      },
      game?.phase === "lobby" ? 2500 : 4000,
    );
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", focus);
    };
  }, [signedIn, load, game?.phase]);
  useEffect(() => {
    const id = setInterval(
      () =>
        setSeconds(
          Math.max(
            0,
            Math.ceil(((gameRef.current?.deadline ?? 0) - Date.now()) / 1000),
          ),
        ),
      1000,
    );
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const impact = () => sound("impact", soundRef.current);
    document.addEventListener("siege-impact", impact, true);
    return () => document.removeEventListener("siege-impact", impact, true);
  }, []);
  const finishBattle = useCallback(() => {
    if (queue.current.length) {
      const next = queue.current.shift()!;
      battleRef.current = next;
      setBattle(next);
      sound("launch", soundRef.current);
    } else {
      battleRef.current = null;
      setBattle(null);
    }
  }, []);
  async function send(action: Action) {
    if (!game || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (signedIn) {
        const r = await fetch("/api/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "action",
            action,
            requestId: crypto.randomUUID(),
            revision,
          }),
        });
        if (!r.headers.get("content-type")?.includes("application/json"))
          throw new Error(
            "Connection interrupted. Reload to check whether your order arrived.",
          );
        const data = (await r.json()) as GameResponse;
        if (!r.ok) {
          if (r.status === 409) {
            busyRef.current = false;
            await load();
          }
          throw new Error(data.error);
        }
        displayGame(data.game);
        setRevision(data.revision);
        setConnected(true);
      } else displayGame(runBots(applyAction(game, me, action)));
      sound(action.type === "end" ? "turn" : "build", soundOn);
      if (
        ["build", "craft", "recruit", "feast", "repair"].includes(action.type)
      )
        toast.success(
          action.type === "build"
            ? "The builders have been suitably threatened."
            : action.type === "recruit"
              ? "A new guest joins your questionable court."
              : action.type === "repair"
                ? "The cracks have been persuaded to leave."
                : action.type === "feast"
                  ? "Better fed. Slightly more loyal."
                  : "A new instrument of neighbourly diplomacy.",
        );
      if (action.type === "settle") {
        commandWorld("home");
        toast.success("Your shelter is founded. Long live the Borg Meister.");
      }
      if (action.type === "quest" || action.type === "recruit")
        setSelectedGuest(null);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Your order could not be confirmed. Reconnect before trying again.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function roomAction(op: "create" | "join" | "reset" | "leave") {
    if (busyRef.current) return;
    setOnlineError("");
    if (!signedIn) {
      if (op === "reset") {
        seen.current.clear();
        displayGame(createGame(), true);
        setSelection(0);
        setDialog(null);
        return;
      }
      window.location.href =
        "/signin-with-chatgpt?return_to=" +
        encodeURIComponent(roomCode ? `/?join=${roomCode}` : "/");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op,
          name: name.trim() || "Your Lordship",
          code: roomCode.trim().toUpperCase(),
        }),
      });
      if (!r.headers.get("content-type")?.includes("application/json"))
        throw new Error("Your connection was interrupted. Please reload.");
      const d = (await r.json()) as GameResponse;
      if (!r.ok) throw new Error(d.error);
      displayGame(d.game, true);
      setRevision(d.revision);
      setMe(d.me);
      setSelection(0);
      setTarget("");
      if (op === "join" || op === "create") setDialog("online");
      else setDialog(null);
      window.history.replaceState({}, "", window.location.pathname);
      commandWorld("home");
    } catch (e) {
      setOnlineError(
        e instanceof Error ? e.message : "Could not reach the realm.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function toggleSound() {
    const v = !soundOn;
    setSoundOn(v);
    try {
      localStorage.setItem("castle-sound", v ? "on" : "off");
    } catch {
      /* Sound still works when preferences cannot be stored. */
    }
    sound("click", v);
  }
  async function copyInvite() {
    if (!game) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?join=${game.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error(`Realm code: ${game.code}. Share it with your rivals.`);
    }
  }
  const mine = game?.players.find((p) => p.id === me);
  if (!game || !mine)
    return (
      <main className="boot-screen">
        <div className="brand large">
          <Castle />
          <span>
            CASTLE<b>CHAOS</b>
          </span>
        </div>
        <p>{loadError || "Finding your place in the kingdom…"}</p>
        {loadError && (
          <button className="gold-button" onClick={() => void load(true)}>
            Send another messenger
          </button>
        )}
      </main>
    );
  const rivals = game.players.filter((p) => p.id !== me);
  const selectedTarget =
    rivals.find((p) => p.id === target && p.hp > 0) ??
    rivals.find((p) => p.hp > 0);
  const myTurn =
    game.players[game.current]?.id === me && game.phase === "playing";
  const canAct = myTurn && mine.orders > 0 && !busy && !battle && mine.hp > 0;
  const settling = game.phase === "settling";
  const inLobby = game.phase === "lobby";
  const visitor =
    game.visitors[visitorIndex % Math.max(1, game.visitors.length)];
  const gains = income(mine);
  const currentWeather = WEATHER[game.weather];
  const weatherIcon =
    game.weather === 2 ? CloudRain : game.weather === 1 ? Wind : Sun;
  const WeatherIcon = weatherIcon;
  const orderStatus =
    game.phase === "finished"
      ? "The crown has been claimed"
      : inLobby
        ? "Gather your rivals"
        : settling
          ? mine.plot === null
            ? "Choose where your story begins"
            : "Waiting for the other Borg Meisters"
          : myTurn
            ? mine.orders
              ? `${mine.orders} royal orders remaining`
              : "Your work here is done"
            : `${game.players[game.current].name} is plotting`;
  const chosenGuest = selectedGuest
    ? (mine.guests.find((g) => g.id === selectedGuest.id) ??
      game.visitors.find((g) => g.id === selectedGuest.id) ??
      selectedGuest)
    : null;
  return (
    <main
      className={`game-shell ${battle ? "is-battling" : ""} ${settling ? "is-settling" : ""} ${showMobileGuests ? "guests-open" : ""}`}
    >
      <Toaster position="top-center" theme="dark" closeButton richColors />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Castle Chaos home">
          <Castle strokeWidth={1.4} />
          <span>
            CASTLE<b>CHAOS</b>
          </span>
          <small>A MOST UNCIVILISED SIEGE</small>
        </a>
        <div className="treasury" aria-label="Your resources">
          {(["gold", "wood", "stone"] as Resource[]).map((r) => {
            const Icon = resIcons[r];
            return (
              <div className={`resource ${r}`} key={r}>
                <span className="resource-icon">
                  <Icon />
                </span>
                <div>
                  <b>{mine[r].toLocaleString()}</b>
                  <span>
                    {r === "wood" ? "Timber" : r === "gold" ? "Gold" : "Stone"}{" "}
                    <em>+{gains[r]}</em>
                  </span>
                </div>
              </div>
            );
          })}
          <div className="resource morale">
            <Heart />
            <div>
              <b>
                {mine.morale}
                <small>%</small>
              </b>
              <span>Morale</span>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="online-button"
            aria-label="Play with friends / war room"
            onClick={() => setDialog("online")}
          >
            <Users size={16} />
            <span>
              {game.mode === "online" ? "War room" : "Play with friends"}
            </span>
          </button>
          <button
            className="icon-button sound-button"
            title={soundOn ? "Mute sound" : "Enable sound"}
            aria-label={soundOn ? "Mute sound" : "Enable sound"}
            onClick={toggleSound}
          >
            {soundOn ? <Volume2 /> : <VolumeX />}
          </button>
          <button
            className="avatar-button"
            aria-label="Settings"
            onClick={() => setDialog("settings")}
          >
            <Crown size={20} />
          </button>
        </div>
      </header>
      <div className="world-stage">
        <World
          game={game}
          me={me}
          selection={selection}
          onSelectPlot={(n) => {
            setSelection(n);
            sound("click", soundOn);
          }}
          onSelectPlayer={(id) => {
            if (id === me) commandWorld("home");
            else {
              setTarget(id);
              setTab("attack");
              commandWorld("focus", id);
            }
          }}
          battle={battle}
          onBattleEnd={finishBattle}
          command={command}
          quality={quality}
        />
        <div className="stage-vignette" />
        <div className="top-world-line">
          <div className="realm-title">
            <span className="tiny-diamond" />
            THE BRAMBLELANDS
            <span className="realm-mode">
              {game.mode === "practice"
                ? "PRACTICE REALM"
                : `REALM ${game.code}`}
            </span>
          </div>
          <div className="weather">
            <WeatherIcon size={16} />
            <span>{currentWeather.name}</span>
            <span className="weather-tip">{currentWeather.effect}</span>
          </div>
        </div>
        <aside className="left-rail">
          <section className="stronghold-panel framed">
            <div className="eyebrow">
              <Flag size={12} />
              YOUR {mine.plot === null ? "BORG MEISTER" : "STRONGHOLD"}
            </div>
            <div className="stronghold-heading">
              <div className="crest">
                <Crown size={27} />
              </div>
              <div>
                <h1>
                  {mine.plot === null ? "A fresh beginning" : mine.castle}
                </h1>
                <p>{stageName(mine)}</p>
              </div>
            </div>
            {mine.plot !== null ? (
              <Health player={mine} />
            ) : (
              <p className="arrival-note">
                No title deeds. No roof.
                <br />A frankly alarming amount of ambition.
              </p>
            )}
            <div className="castle-stats">
              <span>
                <Shield size={14} />
                {mine.buildings.walls * 8}
                <small>armour</small>
              </span>
              <span>
                <Users size={14} />
                {mine.guests.length}
                <small>guests</small>
              </span>
              <span>
                <Crown size={14} />
                {mine.buildings.keep}
                <small>tier</small>
              </span>
            </div>
          </section>
          <nav className="game-nav" aria-label="Kingdom navigation">
            <button
              aria-label="My stronghold"
              className={tab === "build" ? "active" : ""}
              onClick={() => {
                setTab("build");
                commandWorld("home");
              }}
            >
              <Castle size={18} />
              <span>My stronghold</span>
              <ChevronRight size={14} />
            </button>
            <button
              aria-label="The neighbours"
              className={tab === "attack" ? "active" : ""}
              onClick={() => {
                setTab("attack");
                commandWorld("realm");
              }}
            >
              <Swords size={18} />
              <span>The neighbours</span>
              <span className="nav-count">{rivals.length}</span>
            </button>
            <button
              aria-label="My questionable court"
              onClick={() => setDialog("court")}
            >
              <Users size={18} />
              <span>My questionable court</span>
              <span className="nav-count">{mine.guests.length}</span>
            </button>
            <button
              aria-label="The chronicles"
              onClick={() => setDialog("chronicle")}
            >
              <ScrollText size={18} />
              <span>The chronicles</span>
              <span className="notification-tick" />
            </button>
          </nav>
          <div className="rivals-label">
            <span>NEIGHBOURLY RIVALRY</span>
            <span>{rivals.length + 1} RULERS</span>
          </div>
          <div className="rival-list">
            {rivals.map((p) => (
              <button
                key={p.id}
                className={`rival ${p.id === selectedTarget?.id && tab === "attack" ? "selected" : ""}`}
                onClick={() => {
                  setTarget(p.id);
                  setTab("attack");
                  commandWorld("focus", p.id);
                }}
              >
                <span className="rival-crest" style={{ color: p.color }}>
                  <Castle size={22} />
                </span>
                <span className="rival-name">
                  <b>{p.name}</b>
                  <small>
                    {p.hp <= 0
                      ? "Deed revoked"
                      : p.bot
                        ? "Computer rival"
                        : p.plot === null
                          ? "Choosing a home"
                          : "Fellow Borg Meister"}
                  </small>
                  <span className="rival-health">
                    <i
                      style={{
                        width: `${(p.hp / p.maxHp) * 100}%`,
                        background: p.color,
                      }}
                    />
                  </span>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          <button className="how-to" onClick={() => setDialog("help")}>
            <HelpCircle size={15} /> How to play <ArrowUpRight size={13} />
          </button>
        </aside>
        <div className="center-world">
          {settling && mine.plot === null ? (
            <div className="location-plaque">
              <Footprints size={16} />
              <span>{CLEARINGS[selection].name}</span>
              <small>Tap a clearing to wander over</small>
            </div>
          ) : (
            !inLobby && (
              <div className="location-plaque subtle">
                <Flag size={14} />
                <span>
                  {tab === "attack" && selectedTarget
                    ? selectedTarget.castle
                    : mine.castle}
                </span>
                <small>
                  {tab === "attack"
                    ? "A tempting diplomatic opportunity"
                    : `Home of ${mine.name}`}
                </small>
              </div>
            )
          )}
          {battle && (
            <div
              className={`battle-banner ${battle.betrayed ? "betrayed" : ""}`}
            >
              <span>
                {battle.betrayed
                  ? "A CHANGE OF ALLEGIANCE"
                  : "NEIGHBOURLY DIPLOMACY"}
              </span>
              <strong>
                {battle.betrayed
                  ? "They liked the soup better."
                  : `${battle.damage > 0 ? `${battle.damage} damage` : "A most vicious ballad"}`}
              </strong>
              <p>
                {game.players.find((p) => p.id === battle.from)?.name} →{" "}
                {game.players.find((p) => p.id === battle.to)?.castle}
              </p>
              <button
                onClick={() => {
                  queue.current = [];
                  finishBattle();
                }}
              >
                Skip scene <ChevronRight size={13} />
              </button>
            </div>
          )}
          {game.phase === "finished" && (
            <div className="victory-panel framed">
              <Crown size={38} />
              <span>THE LAST CROWN STANDING</span>
              <h2>
                {game.winner === me
                  ? "A most dubious victory."
                  : "A glorious… learning experience."}
              </h2>
              <p>
                {game.players.find((p) => p.id === game.winner)?.name ??
                  "Nobody"}{" "}
                rules the Bramblelands.
              </p>
              <button
                className="gold-button"
                onClick={() => void roomAction("reset")}
              >
                Found a new shelter <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          {inLobby && (
            <div className="lobby-plaque framed">
              <Crown size={30} />
              <h2>The council is assembling.</h2>
              <p>
                Share realm <strong>{game.code}</strong> with your rivals. Every
                Borg Meister gets one castle.
              </p>
              <button
                className="gold-button"
                onClick={() => setDialog("online")}
              >
                Open the war room <Users size={16} />
              </button>
            </div>
          )}
          {!battle && (
            <div className="world-hint">
              <span>DRAG TO ORBIT</span>
              <i /> <span>PINCH OR SCROLL TO ZOOM</span>
            </div>
          )}
        </div>
        {!settling && !inLobby && (
          <button
            className="mobile-guests-toggle"
            aria-expanded={showMobileGuests}
            aria-controls="visitors-panel"
            onClick={() => setShowMobileGuests((v) => !v)}
          >
            {showMobileGuests ? <X size={17} /> : <Footprints size={17} />}
            {showMobileGuests
              ? "Close guests"
              : `Guests (${game.visitors.length})`}
          </button>
        )}
        <aside className="right-rail" id="visitors-panel">
          {settling ? (
            <section className="arrival-panel framed">
              <span className="chapter">
                CHAPTER I <i> / </i> A HARD LANDING
              </span>
              <h2>
                Every tyrant
                <br />
                starts somewhere.
              </h2>
              <p>
                You fell out of the sky. Your crown survived. Your dignity is
                still up there.
              </p>
              <div className="arrival-steps">
                <span className="done">
                  <Check size={14} />
                  Arrive somewhat dramatically
                </span>
                <span className={mine.plot === null ? "current" : "done"}>
                  <Footprints size={14} />
                  Wander to a clearing
                </span>
                <span>
                  <Tent size={14} />
                  Put a roof over your ambition
                </span>
              </div>
              <p className="small-note">
                One Borg Meister. One castle.
                <br />
                Start small. Become a problem.
              </p>
            </section>
          ) : (
            <section className="guest-panel framed">
              <div className="panel-heading">
                <span className="eyebrow">
                  <Footprints size={13} />
                  AT YOUR GATES
                </span>
                <span className="guest-number">
                  {game.visitors.length} wandering
                </span>
              </div>
              {visitor ? (
                <>
                  <button
                    className="featured-portrait"
                    onClick={() => setSelectedGuest(visitor)}
                    aria-label={`Meet ${visitor.name}`}
                  >
                    <Portrait guest={visitor} />
                    <span className="guest-type">
                      {GUESTS[visitor.kind].role}
                    </span>
                  </button>
                  <div className="guest-body">
                    <h2>{visitor.name}</h2>
                    <p className="guest-quote">
                      “{GUESTS[visitor.kind].quote}”
                    </p>
                    <div className="guest-perk">
                      <Sparkles size={14} />
                      <span>{GUESTS[visitor.kind].perk}</span>
                    </div>
                    <button
                      className="outline-button invite-button"
                      disabled={
                        !canAct || mine.gold < 70 || mine.guests.length >= 4
                      }
                      onClick={() =>
                        void send({ type: "recruit", guest: visitor.id })
                      }
                    >
                      Invite to court{" "}
                      <span>
                        <Coins size={14} />
                        70
                      </span>
                    </button>
                    <div className="guest-pagination">
                      <button
                        aria-label="Previous guest"
                        onClick={() =>
                          setVisitorIndex(
                            (i) =>
                              (i + game.visitors.length - 1) %
                              game.visitors.length,
                          )
                        }
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        {game.visitors.map((g, i) => (
                          <button
                            aria-label={`View ${g.name}`}
                            onClick={() => setVisitorIndex(i)}
                            className={
                              i === visitorIndex % game.visitors.length
                                ? "selected"
                                : ""
                            }
                            key={g.id}
                          />
                        ))}
                      </span>
                      <button
                        aria-label="Next guest"
                        onClick={() => setVisitorIndex((i) => i + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-visitors">
                  <Footprints size={30} />
                  <p>The road is quiet.</p>
                  <small>A new traveller may arrive next round.</small>
                </div>
              )}
            </section>
          )}
          <section className="whisper">
            <span>
              <ScrollText size={14} /> WORD ON THE COBBLESTONES
            </span>
            <p>
              {game.events[0]?.text ??
                "Several would-be rulers are considering a very small patch of land."}
            </p>
            <button
              aria-label="The chronicles"
              onClick={() => setDialog("chronicle")}
            >
              Read the chronicles <ChevronRight size={13} />
            </button>
          </section>
        </aside>
        <div className="camera-controls">
          <button aria-label="Zoom in" onClick={() => commandWorld("zoom-in")}>
            <Plus size={17} />
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => commandWorld("zoom-out")}
          >
            <Minus size={17} />
          </button>
          <span />
          <button
            aria-label="View whole realm"
            onClick={() => commandWorld("realm")}
          >
            <Compass size={19} />
          </button>
          <button
            aria-label="Return to your stronghold"
            onClick={() => commandWorld("home")}
          >
            <Home size={17} />
          </button>
        </div>
      </div>
      <section
        className={`command-dock ${settling ? "settling-dock" : ""}`}
        aria-label="Royal orders"
      >
        <div className="dock-top">
          <div className="turn-info">
            <span className="turn-medallion">
              {settling ? <Tent size={20} /> : <Crown size={20} />}
            </span>
            <div>
              <span>
                {settling
                  ? "THE BEGINNING"
                  : inLobby
                    ? "THE WAR ROOM"
                    : `ROUND ${String(game.round).padStart(2, "0")}`}
                <i> / </i>
                {settling
                  ? "FIND YOUR FOOTING"
                  : myTurn
                    ? "YOUR TURN"
                    : game.phase === "finished"
                      ? "THE END"
                      : "THEIR TURN"}
              </span>
              <b>{orderStatus}</b>
            </div>
            {myTurn && (
              <div
                className="order-pips"
                aria-label={`${mine.orders} of 3 orders remaining`}
              >
                {[0, 1, 2].map((i) => (
                  <span className={i < mine.orders ? "filled" : ""} key={i} />
                ))}
              </div>
            )}
          </div>
          {!settling && !inLobby && (
            <Tabs value={tab} onValueChange={setTab} className="dock-tabs">
              <TabsList>
                <TabsTrigger value="build">
                  <Hammer size={15} />
                  Build & improve
                </TabsTrigger>
                <TabsTrigger value="weapons">
                  <Crosshair size={15} />
                  Siege engines
                </TabsTrigger>
                <TabsTrigger value="attack">
                  <Swords size={15} />
                  Make trouble
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <div className="turn-action">
            {game.mode === "online" && game.phase === "playing" && (
              <span className={`turn-clock ${seconds < 20 ? "urgent" : ""}`}>
                {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </span>
            )}
            {settling ? (
              <button
                className="gold-button"
                disabled={mine.plot !== null || busy}
                onClick={() => void send({ type: "settle", plot: selection })}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Flag size={16} />
                )}{" "}
                {mine.plot !== null ? "Shelter founded" : "Settle here"}
              </button>
            ) : inLobby ? (
              <button
                className="gold-button"
                onClick={() => setDialog("online")}
              >
                Gather the rulers <Users size={16} />
              </button>
            ) : (
              <button
                className="gold-button end-turn"
                disabled={!myTurn || busy || !!battle}
                onClick={() => void send({ type: "end" })}
              >
                {busy ? <LoaderCircle className="spin" size={16} /> : null}End
                turn <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="dock-body">
          {settling ? (
            <div className="clearing-options">
              {CLEARINGS.map((c, i) => {
                const Icon = i === 0 ? Sun : i === 1 ? Mountain : Trees;
                return (
                  <button
                    className={`clearing-card ${selection === i ? "selected" : ""}`}
                    key={c.name}
                    disabled={mine.plot !== null}
                    onClick={() => {
                      setSelection(i);
                      commandWorld("home");
                    }}
                  >
                    <span className="clearing-icon">
                      <Icon size={28} />
                    </span>
                    <div>
                      <span className="card-overline">CLEARING 0{i + 1}</span>
                      <h3>{c.name}</h3>
                      <p>{c.detail}</p>
                    </div>
                    <span className="selection-mark">
                      {selection === i ? <Check size={14} /> : i + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : inLobby ? (
            <div className="lobby-dock">
              <p>
                <Users size={22} />
                2–4 Borg Meisters. One castle each. Every friendship optional.
              </p>
              <button className="outline-button" onClick={copyInvite}>
                {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                {copied ? "Invite copied" : "Copy realm invitation"}
              </button>
            </div>
          ) : tab === "build" ? (
            <div className="build-grid">
              {(Object.keys(BUILDINGS) as Building[]).map((b) => {
                const Icon = BUILD_ICONS[b],
                  level = mine.buildings[b],
                  cost = buildCost(mine, b);
                return (
                  <button
                    className={`build-card ${level === 3 ? "maxed" : ""}`}
                    key={b}
                    disabled={!canAct || level >= 3 || !canAfford(mine, cost)}
                    title={BUILDINGS[b].detail}
                    onClick={() => void send({ type: "build", building: b })}
                  >
                    <span className="build-art">
                      <Icon size={36} strokeWidth={1.25} />
                      <span>
                        {[0, 1, 2].map((i) => (
                          <i className={i < level ? "lit" : ""} key={i} />
                        ))}
                      </span>
                    </span>
                    <span className="build-content">
                      <span className="card-overline">
                        {level === 3
                          ? "FULLY IMPROVED"
                          : level === 0
                            ? "BUILD"
                            : `UPGRADE TO LVL ${level + 1}`}
                      </span>
                      <h3>{buildName(b, level)}</h3>
                      <p>{BUILDINGS[b].blurb}</p>
                      {level === 3 ? (
                        <span className="max-label">
                          <Check size={13} />
                          Fit for a tyrant
                        </span>
                      ) : (
                        <Cost cost={cost} player={mine} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : tab === "weapons" ? (
            <div className="weapon-grid">
              {(Object.keys(WEAPONS) as Weapon[]).map((w) => {
                const Icon = WEAPON_ICONS[w],
                  level = mine.weapons[w],
                  cost = craftCost(mine, w),
                  locked =
                    mine.buildings.workshop <
                    (w === "arcane" || w === "goatapult" ? 2 : 1);
                return (
                  <button
                    className={`build-card ${w === "arcane" ? "arcane-card" : ""}`}
                    key={w}
                    disabled={
                      !canAct || level >= 3 || locked || !canAfford(mine, cost)
                    }
                    title={
                      locked
                        ? `Requires workshop level ${w === "arcane" || w === "goatapult" ? 2 : 1}`
                        : `${WEAPONS[w].damage + level * 22} base damage at next level`
                    }
                    onClick={() => void send({ type: "craft", weapon: w })}
                  >
                    <span className="build-art">
                      <Icon size={38} strokeWidth={1.2} />
                      <span>
                        {[0, 1, 2].map((i) => (
                          <i className={i < level ? "lit" : ""} key={i} />
                        ))}
                      </span>
                    </span>
                    <span className="build-content">
                      <span className="card-overline">
                        {locked
                          ? "WORKSHOP REQUIRED"
                          : level >= 3
                            ? "MASTERWORK"
                            : level
                              ? "UPGRADE"
                              : "CRAFT"}
                      </span>
                      <h3>{WEAPONS[w].name}</h3>
                      <p>{WEAPONS[w].blurb}</p>
                      <Cost cost={cost} player={mine} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="attack-dock">
              <div className="attack-target">
                <span className="card-overline">
                  RECIPIENT OF YOUR DISPLEASURE
                </span>
                <label htmlFor="target-select" className="sr-only">
                  Target castle
                </label>
                <select
                  id="target-select"
                  value={selectedTarget?.id ?? ""}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    commandWorld("focus", e.target.value);
                  }}
                >
                  {rivals
                    .filter((p) => p.hp > 0)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.castle} · {p.name}
                      </option>
                    ))}
                </select>
                <small>
                  {selectedTarget
                    ? `${selectedTarget.hp} health · ${selectedTarget.buildings.walls * 8} armour${selectedTarget.exposed ? " · secrets exposed" : ""}`
                    : "No standing rivals"}
                </small>
              </div>
              <div className="attack-weapons">
                {(Object.keys(WEAPONS) as Weapon[]).map((w) => {
                  const Icon = WEAPON_ICONS[w];
                  return (
                    <button
                      className={weapon === w ? "selected" : ""}
                      disabled={!mine.weapons[w]}
                      title={
                        !mine.weapons[w]
                          ? "Craft this in Siege engines"
                          : WEAPONS[w].name
                      }
                      key={w}
                      onClick={() => setWeapon(w)}
                    >
                      <Icon size={21} />
                      <span>{WEAPONS[w].name}</span>
                      <small>
                        {mine.weapons[w]
                          ? `LVL ${mine.weapons[w]}`
                          : "Not built"}
                      </small>
                    </button>
                  );
                })}
              </div>
              <div className="launch-block">
                <span>
                  {selectedTarget && mine.weapons[weapon]
                    ? siegeDamage(game, mine, selectedTarget, weapon)
                    : "—"}{" "}
                  <small>damage</small>
                </span>
                <button
                  className="gold-button launch-button"
                  disabled={
                    !canAct ||
                    !selectedTarget ||
                    !mine.weapons[weapon] ||
                    mine.shots >= 1 ||
                    !canAfford(mine, WEAPONS[weapon].ammo)
                  }
                  onClick={() =>
                    selectedTarget &&
                    void send({
                      type: "attack",
                      weapon,
                      target: selectedTarget.id,
                    })
                  }
                >
                  <Swords size={16} />
                  {mine.shots >= 1 ? "Crews reloading" : "Send your regards"}
                </button>
                <Cost cost={WEAPONS[weapon].ammo} player={mine} />
              </div>
            </div>
          )}
        </div>
        <footer className="dock-footer">
          <span>
            <i className={connected ? "connected" : ""} />
            {loadError
              ? "Messenger disconnected — reconnecting"
              : game.mode === "online"
                ? `${game.players.filter((p) => !p.bot).length} players · cloud saved`
                : signedIn
                  ? "Practice battle · cloud saved"
                  : "Practice battle · progress lasts this visit"}
          </span>
          <span className="footer-flavour">
            {settling
              ? "“A kingdom is just a campsite with delusions of grandeur.”"
              : "“Diplomacy is the art of saying nice things while loading the trebuchet.”"}
          </span>
          <button onClick={() => setDialog("help")}>
            <HelpCircle size={13} />
            How to play
          </button>
        </footer>
      </section>
      {loadError && (
        <div className="connection-alert" role="alert">
          <TriangleAlert size={16} />
          {loadError}
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setOnlineError("");
          }
        }}
      >
        <DialogContent
          className={`royal-dialog ${dialog === "court" || dialog === "chronicle" || dialog === "help" ? "wide-dialog" : ""} ${dialog === "help" ? "guide-dialog" : ""}`}
        >
          <DialogTitle className="dialog-title">
            {dialog === "online"
              ? "The war room"
              : dialog === "court"
                ? "Your questionable court"
                : dialog === "chronicle"
                  ? "The chronicles"
                  : dialog === "settings"
                    ? "The royal preferences"
                    : dialog === "leave"
                      ? "Abandon your claim?"
                      : "A Borg Meister’s field guide"}
          </DialogTitle>
          <DialogDescription className="dialog-description">
            {dialog === "online"
              ? "Friends make excellent neighbours. Until they build a trebuchet."
              : dialog === "court"
                ? "Keep them comfortable. Or send them somewhere uncomfortable."
                : dialog === "chronicle"
                  ? "An entirely unbiased record of your very reasonable decisions."
                  : dialog === "settings"
                    ? "Arrange the kingdom to your liking."
                    : dialog === "leave"
                      ? "Your current castle will be surrendered. This cannot be undone."
                      : "One castle. Three orders per turn. A kingdom full of possibilities."}
          </DialogDescription>
          {dialog === "online" && (
            <div className="online-content">
              {!signedIn ? (
                <>
                  <div className="online-intro">
                    <Globe2 size={32} />
                    <h3>Claim a castle of your own.</h3>
                    <p>
                      Sign in to save your stronghold and play live, turn by
                      turn, with up to three friends. Practice is always
                      available without an account.
                    </p>
                  </div>
                  <a
                    className="gold-button"
                    target="_top"
                    href={
                      "/signin-with-chatgpt?return_to=" +
                      encodeURIComponent(roomCode ? `/?join=${roomCode}` : "/")
                    }
                  >
                    Sign in with ChatGPT <ArrowUpRight size={16} />
                  </a>
                </>
              ) : game.mode === "online" ? (
                <>
                  <div className="realm-code">
                    <span>YOUR REALM CODE</span>
                    <strong>{game.code}</strong>
                    <button className="outline-button" onClick={copyInvite}>
                      {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                      {copied ? "Invitation copied" : "Copy invitation link"}
                    </button>
                  </div>
                  <div className="lobby-players">
                    {game.players.map((p, i) => (
                      <div key={p.id}>
                        <Crown size={19} style={{ color: p.color }} />
                        <span>
                          {p.name}
                          <small>
                            {i === 0
                              ? "HOST"
                              : p.bot
                                ? "COMPUTER"
                                : "BORG MEISTER"}
                          </small>
                        </span>
                        <Check size={16} />
                      </div>
                    ))}
                    {Array.from(
                      { length: Math.max(0, 4 - game.players.length) },
                      (_, i) => (
                        <div className="empty-seat" key={i}>
                          <Plus size={18} />
                          <span>
                            An unclaimed crown
                            <small>SHARE THE REALM CODE</small>
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                  {game.phase === "lobby" && game.players[0].id === me ? (
                    <div className="online-buttons">
                      <button
                        className="gold-button"
                        disabled={busy || game.players.length < 2}
                        onClick={() => {
                          void send({ type: "start" });
                          setDialog(null);
                        }}
                      >
                        Let the skyfall begin <Flag size={16} />
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          void send({ type: "start-bots" });
                          setDialog(null);
                        }}
                      >
                        Fill empty seats with computer rivals
                      </button>
                    </div>
                  ) : (
                    <p className="small-note">
                      {game.phase === "lobby"
                        ? "Waiting for the host to begin."
                        : "The realm is underway. Close this council to return to play."}
                    </p>
                  )}
                  <button
                    className="text-button danger"
                    onClick={() => setDialog("leave")}
                  >
                    <LogOut size={14} />
                    Leave this realm
                  </button>
                </>
              ) : (
                <>
                  <label className="field-label" htmlFor="ruler-name">
                    YOUR BORG MEISTER’S NAME
                  </label>
                  <input
                    className="royal-input"
                    id="ruler-name"
                    maxLength={24}
                    placeholder="e.g. Baron of Bad Decisions"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <div className="online-options">
                    <div>
                      <Crown size={23} />
                      <h3>Found a new realm</h3>
                      <p>
                        Invite up to three rivals. Choose your land together.
                      </p>
                      <button
                        className="gold-button"
                        disabled={busy}
                        onClick={() => void roomAction("create")}
                      >
                        Create realm <Plus size={16} />
                      </button>
                    </div>
                    <div>
                      <Mail size={23} />
                      <h3>Answer an invitation</h3>
                      <label className="sr-only" htmlFor="realm-code">
                        Six-character realm code
                      </label>
                      <input
                        id="realm-code"
                        className="royal-input code-input"
                        placeholder="REALM CODE"
                        maxLength={6}
                        value={roomCode}
                        onChange={(e) =>
                          setRoomCode(
                            e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z2-9]/g, ""),
                          )
                        }
                      />
                      <button
                        className="outline-button"
                        disabled={busy || roomCode.length !== 6}
                        onClick={() => void roomAction("join")}
                      >
                        Join realm <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )}
              {onlineError && (
                <p className="form-error" role="alert">
                  {onlineError}
                </p>
              )}
            </div>
          )}
          {dialog === "court" && (
            <>
              <div className="court-toolbar">
                <span>
                  <Heart size={15} />
                  {mine.morale}% morale
                </span>
                <button
                  className="outline-button"
                  disabled={!canAct || mine.gold < 45}
                  onClick={() => void send({ type: "feast" })}
                >
                  <Wine size={16} />
                  Hold a feast <Coins size={13} />
                  45
                </button>
              </div>
              <div className="court-grid">
                {mine.guests.length ? (
                  mine.guests.map((g) => (
                    <button
                      className="court-card"
                      key={g.id}
                      onClick={() => setSelectedGuest(g)}
                    >
                      <Portrait guest={g} />
                      <div>
                        <span className="card-overline">
                          {GUESTS[g.kind].role}
                        </span>
                        <h3>{g.name}</h3>
                        <p>{GUESTS[g.kind].perk}</p>
                        <div className="loyalty">
                          <Heart size={13} />
                          {g.loyalty}% loyal
                          <span>
                            {betrayalRisk(mine, g, selectedTarget)}% defection
                            risk
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="empty-court">
                    <Users size={36} />
                    <h3>A court of precisely one.</h3>
                    <p>
                      Invite a wandering guest at your gates for 70 gold and one
                      order. Residents help every turn. Quests can help… the
                      other side.
                    </p>
                  </div>
                )}
              </div>
              <div className="court-note">
                <Wine size={18} />
                <p>
                  A feast raises loyalty by 18. A tavern adds 6 per level each
                  turn. Sending guests on quests costs 16 loyalty. Charming
                  rival taverns increase the temptation to defect.
                </p>
              </div>
            </>
          )}
          {dialog === "chronicle" && (
            <div className="chronicle-list">
              {game.events.map((e) => (
                <div className={`chronicle-event ${e.kind}`} key={e.id}>
                  <span>
                    {e.kind === "battle" ? (
                      <Swords size={17} />
                    ) : e.kind === "guest" ? (
                      <Users size={17} />
                    ) : e.kind === "build" ? (
                      <Hammer size={17} />
                    ) : (
                      <ScrollText size={17} />
                    )}
                  </span>
                  <div>
                    <small>
                      ROUND {e.round} · {e.kind.toUpperCase()}
                    </small>
                    <p>{e.text}</p>
                  </div>
                  {e.battle && (
                    <button
                      className="icon-button"
                      aria-label="Replay this siege"
                      onClick={() => {
                        setDialog(null);
                        const b = { ...e.battle!, id: crypto.randomUUID() };
                        battleRef.current = b;
                        setBattle(b);
                      }}
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {dialog === "settings" && (
            <div className="settings-content">
              <div>
                <span>
                  <Volume2 size={18} />
                  Sound effects
                  <small>Subtle clicks, launches and impacts.</small>
                </span>
                <button className="outline-button" onClick={toggleSound}>
                  {soundOn ? "On" : "Off"}
                </button>
              </div>
              <div>
                <span>
                  <Sparkles size={18} />
                  Graphics quality
                  <small>Lower shadows for smaller devices.</small>
                </span>
                <button
                  className="outline-button"
                  onClick={() => {
                    const next = quality === "high" ? "low" : "high";
                    setQuality(next);
                    try {
                      localStorage.setItem("castle-quality", next);
                    } catch {
                      /* Optional preference. */
                    }
                  }}
                >
                  {quality === "high" ? "High" : "Performance"}
                </button>
              </div>
              <div>
                <span>
                  <Globe2 size={18} />
                  Game mode
                  <small>
                    {game.mode === "online"
                      ? "Live multiplayer realm"
                      : "Practice against computer rivals"}
                  </small>
                </span>
                <button
                  className="outline-button"
                  onClick={() => setDialog("online")}
                >
                  War room
                </button>
              </div>
              <div>
                <span>
                  <Hammer size={18} />
                  Emergency repairs
                  <small>Restore 120 health. Uses one order.</small>
                </span>
                <button
                  className="outline-button"
                  disabled={
                    !canAct ||
                    mine.hp >= mine.maxHp ||
                    mine.gold < 30 ||
                    mine.stone < 30
                  }
                  onClick={() => void send({ type: "repair" })}
                >
                  30 gold + 30 stone
                </button>
              </div>
              {game.mode === "practice" || game.phase === "finished" ? (
                <button
                  className="text-button"
                  onClick={() => void roomAction("reset")}
                >
                  <RotateCcw size={15} />
                  Begin a fresh practice realm
                </button>
              ) : (
                <button
                  className="text-button danger"
                  onClick={() => setDialog("leave")}
                >
                  Leave current realm
                </button>
              )}
              {reduced && (
                <p className="small-note">
                  Reduced motion is enabled. Siege replays are skipped
                  automatically.
                </p>
              )}
              {onlineError && <p className="form-error">{onlineError}</p>}
            </div>
          )}
          {dialog === "leave" && (
            <div className="leave-content">
              <p>
                The other rulers will continue without you. You will return to a
                fresh practice realm with a new Borg Meister.
              </p>
              <div>
                <button
                  className="outline-button"
                  onClick={() => setDialog("online")}
                >
                  Keep my crown
                </button>
                <button
                  className="gold-button"
                  disabled={busy}
                  onClick={() => void roomAction("leave")}
                >
                  Surrender and leave
                </button>
              </div>
              {onlineError && <p className="form-error">{onlineError}</p>}
            </div>
          )}
          {dialog === "help" && <PlayerGuide />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!chosenGuest}
        onOpenChange={(v) => {
          if (!v) setSelectedGuest(null);
        }}
      >
        <DialogContent className="royal-dialog guest-dialog">
          {chosenGuest && (
            <>
              <div className="guest-detail-top">
                <Portrait guest={chosenGuest} />
                <div>
                  <span className="eyebrow">
                    {GUESTS[chosenGuest.kind].role}
                  </span>
                  <DialogTitle className="dialog-title">
                    {chosenGuest.name}
                  </DialogTitle>
                  <DialogDescription className="dialog-description">
                    “{GUESTS[chosenGuest.kind].quote}”
                  </DialogDescription>
                </div>
              </div>
              <div className="guest-abilities">
                <div>
                  <Home size={18} />
                  <span>
                    <b>Keep at your castle</b>
                    {GUESTS[chosenGuest.kind].perk}
                  </span>
                </div>
                <div>
                  <Swords size={18} />
                  <span>
                    <b>Send on a quest</b>
                    {GUESTS[chosenGuest.kind].quest}
                  </span>
                </div>
              </div>
              {mine.guests.some((g) => g.id === chosenGuest.id) ? (
                <>
                  <div className="guest-loyalty">
                    <span>
                      <Heart size={17} />
                      {chosenGuest.loyalty}% loyal
                    </span>
                    <span>
                      <TriangleAlert size={16} />
                      {betrayalRisk(mine, chosenGuest, selectedTarget)}% chance
                      of defection
                    </span>
                  </div>
                  <label className="field-label" htmlFor="quest-target">
                    QUEST DESTINATION
                  </label>
                  <select
                    id="quest-target"
                    className="royal-input"
                    value={selectedTarget?.id ?? ""}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    {rivals
                      .filter((p) => p.hp > 0)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.castle}
                        </option>
                      ))}
                  </select>
                  <button
                    className="gold-button"
                    disabled={!canAct || !selectedTarget}
                    onClick={() =>
                      selectedTarget &&
                      void send({
                        type: "quest",
                        guest: chosenGuest.id,
                        target: selectedTarget.id,
                      })
                    }
                  >
                    Send on a highly reasonable quest <ArrowUpRight size={16} />
                  </button>
                  <p className="small-note">
                    Uses one order and 16 loyalty. Defectors reveal your weak
                    points for two of your turns.
                  </p>
                </>
              ) : (
                <button
                  className="gold-button"
                  disabled={
                    !canAct || mine.gold < 70 || mine.guests.length >= 4
                  }
                  onClick={() =>
                    void send({ type: "recruit", guest: chosenGuest.id })
                  }
                >
                  Invite to court <Coins size={16} />
                  70
                </button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
