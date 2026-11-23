/**
 * БЮДЖЕТ мультиагентного питання (Лабораторна 4, крок 03): кроки, ходи, токени, час — плюс гілки.
 * У грошах межі тут немає: шлях безкоштовний (Gemini free tier + OpenRouter :free), сума завжди нуль.
 */
export type Budget = {
  /** Скільки гілок ЧИТАННЯ дозволено в одному раунді. */
  maxBranches: number;
  /** ХОДИ: скільки викликів generateText дозволено на все питання (гілки + звід + верифікатор). */
  maxTurns: number;
  /** КРОКИ: isStepCount(N) у stopWhen кожної гілки. */
  stepsPerBranch: number;
  /** ТОКЕНИ: стеля на все питання — входи + виходи всіх гілок і зводу. */
  tokenCeiling: number;
  /** ЧАС: стеля на все питання, мілісекунди. */
  wallClockMs: number;
};

/**
 * Типовий бюджет (обґрунтування — docs/lab4/multiagent.md, розділ «Бюджет»):
 * 4 гілки + 1 звід + до 3 тверджень на верифікатор = 8 ходів.
 */
export const DEFAULT_BUDGET: Budget = {
  maxBranches: 4,
  maxTurns: 8,
  stepsPerBranch: 4,
  tokenCeiling: 250_000,
  wallClockMs: 240_000,
};

/**
 * Структурний тип: беремо лише ті поля, які читаємо. У звіті AI SDK 7 вони number | undefined —
 * провайдер може не повідомити жодного.
 */
export type Usage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens?: number | undefined;
};

export type Spent = {
  /** ХОДИ: скільки викликів моделі зроблено — саме це вичерпує добову квоту. */
  calls: number;
  input: number;
  output: number;
  /** Скільком викликам провайдер токенів НЕ повідомив. У звіт — як «не повідомлено». */
  unreported: number;
  /** СУМА часу по викликах — це час обчислення, а НЕ час до відповіді (той — wallMs). */
  ms: number;
};

export const empty = (): Spent => ({ calls: 0, input: 0, output: 0, unreported: 0, ms: 0 });

export function add(s: Spent, u: Usage, ms: number): Spent {
  const known = u.inputTokens !== undefined || u.outputTokens !== undefined;
  return {
    calls: s.calls + 1,
    input: s.input + (u.inputTokens ?? 0),
    output: s.output + (u.outputTokens ?? 0),
    unreported: s.unreported + (known ? 0 : 1),
    ms: s.ms + ms,
  };
}

/** Гілка, що впала або була скасована, токени вже витратила — просто не звітує. Хід списано з квоти. */
export function addLost(s: Spent, ms: number): Spent {
  return { ...s, calls: s.calls + 1, unreported: s.unreported + 1, ms: s.ms + ms };
}

/** Помилка етапу в журналі: лише клас, код і перший рядок повідомлення — без тіла запиту й ключів. */
export type StageError = { stage: string; name: string; status: number | null; message: string };

export function describeError(stage: string, error: unknown): StageError {
  const e = (error ?? {}) as { name?: unknown; statusCode?: unknown; message?: unknown; responseBody?: unknown };
  const first = (typeof e.message === 'string' ? e.message : String(error)).split(/\r?\n/)[0] ?? '';
  const body = typeof e.responseBody === 'string' ? ` · ${e.responseBody.replace(/\s+/g, ' ')}` : '';
  const message = `${first}${body}`.replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1…').replace(/(AIza[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, '$1…').slice(0, 300);
  return { stage, name: typeof e.name === 'string' ? e.name : 'Error', status: typeof e.statusCode === 'number' ? e.statusCode : null, message };
}

export const tokensUsed = (s: Spent): number => s.input + s.output;

export type Stop = 'none' | 'token-ceiling' | 'turn-budget' | 'wall-clock';

/**
 * Перевірка меж. Викликається ПЕРЕД раундом (next = скільки ходів раунд забере) і на fan-in (next = 0) —
 * інакше при одному раунді стеля токенів не спрацює ніколи.
 */
export function overBudget(spent: Spent, budget: Budget, next: number, timedOut: boolean): Stop {
  if (spent.calls + next > budget.maxTurns) return 'turn-budget';
  if (tokensUsed(spent) >= budget.tokenCeiling) return 'token-ceiling';
  if (timedOut) return 'wall-clock';
  return 'none';
}
