// Thin wrappers over the Web Speech API. No audio is stored anywhere:
// only the recognised transcript is passed back.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

// Looked up at call time, so a test double can be swapped in.
const getRecognition = (): (new () => Recognition) | undefined =>
  typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

export const speechSupport = {
  tts: typeof window !== 'undefined' && 'speechSynthesis' in window,
  get stt() {
    return Boolean(getRecognition());
  },
};

export function stopSpeaking() {
  if (speechSupport.tts) window.speechSynthesis.cancel();
}

export function speak(text: string, opts: { rate: number; volume: number }): Promise<void> {
  if (!speechSupport.tts || !text) return Promise.resolve();
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate;
    u.volume = opts.volume;
    u.lang = 'en-GB';
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    u.onend = finish;
    u.onerror = finish;
    // Safety net: some browsers never fire onend.
    setTimeout(finish, 1500 + text.length * 120);
    window.speechSynthesis.speak(u);
  });
}

let audioCtx: AudioContext | null = null;
/** Two soft tones, played before the opening prompt. */
export async function chime(volume: number): Promise<void> {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    [659.25, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.28;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25 * volume, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
    await new Promise((r) => setTimeout(r, 800));
  } catch {
    /* audio blocked: carry on silently */
  }
}

export interface ListenResult {
  /** What was heard, or null when nothing was. */
  text: string | null;
  /** Why nothing was heard: no_speech, not-allowed, audio-capture, network ... */
  error?: string;
}

export interface ListenHandle {
  result: Promise<ListenResult>;
  cancel: () => void;
}

/** How long to wait after the person stops talking before using what was heard. */
export const END_OF_SPEECH_MS = 1200;

/**
 * Listen for one reply. The window stays open for `seconds` (long by design:
 * people may need time to start speaking). Once speech starts, the reply is
 * taken as soon as the browser marks it final, or END_OF_SPEECH_MS after the
 * last words heard. Interim words are kept, because browsers often never
 * finalise a single short word such as "now".
 */
export function listen(seconds: number, onHeard?: (partial: string) => void): ListenHandle {
  const RecognitionCtor = getRecognition();
  if (!RecognitionCtor) return { result: Promise.resolve({ text: null, error: 'unsupported' }), cancel: () => {} };
  const rec: Recognition = new RecognitionCtor();
  rec.lang = 'en-GB';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let settled = false;
  let heard = '';
  let resolveFn: (v: ListenResult) => void = () => {};
  const result = new Promise<ListenResult>((resolve) => (resolveFn = resolve));
  let windowTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;

  const settle = (v: ListenResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(windowTimer);
    clearTimeout(silenceTimer);
    try {
      rec.abort();
    } catch {
      /* already stopped */
    }
    resolveFn(v);
  };
  const useHeard = (error?: string) => settle(heard ? { text: heard } : { text: null, error });

  windowTimer = setTimeout(() => {
    // Mid-sentence when the window closes: let them finish.
    if (heard) return;
    useHeard('no_speech');
  }, seconds * 1000);

  rec.onresult = (e: any) => {
    let finalText = '';
    let interim = '';
    for (let i = e.resultIndex ?? 0; i < e.results.length; i++) {
      const r = e.results[i];
      const t = String(r[0]?.transcript ?? '');
      if (r.isFinal) finalText += t;
      else interim += t;
    }
    finalText = finalText.trim();
    if (finalText) {
      heard = finalText;
      onHeard?.(heard);
      settle({ text: heard });
      return;
    }
    if (interim.trim()) {
      heard = interim.trim();
      onHeard?.(heard);
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => useHeard(), END_OF_SPEECH_MS);
    }
  };
  rec.onerror = (e: any) => {
    const err = String(e?.error ?? 'error');
    // Silence so far, or our own abort: keep going / ignore.
    if (err === 'no-speech' || err === 'aborted') return;
    useHeard(err);
  };
  rec.onend = () => {
    if (settled) return;
    // Session ended on its own. If words were heard, use them; otherwise keep the window open.
    if (heard) return useHeard();
    try {
      rec.start();
    } catch {
      useHeard('restart_failed');
    }
  };
  try {
    rec.start();
  } catch {
    useHeard('start_failed');
  }
  return { result, cancel: () => settle({ text: null, error: 'cancelled' }) };
}
