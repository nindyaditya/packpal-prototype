// The PackPal state machine. This is the ONLY place that decides what PackPal
// says next. Interpreters (rules or GenAI) only turn a reply into an intent.

import type { Intent, Item, Mock, Options, Persona, StateName } from '../types';
import { prompts } from './prompts';

export interface Ctx {
  state: StateName;
  phase: 'night' | 'morning';
  /** The items for this run, in fixed order (rain item added by rule). */
  items: Item[];
  index: number;
  /** What was actually packed (alternatives substituted). */
  packed: string[];
  /** Alternatives used, for the staff summary. */
  substitutions: { item: string; used: string }[];
  options: Options;
  pendingChoice?: string;
  /** The choice prompt, so a "no" at Repeat back re-offers the same words. */
  choicePrompt?: string;
  /** Unclear replies in the current prompt: 1 = repeated, 2 = "Press a button." */
  unknownCount: number;
  /** The prompt the user is answering right now (re-said on repeat / resume). */
  prompt: string;
  resumeState?: StateName;
  resumePrompt?: string;
  alertReason?: string;
  /** Forecast and plan as they were when packing started. */
  night?: Mock;
  morningQueue: MorningMsg[];
  reminderAt?: number;
  alerts: string[];
}

type MorningMsg = 'plan' | 'rain_on' | 'rain_off';

export type Event =
  | { type: 'CHIME' }
  | { type: 'INTENT'; intent: Intent }
  | { type: 'SIMULATE_MORNING' }
  | { type: 'RESOLVE_ALERT' }
  | { type: 'RESET' };

export type Effect =
  | { kind: 'alert'; reason: string }
  | { kind: 'reminder'; minutes: number }
  | { kind: 'summary' };

export interface Env {
  persona: Persona;
  mock: Mock;
  now?: number;
}

export interface Step {
  ctx: Ctx;
  /** What PackPal says now, or null to stay silent. */
  say: string | null;
  effects: Effect[];
  /** Short label for the log: advanced, repeat, button_prompt, alert, ignored ... */
  result: string;
}

/** Intents each state accepts. Anything else counts as unknown. */
export const ALLOWED: Record<StateName, Intent[]> = {
  IDLE: [],
  START: ['got_it', 'later', 'no', 'help'],
  ITEM: ['got_it', 'no', 'help'],
  CHOICE: ['option_left', 'option_right', 'help'],
  CONFIRM: ['got_it', 'no', 'help'],
  RECAP: ['got_it', 'help'],
  NIGHT_DONE: [],
  MORNING: ['got_it', 'help'],
  DOOR_EMPTY: ['got_it', 'no', 'help'],
  DOOR_KEYS: ['got_it', 'no', 'help'],
  DONE: [],
  ALERT: [],
};

export function allowedIntents(ctx: Ctx): Intent[] {
  const base = ALLOWED[ctx.state];
  if (ctx.state === 'CHOICE' && !ctx.options.right) return base.filter((i) => i !== 'option_right');
  return base;
}

export function initialCtx(): Ctx {
  return {
    state: 'IDLE',
    phase: 'night',
    items: [],
    index: 0,
    packed: [],
    substitutions: [],
    options: {},
    unknownCount: 0,
    prompt: '',
    morningQueue: [],
    alerts: [],
  };
}

/** Night-before item list: staff order, plus the rain item when rain is forecast. */
export function nightItems(persona: Persona, mock: Mock): Item[] {
  return mock.rain ? [...persona.items, persona.rainItem] : [...persona.items];
}

const ask = (ctx: Ctx, state: StateName, prompt: string, patch: Partial<Ctx> = {}, result = 'advanced', effects: Effect[] = []): Step => ({
  ctx: { ...ctx, ...patch, state, prompt, unknownCount: 0 },
  say: prompt,
  effects,
  result,
});

function itemPrompt(ctx: Ctx, persona: Persona, index: number): string {
  const item = ctx.items[index];
  if (ctx.phase === 'morning') return prompts.morningRainItem(item.name);
  const isRainItem = item.name === persona.rainItem.name;
  return isRainItem ? prompts.rainItem(item.name) : prompts.item(item.name);
}

function goToItem(ctx: Ctx, persona: Persona, index: number, patch: Partial<Ctx> = {}): Step {
  const next = { ...ctx, ...patch, index };
  if (index >= next.items.length) {
    if (next.phase === 'morning') return nextMorning(next, persona);
    return ask(next, 'RECAP', prompts.recap(next.packed), { options: {}, pendingChoice: undefined });
  }
  return ask(next, 'ITEM', itemPrompt(next, persona, index), { options: {}, pendingChoice: undefined });
}

function alert(ctx: Ctx, persona: Persona, reason: string): Step {
  return {
    ctx: {
      ...ctx,
      state: 'ALERT',
      resumeState: ctx.state,
      resumePrompt: ctx.prompt,
      alertReason: reason,
      alerts: [...ctx.alerts, reason],
      prompt: prompts.alert(persona.staffName),
      unknownCount: 0,
    },
    say: prompts.alert(persona.staffName),
    effects: [{ kind: 'alert', reason }],
    result: 'alert',
  };
}

function nextMorning(ctx: Ctx, persona: Persona): Step {
  const [msg, ...rest] = ctx.morningQueue;
  if (!msg) return ask({ ...ctx, morningQueue: [] }, 'DOOR_EMPTY', prompts.doorEmpty());
  const text =
    msg === 'plan' ? prompts.morningPlan(persona.staffName) : msg === 'rain_on' ? prompts.morningRainOn() : prompts.morningRainOff();
  const effects: Effect[] = msg === 'plan' ? [{ kind: 'alert', reason: 'Plan or transport changed since last night' }] : [];
  const patch: Partial<Ctx> = { morningQueue: rest, alerts: msg === 'plan' ? [...ctx.alerts, 'Plan or transport changed since last night'] : ctx.alerts };
  // Remember which message is showing so "got it" knows whether to add the rain item.
  return ask(ctx, 'MORNING', text, { ...patch, pendingChoice: msg }, 'advanced', effects);
}

function unclear(ctx: Ctx, persona: Persona): Step {
  const count = ctx.unknownCount + 1;
  if (count === 1) return { ctx: { ...ctx, unknownCount: 1 }, say: ctx.prompt, effects: [], result: 'repeat' };
  if (count === 2) return { ctx: { ...ctx, unknownCount: 2 }, say: prompts.pressButton(), effects: [], result: 'button_prompt' };
  return alert(ctx, persona, 'No reply after the button prompt');
}

export function transition(ctx: Ctx, event: Event, env: Env): Step {
  const { persona, mock } = env;

  switch (event.type) {
    case 'RESET':
      return { ctx: initialCtx(), say: null, effects: [], result: 'reset' };

    case 'CHIME': {
      if (!['IDLE', 'NIGHT_DONE', 'DONE'].includes(ctx.state)) return { ctx, say: null, effects: [], result: 'ignored' };
      const fresh = { ...initialCtx(), alerts: ctx.alerts };
      return ask(fresh, 'START', prompts.start(persona.activity.name));
    }

    case 'SIMULATE_MORNING': {
      if (ctx.state === 'ALERT') return { ctx, say: null, effects: [], result: 'ignored' };
      const night = ctx.night ?? { rain: false, planChange: false };
      const queue: MorningMsg[] = [];
      if (mock.planChange && !night.planChange) queue.push('plan');
      const rainItemPacked = ctx.items.some((i) => i.name === persona.rainItem.name);
      if (mock.rain && !night.rain && !rainItemPacked) queue.push('rain_on');
      if (!mock.rain && night.rain) queue.push('rain_off');
      const base: Ctx = { ...ctx, phase: 'morning', morningQueue: queue, options: {}, pendingChoice: undefined };
      return nextMorning(base, persona);
    }

    case 'RESOLVE_ALERT': {
      if (ctx.state !== 'ALERT' || !ctx.resumeState) return { ctx, say: null, effects: [], result: 'ignored' };
      const resume = ctx.resumeState;
      // A lost-keys alert ends at the door: staff handled it, so finish.
      if (resume === 'DOOR_KEYS') return ask(ctx, 'DONE', prompts.done(persona.activity.name), {}, 'resumed', [{ kind: 'summary' }]);
      return {
        ctx: { ...ctx, state: resume, prompt: ctx.resumePrompt ?? '', resumeState: undefined, alertReason: undefined, unknownCount: 0 },
        say: ctx.resumePrompt ?? null,
        effects: [],
        result: 'resumed',
      };
    }

    case 'INTENT': {
      const intent = allowedIntents(ctx).includes(event.intent) ? event.intent : 'unknown';
      if (ALLOWED[ctx.state].length === 0) return { ctx, say: null, effects: [], result: 'ignored' };
      if (intent === 'unknown') return unclear(ctx, persona);
      if (intent === 'help') return alert(ctx, persona, 'Help button pressed');

      switch (ctx.state) {
        case 'START':
          if (intent === 'got_it') {
            const items = nightItems(persona, mock);
            return goToItem({ ...ctx, items, packed: [], substitutions: [], night: { ...mock }, phase: 'night' }, persona, 0);
          }
          // "later" or "no": remind in 30 minutes.
          return {
            ctx: { ...ctx, state: 'IDLE', prompt: '', unknownCount: 0, reminderAt: (env.now ?? Date.now()) + 30 * 60_000 },
            say: prompts.later(),
            effects: [{ kind: 'reminder', minutes: 30 }],
            result: 'later',
          };

        case 'ITEM': {
          const item = ctx.items[ctx.index];
          if (intent === 'got_it') return goToItem(ctx, persona, ctx.index + 1, { packed: [...ctx.packed, item.name] });
          const [left, right] = item.alternatives;
          if (!left) return alert(ctx, persona, `Missing ${item.name}, no staff-listed alternative`);
          const say = right
            ? prompts.choiceTwo(item.name, left, right, persona.staffName)
            : prompts.choiceOne(item.name, left, persona.staffName);
          return ask(ctx, 'CHOICE', say, { options: { left, right } });
        }

        case 'CHOICE': {
          const choice = intent === 'option_left' ? ctx.options.left : ctx.options.right;
          if (!choice) return unclear(ctx, persona);
          return ask(ctx, 'CONFIRM', prompts.confirm(choice), { pendingChoice: choice, choicePrompt: ctx.prompt });
        }

        case 'CONFIRM': {
          const item = ctx.items[ctx.index];
          if (intent === 'no') {
            const back = ctx.choicePrompt ?? ctx.prompt;
            return ask(ctx, 'CHOICE', back, { pendingChoice: undefined }, 'reoffer');
          }
          const used = ctx.pendingChoice!;
          return goToItem(ctx, persona, ctx.index + 1, {
            packed: [...ctx.packed, used],
            substitutions: [...ctx.substitutions, { item: item.name, used }],
          });
        }

        case 'RECAP':
          return {
            ctx: { ...ctx, state: 'NIGHT_DONE', prompt: '', unknownCount: 0 },
            say: prompts.goodnight(),
            effects: [],
            result: 'night_done',
          };

        case 'MORNING': {
          if (ctx.pendingChoice === 'rain_on') {
            const items = [...ctx.items, persona.rainItem];
            return goToItem({ ...ctx, items }, persona, items.length - 1);
          }
          return nextMorning(ctx, persona);
        }

        case 'DOOR_EMPTY':
          if (intent === 'got_it') return ask(ctx, 'DOOR_KEYS', prompts.doorKeys());
          return { ctx: { ...ctx, unknownCount: 0 }, say: prompts.doorEmptyNo(), effects: [], result: 'not_empty' };

        case 'DOOR_KEYS':
          if (intent === 'got_it') return ask(ctx, 'DONE', prompts.done(persona.activity.name), {}, 'done', [{ kind: 'summary' }]);
          return alert(ctx, persona, 'Keys lost at the door');
      }
      return { ctx, say: null, effects: [], result: 'ignored' };
    }
  }
}
