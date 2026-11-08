// POST /api/intent — turns one transcript into one intent. Runs on the server
// only; the API key never reaches the browser. The model never speaks, never
// picks items and never suggests alternatives: it only classifies.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

export const MODEL = 'claude-haiku-5-5';
const INTENTS = ['got_it', 'no', 'help', 'option_left', 'option_right', 'later', 'unknown'] as const;
type Intent = (typeof INTENTS)[number];

const RequestSchema = z.object({
  transcript: z.string().max(500),
  state: z.string().max(40),
  options: z.object({ left: z.string().max(80).optional(), right: z.string().max(80).optional() }).default({}),
  allowed: z.array(z.enum(INTENTS)).optional(),
});

const ResultSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
});

export type IntentRequest = z.infer<typeof RequestSchema>;
export type IntentResult = z.infer<typeof ResultSchema>;

const SYSTEM = `You classify one short spoken reply to a packing helper used by adults with intellectual disabilities.
Replies are often short, partial or misheard. Return the single best intent and your confidence (0 to 1).

Intents:
- got_it: yes, done, found it, I have it, agreeing, ready now
- no: no, can't find it, don't have it, disagreeing
- help: wants a person, wants the support worker, is upset or stuck
- option_left: picks the LEFT option (by name, part of its name, or "the first one")
- option_right: picks the RIGHT option (by name, part of its name, or "the second one")
- later: not now, wait, later
- unknown: anything else, or you are not sure

Only return an intent from the allowed list you are given. If none fits, return unknown with low confidence.
Never invent items or options.

Examples:
state CHOICE, left raincoat, right hoodie: "the coat one" -> option_left 0.9
state CHOICE, left raincoat, right hoodie: "hood" -> option_right 0.85
state ITEM: "uh huh" -> got_it 0.8
state ITEM: "it's not here" -> no 0.9
state START: "not now" -> later 0.95
state START: "in a minute" -> later 0.8
state DOOR_KEYS: "in my pocket" -> got_it 0.85
state ITEM: "banana telephone" -> unknown 0.2`;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function classify(body: unknown): Promise<{ status: number; json: unknown }> {
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { error: 'bad_request' } };
  const { transcript, state, options, allowed } = parsed.data;
  if (!hasKey()) return { status: 503, json: { error: 'no_api_key' } };

  const user = JSON.stringify({ transcript, state, options, allowed: allowed ?? INTENTS });
  const started = Date.now();
  try {
    const response = await getClient().messages.parse(
      {
        model: MODEL,
        max_tokens: 256,
        // Classification needs no reasoning; keep it fast. (Haiku 5.5 rejects
        // non-default temperature, so it is left at the default.)
        thinking: { type: 'disabled' },
        output_config: { effort: 'low', format: zodOutputFormat(ResultSchema) },
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
      },
      { timeout: 3000, maxRetries: 0 },
    );
    const out = response.parsed_output;
    const check = ResultSchema.safeParse(out);
    if (response.stop_reason === 'refusal' || !check.success) {
      return { status: 200, json: { intent: 'unknown' as Intent, confidence: 0, error: 'invalid_output', latencyMs: Date.now() - started } };
    }
    return { status: 200, json: { ...check.data, model: MODEL, latencyMs: Date.now() - started } };
  } catch (err) {
    const name = err instanceof Anthropic.APIConnectionTimeoutError ? 'timeout' : err instanceof Anthropic.APIError ? `api_${err.status ?? 'error'}` : 'error';
    return { status: 502, json: { error: name, message: err instanceof Error ? err.message : String(err) } };
  }
}
