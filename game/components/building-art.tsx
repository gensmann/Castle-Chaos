import type { Building, Weapon } from "@/lib/game";

/** Small illustrated miniatures stay sharp at every HUD scale, without image requests. */
export default function BuildingArt({
  kind,
  level = 0,
}: {
  kind: Building | Weapon;
  level?: number;
}) {
  if (["keep", "tavern", "workshop"].includes(kind)) {
    const column =
      kind === "keep" ? (level > 0 ? 3 : 0) : kind === "workshop" ? 1 : 2;
    return (
      <span
        aria-hidden="true"
        className="building-miniature village-miniature"
        style={{ backgroundPosition: `${(column * 100) / 3}% 100%` }}
      />
    );
  }
  return (
    <svg
      className="building-miniature"
      viewBox="0 0 96 88"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="48" cy="75" rx="38" ry="9" fill="#071713" opacity=".45" />
      <path d="M8 67 47 52 88 66 48 82Z" fill="#607b59" />
      <path d="M8 67 48 82 88 66 88 71 48 87 8 72Z" fill="#344b3d" />
      {kind === "walls" ? (
        <>
          <path d="M19 34 39 29 77 43 77 67 39 78 19 65Z" fill="#acb3a0" />
          <path d="M39 43 77 43 77 67 39 78Z" fill="#7a8d82" />
          <path
            d="M17 23 27 20 27 30 34 28 34 18 44 15 44 39 17 47Z"
            fill="#d5d4b9"
          />
          <path
            d="M42 34 52 37 52 45 60 47 60 39 69 42 69 50 77 52 77 44 85 47 85 61 42 49Z"
            fill="#c1c6ad"
          />
          <path d="M48 73V60Q48 47 61 52Q68 55 68 64V69Z" fill="#283e34" />
          <path
            d="M23 52 36 48M23 61 36 57M72 57 80 60"
            stroke="#879384"
            strokeWidth="2"
          />
          <path d="M32 23V5" stroke="#e4c483" strokeWidth="2" />
          <path d="M33 5 50 9 44 13 33 12Z" fill="#cf866a" />
        </>
      ) : kind === "quarry" ? (
        <>
          <path d="M15 63 23 35 42 26 56 46 53 68 34 77Z" fill="#a9b6af" />
          <path d="M23 35 42 26 39 48 15 63Z" fill="#dae0ce" />
          <path d="M39 48 56 46 53 68 34 77Z" fill="#708980" />
          <path d="M49 64 60 39 76 42 85 69 68 77Z" fill="#96a79c" />
          <path d="M60 39 76 42 68 58 49 64Z" fill="#c5cbbb" />
          <path d="M37 62 67 23" stroke="#ac8051" strokeWidth="5" />
          <path d="M52 22Q69 18 79 35L65 29Z" fill="#c1c8b1" />
        </>
      ) : kind === "arcane" ? (
        <>
          <path d="M29 66 48 57 68 65 68 73 48 82 29 74Z" fill="#98a29d" />
          <path d="M33 63 48 56 63 62 48 70Z" fill="#d7d5c2" />
          <path d="M48 12 64 40 48 65 33 40Z" fill="#aa94e5" />
          <path d="M48 12V65L33 40Z" fill="#ded1ff" />
          <path d="M48 12 64 40 48 36Z" fill="#c5a8f8" />
          <ellipse
            cx="48"
            cy="43"
            rx="28"
            ry="9"
            stroke="#d8b96d"
            strokeWidth="2"
            transform="rotate(-22 48 43)"
          />
          <path
            d="M19 19v8m-4-4h8M75 34v8m-4-4h8"
            stroke="#f0dca2"
            strokeWidth="2"
          />
        </>
      ) : (
        <>
          <path
            d="M21 64 53 52 77 63 43 77Z"
            fill="#a47d50"
            stroke="#533f2d"
            strokeWidth="3"
          />
          <ellipse
            cx="27"
            cy="69"
            rx="7"
            ry="9"
            fill="#514c3c"
            stroke="#c2a573"
            strokeWidth="3"
          />
          <ellipse
            cx="67"
            cy="72"
            rx="7"
            ry="9"
            fill="#514c3c"
            stroke="#c2a573"
            strokeWidth="3"
          />
          <path
            d="M33 61 48 31 63 62M48 31V67"
            stroke="#c0a377"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path d="M26 48 69 18" stroke="#5a4931" strokeWidth="6" />
          <path d="M26 46 69 16" stroke="#d1b47e" strokeWidth="3" />
          <path d="M21 41 32 44 32 58 21 54Z" fill="#98a394" />
          {kind === "ballista" ? (
            <path
              d="M52 12Q79 18 79 40L52 12 73 26 79 40"
              stroke="#b89661"
              strokeWidth="3"
            />
          ) : (
            <path d="M63 17Q70 27 78 18" stroke="#d2bd92" strokeWidth="3" />
          )}
          {kind === "goatapult" && (
            <>
              <ellipse cx="72" cy="13" rx="9" ry="6" fill="#e5debc" />
              <path
                d="M76 10 80 3 83 9M65 16v6m10-5v5"
                stroke="#d4cda9"
                strokeWidth="2"
              />
            </>
          )}
        </>
      )}
      <path
        d="M15 71 18 64 20 72M78 76 81 70 83 75"
        stroke="#c3cc8b"
        strokeWidth="2"
      />
    </svg>
  );
}
