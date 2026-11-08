import type { InputType, Intent, InterpretPath, Mode, StateName } from '../types';

export interface LogEntry {
  id: number;
  time: string; // ISO
  session: string;
  persona: string;
  mode: Mode;
  state: StateName;
  prompt: string;
  reply: string;
  inputType: InputType;
  intent: Intent | '';
  rawIntent: Intent | '';
  confidence: number | '';
  path: InterpretPath | 'system' | '';
  result: string;
  nextState: StateName;
  said: string;
  /** True when the exchange did not move the routine on (unknown reply). */
  failed: boolean;
  latencyMs: number | '';
  error: string;
  expected?: Intent | '';
}

const COLUMNS: (keyof LogEntry)[] = [
  'id', 'time', 'session', 'persona', 'mode', 'state', 'prompt', 'reply', 'inputType', 'intent', 'rawIntent',
  'confidence', 'path', 'result', 'nextState', 'said', 'failed', 'latencyMs', 'error', 'expected',
];

const esc = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(entries: LogEntry[]): string {
  return [COLUMNS.join(','), ...entries.map((e) => COLUMNS.map((c) => esc(e[c])).join(','))].join('\n');
}

export function downloadCSV(entries: LogEntry[]) {
  const blob = new Blob([toCSV(entries)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `packpal-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export interface ModeStats {
  sessions: number;
  exchanges: number;
  failed: number;
  buttonFallback: number;
  alerts: number;
  turnsPerItem: number;
  testTotal: number;
  testFailed: number;
  wrongAccepted: number;
}

/**
 * Measures from the evaluation plan, per mode. Live turns (buttons, keys,
 * speech, typed) and scripted test-set rows are counted separately.
 */
export function statsByMode(entries: LogEntry[]): Record<Mode, ModeStats> {
  const out = {} as Record<Mode, ModeStats>;
  for (const mode of ['rules', 'genai'] as Mode[]) {
    const live = entries.filter((e) => e.mode === mode && e.inputType !== 'system' && e.inputType !== 'test');
    const test = entries.filter((e) => e.mode === mode && e.inputType === 'test');
    const itemTurns = live.filter((e) => e.state === 'ITEM' || e.state === 'CHOICE' || e.state === 'CONFIRM');
    const itemsDone = live.filter((e) => (e.state === 'ITEM' || e.state === 'CONFIRM') && e.intent === 'got_it' && e.result !== 'repeat').length;
    out[mode] = {
      sessions: new Set(live.map((e) => e.session)).size,
      exchanges: live.length,
      failed: live.filter((e) => e.failed).length,
      buttonFallback: live.filter((e) => e.result === 'button_prompt').length,
      alerts: live.filter((e) => e.result === 'alert').length,
      turnsPerItem: itemsDone ? +(itemTurns.length / itemsDone).toFixed(2) : 0,
      testTotal: test.length,
      testFailed: test.filter((e) => e.failed).length,
      wrongAccepted: test.filter((e) => e.expected && e.intent !== 'unknown' && e.intent !== e.expected).length,
    };
  }
  return out;
}
