# PackPal Prototype PRD

The full PRD, with the state machine and architecture diagrams, lives here:
https://claude.ai/artifact/RtFXdyTuk95MQdXqHUoJ6h

For the submission, export it (PDF or Markdown) and save it in this folder next to the storyboard.

## Requirement coverage

| ID | Requirement | Where |
|---|---|---|
| F1 | Activity with day, time, pickup time | Staff → Setup → Activity |
| F2 | Items per activity, fixed order | Staff → Setup → Items (↑ ↓ to reorder) |
| F3 | Ordered alternatives per item | Staff → Setup → Items / Rain item |
| F4 | Preparation time, safety cases | Staff → Setup |
| F5 | Summaries toggle owned by the user, default off | User screen → “Send my summary to …” |
| F6 | Rain, plan change, simulate tomorrow morning | Demo controls bar (outside both screens) |
| F7 | Chime and opening prompt at preparation time | Real-clock check every 15 s, or **Evening chime** in the demo controls |
| F8 | One item per turn; rain item added by rule | `nightItems()` in `src/machine/machine.ts` |
| F9 | First two alternatives on left and right, plus “or ask …” (prompt says which button is which; button labels never change) | `CHOICE` state |
| F10 | Repeat choice back; “no” re-offers | `CONFIRM` state |
| F11 | Recap of packed items | `RECAP` state |
| F12 | Five buttons; left and right lit only during a choice | `src/screens/UserScreen.tsx` |
| F13 | Keyboard shortcuts | G/N/H/←/→ and 1–5 |
| F14 | Morning message only if plan or forecast changed | `SIMULATE_MORNING` event |
| F15 | Door check: empty, keys, “Have fun at …” | `DOOR_EMPTY`, `DOOR_KEYS`, `DONE` |
| F16 | Help or safety case alerts staff | Staff → Alerts & summaries |
| F17 | Mock staff summary only when F5 is on | Staff → Alerts & summaries |
| F18 | Event log with CSV export | Staff → Log & evaluation |
| F19 | Mode toggle | Top bar |
| F20 | Second persona (P2) | Persona picker: Jo, work at the cafe |
