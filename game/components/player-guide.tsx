import {
  Castle,
  Crown,
  Footprints,
  Hammer,
  Hand,
  Swords,
  Users,
} from "lucide-react";
import { CLEARINGS, GUESTS, WEAPONS } from "@/lib/game";

export default function PlayerGuide() {
  return (
    <div className="player-guide">
      <section className="guide-quickstart" aria-labelledby="guide-first-turn">
        <span className="eyebrow">
          <Crown size={15} /> YOUR FIRST THREE ORDERS
        </span>
        <h2 id="guide-first-turn">From falling monarch to local nuisance.</h2>
        <p>
          Start in practice against two computer rivals. No sign-in required.
        </p>
        <ol>
          <li>
            <strong>Pick your patch.</strong> Tap a clearing or its card to walk
            there, then choose <b>Settle here</b>. This founds your one and only
            shelter.
          </li>
          <li>
            <strong>Build a home and workshop.</strong> In{" "}
            <b>Build &amp; improve</b>, buy a <b>Timber Hall</b> and a{" "}
            <b>Siege Workshop</b>. Swipe the cards sideways to find more
            buildings.
          </li>
          <li>
            <strong>Prepare an impolite greeting.</strong> Open{" "}
            <b>Siege engines</b> and build a <b>Trebuchet</b>. Those three
            purchases fit your starting resources and use all three orders.
          </li>
          <li>
            <strong>End turn, then fire.</strong> Once your next turn begins,
            open <b>Make trouble</b>, select a rival and the Trebuchet, then
            press <b>Send your regards</b>. Keep your other two orders for
            improvements, repairs or guests.
          </li>
        </ol>
        <p className="guide-aside">
          You may fire one siege shot per turn, even if you own several weapons.
          The loading crew has a union.
        </p>
      </section>

      <details open>
        <summary>
          <Hand size={19} />
          <span>
            Moving &amp; looking around
            <small>Touch, mouse and the camera buttons</small>
          </span>
        </summary>
        <div className="guide-section">
          <dl className="guide-controls">
            <div>
              <dt>Walk before settling</dt>
              <dd>
                Tap a clearing in the world or one of the three clearing cards.
                Your Borg Meister walks to it. After settling, you command your
                castle; there is no free-roaming character mode.
              </dd>
            </div>
            <div>
              <dt>Explore the map</dt>
              <dd>
                Drag one finger across the isometric map. With a mouse, hold the
                left button and drag. The viewing angle stays fixed; arrow keys
                also move the map when it has keyboard focus.
              </dd>
            </div>
            <div>
              <dt>Zoom</dt>
              <dd>
                Pinch with two fingers, use the mouse wheel, or tap the <b>+</b>{" "}
                and <b>−</b> buttons.
              </dd>
            </div>
            <div>
              <dt>Find your way home</dt>
              <dd>
                The house button returns to your stronghold. The compass shows
                the whole realm.
              </dd>
            </div>
            <div>
              <dt>Use the menus</dt>
              <dd>
                Swipe building and weapon cards sideways. Scroll inside panels
                and this guide. On a phone, tap <b>Guests</b> to open or close
                the visitors panel. Portrait and landscape both work; landscape
                puts your orders beside the scene.
              </dd>
            </div>
          </dl>
        </div>
      </details>

      <details>
        <summary>
          <Footprints size={19} />
          <span>
            Choose your land<small>One Borg Meister. One castle.</small>
          </span>
        </summary>
        <div className="guide-section">
          <p>
            You fall from the sky onto your own starting land. Pick carefully:
            you cannot move your castle or found a second one.
          </p>
          <ul>
            {CLEARINGS.map((c) => (
              <li key={c.name}>
                <b>{c.name}:</b> {c.detail}
              </li>
            ))}
          </ul>
          <p>
            In multiplayer, everyone chooses before the first turn. After the
            settlement timer expires, absent rulers receive a clearing
            automatically.
          </p>
        </div>
      </details>

      <details>
        <summary>
          <Hammer size={19} />
          <span>
            Orders, resources &amp; building
            <small>Three decisions each turn</small>
          </span>
        </summary>
        <div className="guide-section">
          <p>
            Building, upgrading, firing, recruiting, sending a guest, feasting
            and repairing each use <b>one order</b>. Looking around and choosing
            a target are free. Prices are shown on each card: gold, timber and
            stone.
          </p>
          <p>
            <b>End turn</b> passes play to the next ruler. At the start of your
            next turn, your orders reset to three, your siege crew reloads, and
            you collect income. Unspent orders do not carry over. Base income is
            65 gold, 45 timber and 40 stone.
          </p>
          <ul>
            <li>
              <b>Timber Hall → Stone Keep → Grand Citadel:</b> each upgrade adds
              160 maximum and current health.
            </li>
            <li>
              <b>Ramparts:</b> each level reduces incoming siege damage by 8, or
              by 4 against a Hex Mortar.
            </li>
            <li>
              <b>Siege Workshop:</b> level 1 unlocks the Trebuchet and Ballista;
              level 2 unlocks the Goatapult and Hex Mortar. Higher levels
              improve siege damage.
            </li>
            <li>
              <b>Tavern:</b> each level adds 8 morale and 6 guest loyalty at the
              start of your turn, helping offset their natural decline.
            </li>
            <li>
              <b>Quarry:</b> each level adds 20 gold, 15 timber and 25 stone to
              your income.
            </li>
          </ul>
          <p>
            Buildings and weapons have three levels. Upgrades cost more. Open{" "}
            <b>Settings → Emergency repairs</b> to restore up to 120 health for
            30 gold, 30 stone and one order.
          </p>
        </div>
      </details>

      <details>
        <summary>
          <Swords size={19} />
          <span>
            Siege engines &amp; attacks
            <small>Explosions are a form of correspondence</small>
          </span>
        </summary>
        <div className="guide-section">
          <p>
            Build a workshop, craft a weapon, then use <b>Make trouble</b> to
            choose an enemy and fire. Each shot costs ammunition and one order.
            A castle can fire <b>once per turn</b>.
          </p>
          <ul>
            {Object.entries(WEAPONS).map(([key, w]) => (
              <li key={key}>
                <b>{w.name}:</b> {w.damage} base damage. {w.blurb}
              </li>
            ))}
          </ul>
          <p>
            The damage preview accounts for your upgrades, resident guests, the
            target’s ramparts and the weather. A tailwind helps Trebuchets and
            Goatapults; drizzle weakens them. Hex Mortars bypass half the
            ramparts’ protection.
          </p>
          <p>
            Attacks play out in the 3D world with flying masonry.{" "}
            <b>Skip scene</b> skips the replay; the damage has already been
            applied. Reduced motion in your device settings skips replays
            automatically.
          </p>
        </div>
      </details>

      <details>
        <summary>
          <Users size={19} />
          <span>
            Guests, quests &amp; betrayal
            <small>Hospitality with consequences</small>
          </span>
        </summary>
        <div className="guide-section">
          <p>
            Invite a traveller from <b>At your gates</b> for 70 gold and one
            order. Your court holds up to four guests. Tap their portrait in{" "}
            <b>My questionable court</b> to inspect their loyalty and choose a
            quest destination.
          </p>
          <div className="guide-guests">
            {Object.entries(GUESTS).map(([key, g]) => (
              <section key={key}>
                <h3>{g.title}</h3>
                <p>
                  <b>At home:</b> {g.perk}
                </p>
                <p>
                  <b>On a quest:</b> {g.quest}
                </p>
              </section>
            ))}
          </div>
          <p>
            A quest uses one order. The guest may defect instead: low loyalty,
            low morale and the enemy’s tavern increase the chance. Inspect the
            displayed risk before sending them. A defector joins the rival if
            there is room, and reveals your weak spots: incoming siege attacks
            gain 20 damage until the exposure expires.
          </p>
          <p>
            A successful quest costs loyalty too. A <b>feast</b> in your court
            costs 45 gold and one order, restoring 18 loyalty to each guest and
            22 morale. A tavern makes staying home more appealing.
          </p>
        </div>
      </details>

      <details>
        <summary>
          <Castle size={19} />
          <span>
            Play with friends &amp; win<small>2–4 rulers, taking turns</small>
          </span>
        </summary>
        <div className="guide-section">
          <ol>
            <li>
              Open <b>Play with friends</b> (the people icon on a phone) and
              sign in with ChatGPT.
            </li>
            <li>
              Create a realm in the war room and share its invitation or
              six-character code. Your friends sign in and join that realm.
            </li>
            <li>
              The host starts the match with 2–4 rulers, or fills the remaining
              places with computer rivals.
            </li>
            <li>
              Choose your land, then take turns. Online turns last 90 seconds;
              an absent ruler’s turn passes when the timer expires.
            </li>
          </ol>
          <p>
            <b>The last surviving castle wins.</b> If multiple castles survive
            through round 30, the highest score wins: remaining health + one
            quarter of your gold + 50 points per resident guest.
          </p>
          <p>
            Signed-in games save to the cloud. Anonymous practice lasts only for
            the current visit; reloading loses that practice game. You can only
            hold one active castle. Leaving a live realm surrenders it; starting
            a fresh practice realm replaces your practice progress.
          </p>
        </div>
      </details>

      <details>
        <summary>
          <Crown size={19} />
          <span>
            Something not responding?
            <small>A small royal troubleshooting department</small>
          </span>
        </summary>
        <div className="guide-section">
          <ul>
            <li>
              <b>A greyed-out order:</b> check that it is your turn, you have
              orders and resources left, and no attack replay is running.
            </li>
            <li>
              <b>A locked weapon:</b> build the required workshop level first.
              “Crews reloading” means you have already fired this turn.
            </li>
            <li>
              <b>A sluggish phone:</b> open the crown-shaped <b>Settings</b>{" "}
              button and select <b>Performance</b>. Touch devices use this mode
              by default; you can switch to High.
            </li>
            <li>
              <b>No sound:</b> enable sound in Settings and check your device
              volume.
            </li>
            <li>
              <b>Lost connection:</b> use Retry when the messenger warning
              appears. Check The chronicles before repeating an order. Online
              timers keep running while this guide is open.
            </li>
          </ul>
        </div>
      </details>
      <p className="guide-signoff">
        Rule wisely. Or at least leave an interesting crater.
      </p>
    </div>
  );
}
