# PackPal prototype

**PackPal is an audio-first helper by the front door that guides an adult with IDD through packing the night before, one item at a time, adapts to rain and plan changes with staff-approved alternatives, and ends with a short door check.**

This is a browser demo that runs the whole leaving routine end to end, so the dialogue can be tested and a **rules-only** interpreter can be compared with a **GenAI** interpreter. It uses fake persona data only (Sam and Rina; Jo and Marcus as a second persona).

> Screenshots / demo video: _add links here before submitting._

## Run it

Requires Node 18+.

```bash
npm install
npm run dev
```

Open http://localhost:5173. Rules-only mode works with no API key and no server setup.

```bash
npm test
```

runs the state machine and interpreter unit tests (Vitest).

### Add the API key (GenAI mode only)

```bash
cp .env.example .env
```

Put your key in `.env` as `ANTHROPIC_API_KEY=...` and restart `npm run dev`. The key is read only by the Node server (`server/intent.ts`) and never reaches the browser. `.env` is in `.gitignore`; never commit it.

### Switch modes

Use the **Rules-only / GenAI interpreter** toggle in the top bar. The mode only changes how a spoken or typed reply becomes an intent. Buttons and keyboard shortcuts always work the same way in both modes.

### Supported browsers

- **Chrome or Edge** (desktop) for speech recognition and speech output.
- Safari and Firefox: speech output and buttons work; speech recognition may be missing. Use the **typed reply** box as the stand-in for speech.

## Running the demo (Sam's swimming day)

1. In the **Demo controls** bar (it simulates the world, so it sits outside both screens), leave **Rain forecast** on, then press **Evening chime**.
2. PackPal: “Tomorrow is swimming. Let's get ready. Now or later?” Press **Got it**.
3. Bag → Got it. Towel → Got it. “Rain tomorrow. Find your umbrella. Got it?” → **No**.
4. “Left for raincoat. Right for hoodie. Or ask Rina.” The circle and square light up (their labels never change, like physical buttons). Press the **left circle** for raincoat.
5. “Raincoat. Okay?” → Got it. “Bag, towel, raincoat. All ready.” → Got it.
6. Press **Next morning** in the demo controls. With nothing changed it goes straight to the door check: everything in your bag? → keys → “Have fun at swimming.”

Try also: turn on **Plan change** before simulating the morning; press **Help** at any step; answer **No** to the keys question; type replies such as “the coat one”, “not now” or “uh huh” in each mode.

### Keyboard shortcuts (testing and switch access)

| Button | Keys |
|---|---|
| Got it (green) | `G` or `1` |
| No (grey) | `N` or `2` |
| Help (blue) | `H` or `3` |
| Left circle | `←`, `L` or `4` |
| Right square | `→`, `R` or `5` |

## How it works

- **State machine** (`src/machine/machine.ts`) is the only place that decides what PackPal says next. States: `START, ITEM, CHOICE, CONFIRM, RECAP, MORNING, DOOR_EMPTY, DOOR_KEYS, DONE, ALERT` (plus `IDLE` and `NIGHT_DONE` for the waits between them). Each state lists the intents it accepts; anything else is “unknown”.
- **Prompts** (`src/machine/prompts.ts`): every PackPal line in one file, 10 words or fewer, the same wording every time. The Setup tab warns when a staff-entered item name would push a line over 10 words.
- **Unclear replies**: repeat the same prompt once, then “Press a button.”, then alert staff (“I'll get Rina.”).
- **Interpreters** (`src/intent/`):
  - Rules-only: a fixed phrase list (`rules.ts`), longest phrase wins.
  - GenAI: `POST /api/intent` → `server/intent.ts` → Claude (`claude-haiku-5-5`, structured JSON output, 3 s timeout, no retries). The model only returns `{ intent, confidence }`. It never speaks, picks items or suggests alternatives.
  - A disallowed intent, confidence below the threshold (0.7 by default, adjustable), invalid JSON, a timeout or a network error all count as unknown.
- **Speech** (`src/speech/speech.ts`): Web Speech API. The listening window is 8 s by default (5 to 15 s on the Staff screen) and restarts after silence instead of closing early. No audio is stored.
- **User screen**: a scene that turns from evening to morning (with rain when it is forecast), a speaker whose light ring shows speaking, listening, alert or done, a caption bubble, a packing progress track, and five physical-style buttons.
- **Demo controls**: rain forecast, plan change, evening chime, next morning and reset. They simulate the world, so they sit outside the User and Staff screens.
- **Staff screen**: setup (activity, times, ordered items and alternatives, rain item, safety cases), voice and listening settings, alerts with “Handled, resume”, and summaries. Summaries appear only when the user turns on **Send my summary to Rina** on the User screen. It is off by default.
- **Event log** (Staff → Log & evaluation): every turn records prompt, reply, input type, intent, confidence, path, result and time. Export it as CSV. The log is stored only in this browser's localStorage.

### Evaluation

**Staff → Log & evaluation → Scripted test set** runs `config/testset.json` (108 short replies across 7 states, including off-script ones) through the interpreter in either mode and logs each result. The comparison table shows, per mode:

- failed exchanges
- times the button fallback was reached
- turns per packed item
- wrong intents accepted, reported separately because a wrong “got it” is worse than a repeat

Rules-only baseline on the current set: 72/108 correct, 0 wrong accepted.

## Repo structure

```
config/sam.json, jo.json   personas: activity, items, alternatives, safety cases
config/testset.json        scripted replies for the mode comparison
src/machine/               states, prompts, transitions, unit tests
src/speech/                speak(), listen(), chime
src/intent/                rules matcher, GenAI client with fallback, tests
src/screens/               UserScreen, StaffScreen, LogPanel
src/log/                   event log, stats, CSV export
server/intent.ts           POST /api/intent, calls Claude
server/plugin.ts           mounts the route on the Vite dev/preview server
docs/                      PRD link, test script, AI build transcript
```

## How this was built

The prototype was built with Claude Code. The full conversation, from the PRD to the published repo, is in [docs/ai-transcript.md](docs/ai-transcript.md).

## Known limits

- **Not tested with users with IDD.** Classmate walkthroughs are a pilot of the dialogue only, not evidence of benefit.
- **Browser speech recognition is not tuned for IDD speech** and is weak on short or unclear replies. The GenAI interpreter helps with off-script wording (“the coat one”) but cannot fix misheard speech. The buttons are always the guaranteed path.
- Speech recognition works well only in Chrome and Edge.
- Weather, plan changes and “tomorrow morning” are mocked. There is no real hardware, calendar or transport data.
- The PRD asks for temperature 0. Claude Haiku 5.5 does not accept a non-default temperature, so the request leaves it at the default and relies on structured output plus the confidence threshold instead.
