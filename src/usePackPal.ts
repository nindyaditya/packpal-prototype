import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import samConfig from '../config/sam.json';
import joConfig from '../config/jo.json';
import { allowedIntents, type Ctx, type Effect, type Event, initialCtx, transition } from './machine/machine';
import { interpret } from './intent/interpret';
import { chime, listen, type ListenHandle, speak, speechSupport, stopSpeaking } from './speech/speech';
import type { LogEntry } from './log/log';
import type { InputType, Intent, Interpretation, Mock, Persona, Settings } from './types';

export const BASE_PERSONAS: Record<string, Persona> = { sam: samConfig as Persona, jo: joConfig as Persona };

export const DEFAULT_SETTINGS: Settings = {
  mode: 'rules',
  listenSeconds: 8,
  voiceRate: 0.9,
  voiceVolume: 1,
  captions: true,
  confidenceThreshold: 0.7,
  autoListen: false,
};

export interface StaffAlert {
  id: number;
  time: string;
  persona: string;
  reason: string;
  /** True when the routine is paused waiting for staff. */
  blocking: boolean;
  resolved: boolean;
}

export interface Summary {
  id: number;
  time: string;
  text: string;
}

export type Status = 'idle' | 'speaking' | 'listening' | 'thinking';

interface Saved {
  personaId: string;
  personas: Record<string, Persona>;
  settings: Settings;
  mock: Mock;
  summariesOn: Record<string, boolean>;
  log: LogEntry[];
  alerts: StaffAlert[];
  summaries: Summary[];
}

const KEY = 'packpal:v1';
function load(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Saved>) : {};
  } catch {
    return {};
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: run without persistence */
  }
}

const hhmm = (d = new Date()) => d.toTimeString().slice(0, 5);
const newSession = () => Math.random().toString(36).slice(2, 8);

export function usePackPal() {
  const saved = useMemo(load, []);
  const [personaId, setPersonaId] = useState(saved.personaId && BASE_PERSONAS[saved.personaId] ? saved.personaId : 'sam');
  const [personas, setPersonas] = useState<Record<string, Persona>>({ ...BASE_PERSONAS, ...(saved.personas ?? {}) });
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) });
  const [mock, setMock] = useState<Mock>(saved.mock ?? { rain: true, planChange: false });
  const [summariesOn, setSummariesOn] = useState<Record<string, boolean>>(saved.summariesOn ?? {});
  const [log, setLog] = useState<LogEntry[]>(saved.log ?? []);
  const [alerts, setAlerts] = useState<StaffAlert[]>(saved.alerts ?? []);
  const [summaries, setSummaries] = useState<Summary[]>(saved.summaries ?? []);
  const [ctx, setCtx] = useState<Ctx>(initialCtx());
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [lastHeard, setLastHeard] = useState('');
  const [micError, setMicError] = useState('');
  const [genaiAvailable, setGenaiAvailable] = useState<boolean | null>(null);

  const persona = personas[personaId];

  // Refs so async speech callbacks always see the latest values.
  const ctxRef = useRef(ctx);
  const envRef = useRef({ persona, mock, settings, summariesOn: Boolean(summariesOn[personaId]) });
  envRef.current = { persona, mock, settings, summariesOn: Boolean(summariesOn[personaId]) };
  const sessionRef = useRef(newSession());
  const turnRef = useRef(0);
  const listenRef = useRef<ListenHandle | null>(null);
  const reminderRef = useRef<number | null>(null);
  const idRef = useRef(Math.max(0, ...(saved.log ?? []).map((e) => e.id), ...(saved.alerts ?? []).map((a) => a.id)) + 1);

  useEffect(() => {
    save({ personaId, personas, settings, mock, summariesOn, log, alerts, summaries });
  }, [personaId, personas, settings, mock, summariesOn, log, alerts, summaries]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((j) => setGenaiAvailable(Boolean(j.genai)))
      .catch(() => setGenaiAvailable(false));
  }, []);

  const stopListening = () => {
    listenRef.current?.cancel();
    listenRef.current = null;
  };

  const applyEffects = useCallback((effects: Effect[], c: Ctx) => {
    const { persona: p, summariesOn: on } = envRef.current;
    for (const fx of effects) {
      if (fx.kind === 'alert') {
        const blocking = c.state === 'ALERT';
        setAlerts((a) => [{ id: idRef.current++, time: new Date().toISOString(), persona: p.userName, reason: fx.reason, blocking, resolved: false }, ...a]);
      } else if (fx.kind === 'reminder') {
        if (reminderRef.current) clearTimeout(reminderRef.current);
        reminderRef.current = window.setTimeout(() => sendRef.current({ type: 'CHIME' }), fx.minutes * 60_000);
      } else if (fx.kind === 'summary' && on) {
        const subs = c.substitutions.map((s) => `${s.used} instead of ${s.item}`);
        const text = [
          `${p.userName} left for ${p.activity.name} at ${hhmm()}.`,
          `Packed: ${c.packed.join(', ') || 'nothing logged'}.`,
          subs.length ? `Alternatives used: ${subs.join('; ')}.` : 'No alternatives needed.',
          c.alerts.length ? `Alerts: ${c.alerts.join('; ')}.` : 'No alerts.',
        ].join(' ');
        setSummaries((s) => [{ id: idRef.current++, time: new Date().toISOString(), text }, ...s]);
      }
    }
  }, []);

  /** After PackPal speaks: listen for a reply if the mic is on and the state takes one. */
  const maybeListen = useCallback((turn: number) => {
    const { settings: s } = envRef.current;
    const c = ctxRef.current;
    if (!s.autoListen || !speechSupport.stt || allowedIntents(c).length === 0) {
      setStatus('idle');
      return;
    }
    setStatus('listening');
    setLastHeard('');
    const handle = listen(s.listenSeconds, (partial) => {
      if (turn === turnRef.current) setLastHeard(partial);
    });
    listenRef.current = handle;
    void handle.result.then(({ text, error }) => {
      if (turn !== turnRef.current || listenRef.current !== handle) return;
      listenRef.current = null;
      if (text) {
        setMicError('');
        void replyTextRef.current(text, 'speech');
      } else if (error === 'no_speech') {
        // Real silence: counts as no reply (repeat, then button prompt, then staff).
        sendRef.current({ type: 'INTENT', intent: 'unknown' }, { inputType: 'timeout', reply: '', error });
      } else if (error !== 'cancelled') {
        // The microphone failed, not the person: don't count it against them.
        setMicError(error ?? 'error');
        setStatus('idle');
      }
    });
  }, []);

  interface Meta {
    inputType: InputType;
    reply: string;
    interp?: Interpretation;
    error?: string;
  }

  const send = useCallback(
    (event: Event, meta: Meta = { inputType: 'system', reply: '' }) => {
      const { persona: p, mock: m, settings: s } = envRef.current;
      const before = ctxRef.current;
      if (event.type === 'CHIME' && ['IDLE', 'NIGHT_DONE', 'DONE'].includes(before.state)) sessionRef.current = newSession();
      const step = transition(before, event, { persona: p, mock: m });
      ctxRef.current = step.ctx;
      setCtx(step.ctx);
      stopListening();
      const turn = ++turnRef.current;

      if (event.type === 'INTENT' || step.say) {
        const intent = event.type === 'INTENT' ? event.intent : '';
        const entry: LogEntry = {
          id: idRef.current++,
          time: new Date().toISOString(),
          session: sessionRef.current,
          persona: p.id,
          mode: s.mode,
          state: before.state,
          prompt: event.type === 'INTENT' ? before.prompt : `[${event.type}]`,
          reply: meta.reply,
          inputType: event.type === 'INTENT' ? meta.inputType : 'system',
          intent,
          rawIntent: meta.interp?.rawIntent ?? intent,
          confidence: meta.interp ? +meta.interp.confidence.toFixed(2) : event.type === 'INTENT' ? 1 : '',
          path: meta.interp?.path ?? (event.type === 'INTENT' ? 'button' : 'system'),
          result: step.result,
          nextState: step.ctx.state,
          said: step.say ?? '',
          failed: event.type === 'INTENT' && (step.result === 'repeat' || step.result === 'button_prompt' || (step.result === 'alert' && intent === 'unknown')),
          latencyMs: meta.interp?.latencyMs ?? '',
          error: meta.interp?.error ?? meta.error ?? '',
        };
        setLog((l) => [...l, entry]);
      }

      applyEffects(step.effects, step.ctx);

      if (step.say) {
        const text = step.say;
        setCaption(text);
        setStatus('speaking');
        const pre = event.type === 'CHIME' && step.ctx.state === 'START' ? chime(s.voiceVolume) : Promise.resolve();
        void pre
          .then(() => speak(text, { rate: s.voiceRate, volume: s.voiceVolume }))
          .then(() => {
            if (turn === turnRef.current) maybeListen(turn);
          });
      } else {
        setStatus('idle');
      }
    },
    [applyEffects, maybeListen],
  );
  const sendRef = useRef(send);
  sendRef.current = send;

  /** A button press or keyboard shortcut: always the guaranteed path. */
  const press = useCallback(
    (intent: Intent, inputType: InputType = 'button') => {
      if (allowedIntents(ctxRef.current).length === 0) return;
      stopSpeaking();
      send({ type: 'INTENT', intent }, { inputType, reply: `[${intent}]` });
    },
    [send],
  );

  /** A spoken or typed reply: interpreted in the current mode, then sent. */
  const replyText = useCallback(
    async (text: string, inputType: InputType) => {
      const c = ctxRef.current;
      const allowed = allowedIntents(c);
      if (allowed.length === 0) return;
      const turn = turnRef.current;
      setLastHeard(text);
      setStatus('thinking');
      stopSpeaking();
      const { settings: s } = envRef.current;
      const interp = await interpret({ transcript: text, state: c.state, options: c.options, allowed, mode: s.mode, threshold: s.confidenceThreshold });
      if (turn !== turnRef.current) return; // a button was pressed meanwhile
      send({ type: 'INTENT', intent: interp.intent }, { inputType, reply: text, interp });
    },
    [send],
  );
  const replyTextRef = useRef(replyText);
  replyTextRef.current = replyText;

  // F7: chime at preparation time (checked against the real clock).
  useEffect(() => {
    let lastFired = '';
    const tick = () => {
      const now = hhmm();
      const key = `${new Date().toDateString()} ${now}`;
      if (now === envRef.current.persona.activity.prepTime && ctxRef.current.state === 'IDLE' && lastFired !== key) {
        lastFired = key;
        sendRef.current({ type: 'CHIME' });
      }
    };
    const id = window.setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => {
    stopListening();
    stopSpeaking();
    if (reminderRef.current) clearTimeout(reminderRef.current);
  }, []);

  const resolveAlert = useCallback(
    (id: number) => {
      const a = alerts.find((x) => x.id === id);
      setAlerts((list) => list.map((x) => (x.id === id ? { ...x, resolved: true } : x)));
      if (a?.blocking && ctxRef.current.state === 'ALERT') send({ type: 'RESOLVE_ALERT' });
    },
    [alerts, send],
  );

  const switchPersona = useCallback(
    (id: string) => {
      stopListening();
      stopSpeaking();
      setPersonaId(id);
      ctxRef.current = initialCtx();
      setCtx(ctxRef.current);
      setCaption('');
      setStatus('idle');
    },
    [],
  );

  const reset = useCallback(() => {
    stopListening();
    stopSpeaking();
    if (reminderRef.current) clearTimeout(reminderRef.current);
    send({ type: 'RESET' });
    setCaption('');
  }, [send]);

  const updatePersona = useCallback((p: Persona) => setPersonas((all) => ({ ...all, [p.id]: p })), []);
  const restorePersona = useCallback((id: string) => setPersonas((all) => ({ ...all, [id]: BASE_PERSONAS[id] })), []);

  return {
    persona,
    personaId,
    personas,
    settings,
    setSettings,
    mock,
    setMock,
    summariesOn: Boolean(summariesOn[personaId]),
    setSummariesOn: (on: boolean) => setSummariesOn((s) => ({ ...s, [personaId]: on })),
    log,
    setLog,
    alerts,
    summaries,
    setSummaries,
    ctx,
    caption,
    status,
    lastHeard,
    micError,
    clearMicError: () => setMicError(''),
    genaiAvailable,
    allowed: allowedIntents(ctx),
    send,
    press,
    replyText,
    resolveAlert,
    switchPersona,
    reset,
    updatePersona,
    restorePersona,
    appendLog: (entries: LogEntry[]) => setLog((l) => [...l, ...entries]),
    nextId: () => idRef.current++,
    clearAll: () => {
      setLog([]);
      setAlerts([]);
      setSummaries([]);
    },
  };
}

export type PackPal = ReturnType<typeof usePackPal>;
