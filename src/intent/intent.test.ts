import { interpret } from './interpret';
import { matchRules } from './rules';

const choice = { left: 'raincoat', right: 'hoodie' };

describe('rules matcher', () => {
  it.each([
    ['yes', 'got_it'],
    ['Got it!', 'got_it'],
    ['no', 'no'],
    ['not now', 'later'],
    ['later', 'later'],
    ['help', 'help'],
    ['left', 'option_left'],
    ['raincoat', 'option_left'],
    ['the hoodie', 'option_right'],
    ['square', 'option_right'],
  ])('%s -> %s', (text, intent) => {
    expect(matchRules(text, choice)).toBe(intent);
  });

  it('misses off-script replies (that is what GenAI mode is for)', () => {
    expect(matchRules('the coat one', choice)).toBe('unknown');
    expect(matchRules('uh huh', choice)).toBe('unknown');
    expect(matchRules('', choice)).toBe('unknown');
  });
});

const base = { state: 'CHOICE', options: choice, allowed: ['option_left', 'option_right', 'help'] as const, threshold: 0.7 };
const fakeFetch = (body: unknown, status = 200, delay = 0) =>
  ((_url: string, init?: RequestInit) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response(JSON.stringify(body), { status })), delay);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    })) as unknown as typeof fetch;

describe('interpret', () => {
  it('rules mode enforces the allowed list', async () => {
    const r = await interpret({ ...base, allowed: [...base.allowed], transcript: 'yes', mode: 'rules' });
    expect(r).toMatchObject({ intent: 'unknown', rawIntent: 'got_it', path: 'not_allowed' });
  });

  it('genai mode accepts a confident allowed intent', async () => {
    const r = await interpret({ ...base, allowed: [...base.allowed], transcript: 'the coat one', mode: 'genai' }, fakeFetch({ intent: 'option_left', confidence: 0.86 }));
    expect(r).toMatchObject({ intent: 'option_left', path: 'genai' });
  });

  it('low confidence counts as unknown', async () => {
    const r = await interpret({ ...base, allowed: [...base.allowed], transcript: 'mm', mode: 'genai' }, fakeFetch({ intent: 'option_left', confidence: 0.5 }));
    expect(r).toMatchObject({ intent: 'unknown', path: 'genai_low_confidence' });
  });

  it('invalid JSON counts as unknown', async () => {
    const r = await interpret({ ...base, allowed: [...base.allowed], transcript: 'x', mode: 'genai' }, fakeFetch({ intent: 'pack_banana', confidence: 1 }));
    expect(r).toMatchObject({ intent: 'unknown', path: 'genai_error', error: 'invalid_json' });
  });

  it('server error counts as unknown', async () => {
    const r = await interpret({ ...base, allowed: [...base.allowed], transcript: 'x', mode: 'genai' }, fakeFetch({ error: 'no_api_key' }, 503));
    expect(r).toMatchObject({ intent: 'unknown', path: 'genai_error', error: 'no_api_key' });
  });

  it('a reply slower than 3 seconds counts as unknown', async () => {
    vi.useFakeTimers();
    const p = interpret({ ...base, allowed: [...base.allowed], transcript: 'x', mode: 'genai' }, fakeFetch({ intent: 'option_left', confidence: 1 }, 200, 5000));
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toMatchObject({ intent: 'unknown', error: 'timeout' });
    vi.useRealTimers();
  });
});
