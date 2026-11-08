// Simulated microphone: mimics how Chrome's SpeechRecognition reports results.

/* eslint-disable @typescript-eslint/no-explicit-any */
class FakeRecognition {
  static last: FakeRecognition;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  starts = 0;
  aborted = false;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.starts++;
  }
  stop() {}
  abort() {
    this.aborted = true;
  }
  /** Emit results: [text, isFinal][] */
  say(parts: [string, boolean][], resultIndex = 0) {
    const results = parts.map(([t, isFinal]) => Object.assign([{ transcript: t }], { isFinal }));
    this.onresult?.({ resultIndex, results });
  }
}

let listen: typeof import('./speech').listen;
let END: number;

beforeAll(async () => {
  (globalThis as any).window = { webkitSpeechRecognition: FakeRecognition };
  const mod = await import('./speech');
  listen = mod.listen;
  END = mod.END_OF_SPEECH_MS;
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('listen', () => {
  it('takes a final result straight away', async () => {
    const h = listen(8);
    FakeRecognition.last.say([['now', true]]);
    expect(await h.result).toEqual({ text: 'now' });
  });

  it('keeps a short word Chrome never finalises ("now")', async () => {
    const heard: string[] = [];
    const h = listen(8, (p) => heard.push(p));
    FakeRecognition.last.say([['now', false]]);
    await vi.advanceTimersByTimeAsync(END + 10);
    expect(await h.result).toEqual({ text: 'now' });
    expect(heard).toEqual(['now']);
  });

  it('keeps an interim word when the session ends before it is finalised', async () => {
    const h = listen(8);
    FakeRecognition.last.say([['now', false]]);
    FakeRecognition.last.onend?.();
    expect(await h.result).toEqual({ text: 'now' });
  });

  it('waits for the person to finish when the window closes mid-sentence', async () => {
    const h = listen(5);
    await vi.advanceTimersByTimeAsync(4900);
    FakeRecognition.last.say([['the coat', false]]);
    await vi.advanceTimersByTimeAsync(200); // window closes at 5 s
    FakeRecognition.last.say([['the coat one', false]]);
    await vi.advanceTimersByTimeAsync(END + 10);
    expect(await h.result).toEqual({ text: 'the coat one' });
  });

  it('restarts after "no-speech" so the window stays open for the full time', async () => {
    const h = listen(8);
    const rec = FakeRecognition.last;
    await vi.advanceTimersByTimeAsync(5000);
    rec.onerror?.({ error: 'no-speech' });
    rec.onend?.();
    expect(rec.starts).toBe(2);
    rec.say([['yes', true]]);
    expect(await h.result).toEqual({ text: 'yes' });
  });

  it('reports real silence as no_speech when the window closes', async () => {
    const h = listen(8);
    await vi.advanceTimersByTimeAsync(8010);
    expect(await h.result).toEqual({ text: null, error: 'no_speech' });
    expect(FakeRecognition.last.aborted).toBe(true);
  });

  it('reports a blocked microphone as an error, not as silence', async () => {
    const h = listen(8);
    FakeRecognition.last.onerror?.({ error: 'not-allowed' });
    expect(await h.result).toEqual({ text: null, error: 'not-allowed' });
  });
});
