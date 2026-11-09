# CARTOGRAPHER

*What you draw becomes real.*

A one-handed, portrait roguelite for Android. You explore a world hidden in fog with a limited
supply of **ink**, and every line you draw with your finger becomes real terrain: a bridge over a
chasm, a river that stops monsters, a wall. A wrong line wastes ink and can trap you; a smart line
is a shortcut. Every minute the world **rewrites itself**, and your ink is the only thing that
stays.

- 10 procedurally generated floors + a boss floor (*The Devourer*, a giant eraser that eats the map)
- Fog of war with a burning-paper reveal; explored areas stay as a faded sketch
- 4 ink types, 16 between-floor upgrades, a meta-progression **Atlas** (pages, unlocks, outfits)
- Hand-drawn parchment look, procedural sound and haptics. There are **no image or audio assets**:
  everything is generated at runtime.
- Built with **Vite + vanilla JS (Canvas 2D)** and wrapped with **Capacitor 8** as a native Android app.
  It's locked to portrait, targets 60 FPS and works fully offline.

<p align="center">
  <img src="docs/beacon.jpg" width="200" alt="Floor start: the camera flies over the stairs, a beacon shining through the fog">
  <img src="docs/crossing.jpg" width="200" alt="A plank bridge over a river, a Smudge guarding the crossing">
  <img src="docs/rewrite.jpg" width="200" alt="A rewrite wave: the page crumples, ink runs, your own lines glow">
  <img src="docs/newink.jpg" width="200" alt="Blue ink handed over on floor 2">
</p>
<p align="center">
  <img src="docs/menu.jpg" width="200" alt="Main menu over a charted map">
  <img src="docs/drawing.jpg" width="200" alt="Drawing a bridge with the live ink-cost bubble">
  <img src="docs/floor.jpg" width="200" alt="Water, a bridge, fire, a Smudge and a Scribbler">
  <img src="docs/boss.jpg" width="200" alt="The Devourer boss floor">
</p>

---

## Controls (one hand)

| Gesture | Action |
|---|---|
| **Tap** | Walk there (A* pathfinding; routes around enemies you can see) |
| **Press, hold, then drag** | Draw with the selected ink. The stroke snaps to the tile grid and becomes terrain when you lift your finger |
| **Quick swipe** | Look around |
| **Two-finger pinch** | Zoom |
| **Undo button** | Cancels the last stroke within 2 s and refunds 50 % |

While drawing, a bubble above your finger shows the **ink cost** (1 per tile). It turns **red** when
you can't afford the stroke, and only the affordable part is drawn.

### Inks

| Ink | Effect | When you get it |
|---|---|---|
| **Black** | Path / bridge: walkable, crosses ravines, rivers and torn holes | always |
| **Blue** | Water: Smudges can't cross it, and it puts out fire | **floor 2** of every run (from floor 1 with *Early Blue*, 8 pages in the Atlas) |
| **Red** | Wall: blocks enemies, ink blots and you | **floor 3** of every run (from floor 1 with *Early Red*, 15 pages) |
| **Gold** (rare) | Burns away fog around each drop and charts the land around the stairs | Atlas, 35 pages |

A card introduces each new ink the first time you receive it.

### The world

Floors are **40 × 60 tiles**: ground, rock, ruins, ink pools (refill ink), chests and the stairs
down, cut by **barriers**. Every floor has 2 to 5 full-width ravines, rivers or **torn holes in the
page** between you and the stairs, plus a moat around the stairs. Each one has to be crossed with
ink, and the narrow crossing points are the reward for exploring. The minimum ink needed rises
from about 6 on floor 1 to about 18 on floor 10.

**Where to go:** at the start of each floor the camera flies over the stairs. A **golden beacon**
marks them through the fog, and a **compass needle** with the distance sits at the edge of the
screen. On the boss floor it points to the nearest unlit anchor.

**The rewrite wave:** every **60 s** (see the timer; the last 3 seconds tick) the page crumples,
ink runs down the screen and the world is redrawn:

- Every tile you **can't currently see** and **haven't inked** is regenerated, and fog rolls back
  over it.
- The wave picks the most hostile version of the world that is still beatable with the ink you
  hold.
- It **tears a rift across your route** just beyond your vision. The tear stays sketched on your
  map.
- Your ink glows during the wave: it's the only stable thing. An inked path punches straight
  through the tear.

So you have to choose between inking a route now to secure it and saving the ink.

### Enemies (no combat: avoid, block, trap)

- **Smudge**: chases on sight and can't cross water.
  - Smudges stand **guard on the far side of the crossings** you must bridge.
  - The **scratch of your pen** brings nearby ones running.
  - A touch **smears 8 ink** out of your inkwell. If you're too dry to pay, it costs a heart.
  - After touching you it backs off for a few seconds.
- **Eraser** (floor 2+): hunts your ink and rubs it out tile by tile. A bridge you stand on can
  vanish under you.
- **Scribbler** (floor 4+): scribbles walls across your path. From floor 7 it also flicks ink
  blots, which red walls block.
- **Fire** (floor 4+): starts in rewritten areas, spreads over dry ground and burns black ink.
  Blue ink puts it out.
- Every rewrite wave lets something new crawl out of the page.
- **The Devourer** (floor 11): light 3 anchors to unseal the stairs while it eats the map into
  chasm. Red walls stall it and water slows it.

**Trap tip:** draw a bridge, let a Smudge step onto it, and hit **Undo**. The Smudge falls.

You have **3 hearts for the whole run**. When you die you keep the **Pages** you found, and you
spend them in the Atlas.

---

## Build the APK on Windows

### 1. Install the tools (one time)

1. **Node.js 22 LTS or newer**: <https://nodejs.org>
2. **Android Studio** (latest stable): <https://developer.android.com/studio>
   - On first launch, let the setup wizard install the Android SDK.
   - Open *More Actions > SDK Manager* and make sure these are installed:
     - *SDK Platforms*: **Android 16 (API 36)**
     - *SDK Tools*: **Android SDK Build-Tools 36**, **Android SDK Platform-Tools**
3. Point your terminal at the SDK and at the JDK 21 that ships with Android Studio. In
   **PowerShell**:

   ```powershell
   setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
   setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
   ```

   Then **close and reopen** the terminal. Check that `java -version` reports version 21.

### 2. Build

```powershell
git clone https://github.com/noobiedoggie/CARTOGRAPHER.git
cd CARTOGRAPHER
npm install
npm run build
npx cap add android
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

`npx cap add android` creates the native project. A post-sync hook (`scripts/patch-android.mjs`)
then automatically:

- locks the app to portrait,
- sets the parchment launch theme and splash,
- generates the compass-rose launcher icons.

You only need `npx cap add android` once. After changing the game code, just run:

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

(On macOS/Linux use `./gradlew assembleDebug`. `npm run apk` does all three steps on macOS/Linux.)

### 3. Where the APK ends up

```
android\app\build\outputs\apk\debug\app-debug.apk
```

### 4. Install it on your phone

- **USB:** enable *Developer options > USB debugging* on the phone, plug it in, then run:

  ```powershell
  & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r app\build\outputs\apk\debug\app-debug.apk
  ```

- **Or** copy `app-debug.apk` to the phone and open it. You'll need to allow installing apps from
  that source.

### Troubleshooting

| Problem | Fix |
|---|---|
| `SDK location not found` | Create `android\local.properties` with `sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk` |
| `Unsupported class file major version` / Gradle won't start | `JAVA_HOME` must point to **JDK 21** (Android Studio's `jbr` folder) |
| `android platform already exists` | The project is already added. Skip `npx cap add android` and just `npx cap sync android` |
| Old icon or splash after an update | Run `npx cap sync android` again (it re-applies the patch), then rebuild |
| You can also open the project in Android Studio | `npx cap open android`, then *Build > Build APK(s)* |

---

## Develop and test in a browser

```bash
npm install
npm run dev        # http://localhost:5173 - mouse works too: hold+drag to draw, wheel to zoom
npm test           # unit + simulation tests (node:test)
npm run balance    # headless "skilled bot" plays full runs and reports the win rate
```

### Tests

- **Generator**: 440 floors (all floor types × 40 seeds) are validated. Each one has a reachable
  exit within its ink-cost band, a free ink pool, a solid border and, on the boss floor, reachable
  anchors. Every floor has at least 2 crossings and needs at least 5 ink (4+ crossings from
  floor 4).
- **Bot clears every floor**: a solver-guided bot plays floors 1–11 through the real game API
  (tap-to-walk and ink strokes).
- **Rewrite waves**: with a wave every 15 s, the bot still reaches the stairs. Player ink survives
  waves, and after a wave the exit is reachable with the ink in hand. Most waves tear the route,
  but inked ground is never torn.
- **Threat**: guards stand on the far bank of their crossing, and drawing alerts nearby Smudges.
- **Enemy soak**: 90 s of random play on every floor with all enemies, checking the core
  invariants.
- **Meta**: purchases, perks, upgrade rolls, run snapshots.

### Balance

`npm run balance` runs a bot (`tests/skilledBot.js`) that:

- knows the cheapest route,
- detours to ink pools when low,
- throws water or walls in front of chasing Smudges and backs off,
- springs the undo trap on Smudges that step onto a fresh bridge.

It plans poorly against Erasers and Scribblers. Current numbers:

| Setup | Bot win rate |
|---|---|
| No Atlas unlocks: blue on floor 2, red on floor 3 (150 runs) | **~22 %** |
| All Atlas inks (150 runs) | ~18 % |

Floors 1–3 cost almost no hearts. Runs mostly end between floors 6 and 10. A skilled human should
land around **1 win in 5**. All balance knobs live in [`src/config.js`](src/config.js).

---

## How it works

### Procedural floors (`src/world/generator.js`)

1. **Cellular automata** (4-5 rule) carve organic caves out of solid rock.
2. Meandering **rifts** (chasms or rivers) cut across the whole width, so the stairs can never be
   reached without ink. Their width varies, and finding a narrow crossing is the reward for
   exploring.
3. Lakes and ruins are added, and tiny pockets are filled in.
4. The start is placed near the bottom and the stairs near the top.
5. A **0-1 BFS solver** (`src/world/solver.js`) computes the exact minimum ink needed to reach
   the stairs. A floor is regenerated unless that cost falls inside a per-floor band. Too cheap
   and ink wouldn't matter; too expensive and the floor would be unfair.

### Rewrite waves (`src/game/rewrite.js`)

The wave builds 8 candidate worlds and keeps the first one in which the stairs are reachable
**with the ink you currently hold**. After the sweep it re-checks from your position. If needed,
it digs a passage through hidden rock or conjures a fresh ink pool, so a floor is never unwinnable.

### Rendering (`src/render/`)

- Terrain is drawn into cached 10×10-tile chunks that are re-rendered only when tiles change.
- The fog is a 4-pixels-per-tile RGBA bitmap, magnified with smoothing. The burning-paper reveal
  is a noise threshold that advances per tile.
- Parchment, grain, vignette, sprites and icons are all procedural.
- Adaptive quality drops the grain overlay, and then resolution, if a device can't hold 60 FPS.

---

## Project structure

```
index.html                 app shell (canvas + HUD/menu overlays)
capacitor.config.json      Capacitor 8 config (appId com.cartographer.game, immersive system bars)
vite.config.js
scripts/
  patch-android.mjs        post-sync hook: portrait lock, splash, generated launcher icons
  balance.mjs              headless balance harness
src/
  main.js                  app shell & roguelite loop (menu -> run -> upgrades -> summary)
  config.js                ALL balance numbers
  styles.css               parchment UI
  core/   rng · camera · input (tap / hold-drag / swipe / pinch) · audio (Web Audio) ·
          haptics (Capacitor Haptics) · storage (Capacitor Preferences) · events
  world/  tiles · world grid · generator · solver · A* pathfinding · vision
  game/   game (one floor) · player · ink strokes · enemies · hazards (fire) ·
          rewrite waves · boss floor · run state · upgrades · meta (Atlas)
  render/ renderer · terrain painter · ink painter · fog · sprites · effects · paper textures
  ui/     HUD · screens · tutorial · feedback (events -> particles/sound/haptics) · icons
tests/                     node:test suites + headless bot helpers
```

Saving uses **@capacitor/preferences** (SharedPreferences on Android, localStorage in the browser).
Meta progress is saved after every change. The current run is snapshotted at every floor start
and on every lost heart, so **Continue** resumes your expedition.
