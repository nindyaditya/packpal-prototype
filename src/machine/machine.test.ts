import sam from '../../config/sam.json';
import jo from '../../config/jo.json';
import type { Intent, Mock, Persona } from '../types';
import { ALLOWED, type Ctx, type Env, type Event, initialCtx, transition } from './machine';
import { prompts, wordCount } from './prompts';

const persona = sam as Persona;
const env = (mock: Partial<Mock> = {}): Env => ({ persona, mock: { rain: false, planChange: false, ...mock }, now: 0 });

/** Run a list of events and return every step. */
function run(events: (Event | Intent)[], e: Env = env(), start: Ctx = initialCtx()) {
  let ctx = start;
  const steps = [];
  for (const ev of events) {
    const event: Event = typeof ev === 'string' ? { type: 'INTENT', intent: ev } : ev;
    const step = transition(ctx, event, e);
    steps.push(step);
    ctx = step.ctx;
  }
  return { ctx, steps, said: steps.map((s) => s.say) };
}

const CHIME: Event = { type: 'CHIME' };
const MORNING: Event = { type: 'SIMULATE_MORNING' };

describe('night before', () => {
  it('chime opens with the fixed prompt', () => {
    const { ctx, said } = run([CHIME]);
    expect(ctx.state).toBe('START');
    expect(said[0]).toBe("Tomorrow is swimming. Let's get ready. Now or later?");
  });

  it('later sets a 30 minute reminder and goes idle', () => {
    const { ctx, steps } = run([CHIME, 'later']);
    expect(ctx.state).toBe('IDLE');
    expect(ctx.reminderAt).toBe(30 * 60_000);
    expect(steps[1].effects).toContainEqual({ kind: 'reminder', minutes: 30 });
  });

  it('no at start also means later', () => {
    expect(run([CHIME, 'no']).ctx.state).toBe('IDLE');
  });

  it('asks one item per turn in the staff order, then recaps', () => {
    const { ctx, said } = run([CHIME, 'got_it', 'got_it', 'got_it']);
    expect(said.slice(1)).toEqual(['Find your bag. Got it?', 'Find your towel. Got it?', 'Bag, towel. All ready.']);
    expect(ctx.state).toBe('RECAP');
  });

  it('adds the rain item by rule when rain is forecast', () => {
    const { said } = run([CHIME, 'got_it', 'got_it', 'got_it'], env({ rain: true }));
    expect(said[3]).toBe('Rain tomorrow. Find your umbrella. Got it?');
  });

  it("Sam's demo: missing umbrella, raincoat chosen and repeated back", () => {
    const { ctx, said } = run([CHIME, 'got_it', 'got_it', 'got_it', 'no', 'option_left', 'got_it', 'got_it'], env({ rain: true }));
    expect(said[4]).toBe('Left for raincoat. Right for hoodie. Or ask Rina.');
    expect(said[5]).toBe('Raincoat. Okay?');
    expect(said[6]).toBe('Bag, towel, raincoat. All ready.');
    expect(said[7]).toBe(prompts.goodnight());
    expect(ctx.state).toBe('NIGHT_DONE');
    expect(ctx.substitutions).toEqual([{ item: 'umbrella', used: 'raincoat' }]);
  });

  it('no at repeat back re-offers the same choice', () => {
    const { ctx, said } = run([CHIME, 'got_it', 'got_it', 'got_it', 'no', 'option_right', 'no'], env({ rain: true }));
    expect(said[5]).toBe('Hoodie. Okay?');
    expect(said[6]).toBe(said[4]);
    expect(ctx.state).toBe('CHOICE');
  });

  it('offers only one option when staff listed one alternative', () => {
    const { ctx, said } = run([CHIME, 'got_it', 'got_it', 'no']);
    expect(said[3]).toBe('Left for spare towel. Or ask Rina.');
    expect(ctx.options).toEqual({ left: 'spare towel', right: undefined });
    // Right button is not allowed when there is no right option.
    expect(run(['option_right'], env(), ctx).steps[0].result).toBe('repeat');
  });

  it('missing item with no alternatives alerts staff', () => {
    const { ctx, said, steps } = run([CHIME, 'got_it', 'no']);
    expect(ctx.state).toBe('ALERT');
    expect(said[2]).toBe("I'll get Rina.");
    expect(steps[2].effects[0]).toEqual({ kind: 'alert', reason: 'Missing bag, no staff-listed alternative' });
  });

  it('only offers staff-listed alternatives', () => {
    const { ctx } = run([CHIME, 'got_it', 'got_it', 'got_it', 'no'], env({ rain: true }));
    expect([ctx.options.left, ctx.options.right]).toEqual(persona.rainItem.alternatives.slice(0, 2));
  });
});

describe('unclear replies', () => {
  it('repeats once, then asks for a button, then alerts', () => {
    const { said, steps, ctx } = run([CHIME, 'got_it', 'unknown', 'unknown', 'unknown']);
    expect(said[2]).toBe('Find your bag. Got it?');
    expect(steps[2].result).toBe('repeat');
    expect(said[3]).toBe('Press a button.');
    expect(steps[3].result).toBe('button_prompt');
    expect(ctx.state).toBe('ALERT');
    expect(ctx.alertReason).toBe('No reply after the button prompt');
  });

  it('a valid reply resets the counter', () => {
    const { ctx } = run([CHIME, 'got_it', 'unknown', 'got_it']);
    expect(ctx.unknownCount).toBe(0);
    expect(ctx.index).toBe(1);
  });

  it('an intent not allowed in the state counts as unknown', () => {
    const { steps } = run([CHIME, 'got_it', 'option_left']);
    expect(steps[2].result).toBe('repeat');
  });
});

describe('help and alerts', () => {
  it('help in any dialogue state alerts and resolving resumes', () => {
    const { ctx, said } = run([CHIME, 'got_it', 'help', { type: 'RESOLVE_ALERT' }]);
    expect(said[2]).toBe("I'll get Rina.");
    expect(ctx.state).toBe('ITEM');
    expect(said[3]).toBe('Find your bag. Got it?');
  });

  it('every dialogue state accepts help', () => {
    for (const [state, intents] of Object.entries(ALLOWED)) {
      if (intents.length) expect(intents, state).toContain('help');
    }
  });

  it('ignores replies while an alert is open', () => {
    const { ctx } = run([CHIME, 'help', 'got_it']);
    expect(ctx.state).toBe('ALERT');
  });
});

describe('morning and door check', () => {
  const night = (mock: Partial<Mock>) => run([CHIME, 'got_it', 'got_it', 'got_it', 'got_it'], env(mock)).ctx;

  it('no change since the night: straight to the door check', () => {
    const { said, ctx } = run([MORNING], env(), night({}));
    expect(said[0]).toBe('Is the ready spot empty?');
    expect(ctx.state).toBe('DOOR_EMPTY');
  });

  it('plan change: morning message and staff alert', () => {
    const { said, steps } = run([MORNING, 'got_it'], env({ planChange: true }), night({}));
    expect(said[0]).toBe('Plan changed today. Rina will tell you more.');
    expect(steps[0].effects[0].kind).toBe('alert');
    expect(said[1]).toBe('Is the ready spot empty?');
  });

  it('rain added overnight: adds the rain item, then the door', () => {
    const { said } = run([MORNING, 'got_it', 'no', 'option_left', 'got_it'], env({ rain: true }), night({}));
    expect(said[0]).toBe("Rain today. Let's add one thing.");
    expect(said[1]).toBe('Find your umbrella. Got it?');
    expect(said[3]).toBe('Raincoat. Okay?');
    expect(said[4]).toBe('Is the ready spot empty?');
  });

  it('door check: empty, keys, then have fun, with a summary effect', () => {
    const { said, steps, ctx } = run([MORNING, 'got_it', 'got_it'], env(), night({}));
    expect(said[1]).toBe('Do you have your keys?');
    expect(said[2]).toBe('Have fun at swimming.');
    expect(ctx.state).toBe('DONE');
    expect(steps[2].effects).toContainEqual({ kind: 'summary' });
  });

  it('ready spot not empty: tells the user and waits', () => {
    const { said, ctx } = run([MORNING, 'no'], env(), night({}));
    expect(said[1]).toBe('Put everything in your bag. Then press got it.');
    expect(ctx.state).toBe('DOOR_EMPTY');
  });

  it('lost keys alerts staff', () => {
    const { ctx } = run([MORNING, 'got_it', 'no'], env(), night({}));
    expect(ctx.state).toBe('ALERT');
    expect(ctx.alertReason).toBe('Keys lost at the door');
  });
});

describe('wording rules', () => {
  it('every PackPal line for Sam is 10 words or fewer', () => {
    const lines = [
      ...run([CHIME, 'got_it', 'got_it', 'got_it', 'no', 'option_left', 'got_it', 'got_it'], env({ rain: true })).said,
      prompts.later(),
      prompts.morningPlan('Rina'),
      prompts.morningRainOn(),
      prompts.morningRainOff(),
      prompts.doorEmpty(),
      prompts.doorEmptyNo(),
      prompts.doorKeys(),
      prompts.done('swimming'),
      prompts.alert('Rina'),
      prompts.pressButton(),
    ].filter(Boolean) as string[];
    for (const line of lines) expect(wordCount(line), line).toBeLessThanOrEqual(10);
  });

  it('the setup is reusable for a second persona', () => {
    const e: Env = { persona: jo as Persona, mock: { rain: false, planChange: false } };
    const { said } = run([CHIME, 'got_it', 'got_it', 'no'], e);
    expect(said[0]).toBe("Tomorrow is work at the cafe. Let's get ready. Now or later?");
    expect(said[3]).toBe('Left for sandwich bag. Right for lunch money. Or ask Marcus.');
  });
});
