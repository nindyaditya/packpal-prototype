# PackPal test script

Use the same script in **rules-only** and **GenAI** mode, then export the log (Staff → Log & evaluation → Export CSV) and compare.

## A. Scripted interpreter set (automatic)

Staff → Log & evaluation → **Run in rules-only mode**, then **Run in GenAI mode**. Record for each mode:

| Measure | Rules-only | GenAI |
|---|---|---|
| Correct / 108 | | |
| Failed (unknown when a real intent was expected) | | |
| Wrong intents accepted | | |
| Errors (timeouts, network) | | |

Extend `config/testset.json` toward about 40 replies per state as the evaluation plan asks.

## B. Wizard-of-Oz walkthrough (a classmate plays Sam)

Reset the routine, set **Rain forecast** on and **Plan change** off. The facilitator reads PackPal's lines aloud if speech output is off.

1. Chime. Sam: “not now”. Expect: “Okay. I'll ask again in 30 minutes.” Press Chime now again.
2. Sam: “yeah”. Bag. Sam: “uh huh”. Towel. Sam: “got it”.
3. Umbrella. Sam: “it's not here”. Expect “Left for raincoat. Right for hoodie. Or ask Rina.”
4. Sam: “the coat one”. Expect “Raincoat. Okay?” (GenAI) or a repeat (rules-only).
5. Sam: “no the other”. Expect the same choice again. Sam presses the right square. “Hoodie. Okay?” → “yes”.
6. Recap → Got it. Turn **Plan change** on. Simulate tomorrow morning.
7. Plan message (staff alert appears). Got it → ready spot empty? → Sam: “still my towel” → “Put everything in your bag…” → Got it.
8. Keys? Sam: “in my pocket”. Expect “Have fun at swimming.”

Repeat once with **buttons only** (no speech, no typing). It must complete with zero spoken input.

## C. Measures to report

- Failed exchanges per session
- Turns per item
- Times the button fallback (“Press a button.”) was reached
- Wrong intents accepted, reported separately
