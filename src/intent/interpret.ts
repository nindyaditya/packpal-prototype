// One entry point for turning a reply into an intent, in either mode.
// Rules from the PRD:
//  1. Only intents the current state allows; anything else is unknown.
//  2. Confidence below the threshold (default 0.7) is unknown.
//  4. Invalid JSON, a timeout over 3 s or a network error is unknown.
//  5. Rules-only mode uses the fixed phrase list instead of the model.

import { INTENTS, type Intent, type Interpretation, type Mode, type Options } from '../types';
import { matchRules } from './rules';

export const GENAI_TIMEOUT_MS = 3000;

export interface InterpretInput {
  transcript: string;
  state: string;
  options: Options;
  allowed: Intent[];
  mode: Mode;
  threshold: number;
}

function gate(raw: Intent, confidence: number, allowed: Intent[], threshold: number, path: Interpretation['path']): Interpretation {
  if (raw !== 'unknown' && !allowed.includes(raw)) return { intent: 'unknown', rawIntent: raw, confidence, path: 'not_allowed' };
  if (raw !== 'unknown' && confidence < threshold) return { intent: 'unknown', rawIntent: raw, confidence, path: 'genai_low_confidence' };
  return { intent: raw, rawIntent: raw, confidence, path };
}

export async function callGenAI(input: Omit<InterpretInput, 'mode' | 'threshold'>, fetchImpl: typeof fetch = fetch): Promise<{ intent: Intent; confidence: number; latencyMs: number }> {
  const ctrl = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => ctrl.abort(), GENAI_TIMEOUT_MS);
  try {
    const res = await fetchImpl('/api/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: input.transcript, state: input.state, options: input.options, allowed: input.allowed }),
      signal: ctrl.signal,
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? `http_${res.status}`);
    // Validate strictly before use.
    const j = json as { intent?: unknown; confidence?: unknown };
    if (typeof j?.intent !== 'string' || !(INTENTS as readonly string[]).includes(j.intent)) throw new Error('invalid_json');
    if (typeof j.confidence !== 'number' || j.confidence < 0 || j.confidence > 1) throw new Error('invalid_json');
    return { intent: j.intent as Intent, confidence: j.confidence, latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    const e = err as Error;
    throw new Error(e.name === 'AbortError' ? 'timeout' : e.message || 'network_error');
  } finally {
    clearTimeout(timer);
  }
}

export async function interpret(input: InterpretInput, fetchImpl?: typeof fetch): Promise<Interpretation> {
  if (input.mode === 'rules') {
    const raw = matchRules(input.transcript, input.options);
    const out = gate(raw, raw === 'unknown' ? 0 : 1, input.allowed, 0, 'rules');
    return out;
  }
  try {
    const { intent, confidence, latencyMs } = await callGenAI(input, fetchImpl);
    return { ...gate(intent, confidence, input.allowed, input.threshold, 'genai'), latencyMs };
  } catch (err) {
    return { intent: 'unknown', confidence: 0, path: 'genai_error', error: (err as Error).message };
  }
}
