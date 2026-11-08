// Thin wrappers over the Web Speech API. No audio is stored anywhere:
// only the recognised transcript is passed back.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

const RecognitionCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

export const speechSupport = {
  tts: typeof window !== 'undefined' && 'speechSynthesis' in window,
  stt: Boolean(RecognitionCtor),
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

export interface ListenHandle {
  result: Promise<string | null>;
  cancel: () => void;
}

/**
 * Listen for one reply. The window stays open for `seconds` (long by design:
 * people may need time to start speaking). Resolves with the transcript, or
 * null when nothing was heard before the window closed.
 */
export function listen(seconds: number): ListenHandle {
  if (!RecognitionCtor) return { result: Promise.resolve(null), cancel: () => {} };
  const rec: Recognition = new RecognitionCtor();
  rec.lang = 'en-GB';
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let settled = false;
  let resolveFn: (v: string | null) => void = () => {};
  const result = new Promise<string | null>((resolve) => (resolveFn = resolve));
  const settle = (v: string | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    resolveFn(v);
  };
  const timer = setTimeout(() => settle(null), seconds * 1000);
  rec.onresult = (e: any) => {
    const last = e.results[e.results.length - 1];
    if (last?.isFinal) settle(String(last[0]?.transcript ?? '').trim() || null);
  };
  rec.onerror = (e: any) => {
    // "no-speech" just means silence so far; keep the window open by restarting.
    if (e?.error === 'no-speech' && !settled) return;
    settle(null);
  };
  rec.onend = () => {
    if (!settled) {
      try {
        rec.start();
      } catch {
        settle(null);
      }
    }
  };
  try {
    rec.start();
  } catch {
    settle(null);
  }
  return { result, cancel: () => settle(null) };
}
