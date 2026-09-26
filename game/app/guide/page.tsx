import Link from "next/link";
import type { Metadata } from "next";
import { Castle, ArrowLeft } from "lucide-react";
import PlayerGuide from "@/components/player-guide";

export const metadata: Metadata = {
  title: "How to play — Castle Chaos",
  description:
    "The Borg Meister’s field guide: your first turn, touch controls, siege weapons, questionable guests and multiplayer rules.",
};

export default function GuidePage() {
  return (
    <main className="guide-page">
      <div className="guide-page-inner">
        <Link className="guide-back" href="/">
          <ArrowLeft size={18} /> Play Castle Chaos
        </Link>
        <header>
          <Castle size={36} />
          <span className="eyebrow">CASTLE CHAOS · HOW TO PLAY</span>
          <h1>A Borg Meister’s field guide</h1>
          <p>
            One castle. Three orders per turn. A kingdom full of possibilities.
          </p>
        </header>
        <PlayerGuide />
      </div>
    </main>
  );
}
