// Every line PackPal says lives here, so wording stays fixed and easy to review.
// Rule: 10 words or fewer, plain words, same wording every time.

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const prompts = {
  start: (activity: string) => `Tomorrow is ${activity}. Let's get ready. Now or later?`,
  later: () => `Okay. I'll ask again in 30 minutes.`,
  item: (item: string) => `Find your ${item}. Got it?`,
  rainItem: (item: string) => `Rain tomorrow. Find your ${item}. Got it?`,
  // The buttons are physical and never change, so the prompt says which button
  // means which option. The missing item was named in the line before, so it
  // is not repeated here (keeps the line within 10 words).
  choiceTwo: (_item: string, left: string, right: string, staff: string) =>
    `Left for ${left}. Right for ${right}. Or ask ${staff}.`,
  choiceOne: (_item: string, left: string, staff: string) => `Left for ${left}. Or ask ${staff}.`,
  confirm: (choice: string) => `${cap(choice)}. Okay?`,
  recap: (items: string[]) => `${cap(items.join(', '))}. All ready.`,
  goodnight: () => `Good night. See you in the morning.`,
  morningPlan: (staff: string) => `Plan changed today. ${staff} will tell you more.`,
  morningRainOn: () => `Rain today. Let's add one thing.`,
  morningRainOff: () => `No rain today. Same plan.`,
  morningRainItem: (item: string) => `Find your ${item}. Got it?`,
  doorEmpty: () => `Is the ready spot empty?`,
  doorEmptyNo: () => `Put everything in your bag. Then press got it.`,
  doorKeys: () => `Do you have your keys?`,
  done: (activity: string) => `Have fun at ${activity}.`,
  alert: (staff: string) => `I'll get ${staff}.`,
  pressButton: () => `Press a button.`,
};

export const wordCount = (line: string) => line.trim().split(/\s+/).filter(Boolean).length;
