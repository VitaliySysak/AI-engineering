// tests/multi/multi.test.ts — Лабораторна 4, крок 03. Без мережі: моделі підроблені, форк — тимчасова тека.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { ask, budgetFor } from '../../src/multi/ask';
import { add, addLost, DEFAULT_BUDGET, empty, overBudget, type Budget } from '../../src/multi/budget';
import { fanOut, isQuotaError, QuotaError, type Branch } from '../../src/multi/fanout';
import { readLines, readOnlyForkTools, searchCode } from '../../src/multi/fork-tools';
import { score } from '../../src/multi/gold';
import { lanes, parseQuestions, singleLane, type Question } from '../../src/multi/question';
import { READER_TOOLS, ROLES, WRITE_LIKE } from '../../src/multi/roles';
import { parseVerdict } from '../../src/multi/verify-claims';
import { assertNotGemini, rateLimitedFetch, retry503Fetch, selectModes } from '../../scripts/multi/run-multi';

type GenResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;
const usage = (i: number | undefined, o: number | undefined) => ({
  inputTokens: { total: i, noCache: i, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: o, text: o, reasoning: undefined },
});
const text = (t: string, i: number | undefined = 100, o: number | undefined = 20): GenResult => ({
  content: [{ type: 'text', text: t }],
  finishReason: { unified: 'stop', raw: undefined },
  usage: usage(i, o),
  warnings: [],
});
const model = (t: string, i?: number, o?: number) => new MockLanguageModelV4({ doGenerate: async () => text(t, i, o) });

function fakeFork(): string {
  const root = mkdtempSync(join(tmpdir(), 'fork-'));
  mkdirSync(join(root, 'lib', 'helpers'), { recursive: true });
  mkdirSync(join(root, 'lib', 'core'), { recursive: true });
  writeFileSync(join(root, 'lib', 'helpers', 'buildURL.js'), "'use strict';\nimport utils from '../utils.js';\nexport default function buildURL(url) {\n  return url;\n}\n");
  writeFileSync(join(root, 'lib', 'core', 'Axios.js'), "import buildURL from '../helpers/buildURL.js';\n");
  writeFileSync(join(root, '.env.local'), 'SECRET=1\n');
  return root;
}

const Q: Question = { id: 'q1', module: 'lib/helpers/buildURL.js', gold_importers: ['core/Axios.js', 'adapters/http.js'], gold_tests: [] };
const tmpFile = (name: string) => join(mkdtempSync(join(tmpdir(), 'multi-')), name);

describe('budget: облік і межі', () => {
  it('невідомі токени не стають нулем: рахуються як «не повідомлено»', () => {
    const s = add(add(empty(), { inputTokens: 10, outputTokens: 5 }, 100), { inputTokens: undefined, outputTokens: undefined }, 50);
    expect(s).toEqual({ calls: 2, input: 10, output: 5, unreported: 1, ms: 150 });
  });
  it('упала гілка списує хід і йде в «не повідомлено»', () => {
    expect(addLost(empty(), 7)).toEqual({ calls: 1, input: 0, output: 0, unreported: 1, ms: 7 });
  });
  it('перевірка меж: ходи перед раундом, токени на fan-in, час', () => {
    const b: Budget = { ...DEFAULT_BUDGET, maxTurns: 3, tokenCeiling: 100 };
    expect(overBudget(empty(), b, 4, false)).toBe('turn-budget');
    expect(overBudget({ ...empty(), input: 90, output: 10 }, b, 0, false)).toBe('token-ceiling');
    expect(overBudget(empty(), b, 0, true)).toBe('wall-clock');
    expect(overBudget(empty(), b, 3, false)).toBe('none');
  });
  it('базова лінія — одна гілка з кроками всіх смуг', () => {
    expect(budgetFor('single', DEFAULT_BUDGET)).toMatchObject({ maxBranches: 1, stepsPerBranch: DEFAULT_BUDGET.stepsPerBranch * 4 });
  });
});

describe('ролі: читач без запису', () => {
  it('інструменти читача — рівно READER_TOOLS, жоден не схожий на запис', () => {
    const tools = Object.keys(readOnlyForkTools(fakeFork())).sort();
    expect(tools).toEqual([...READER_TOOLS].sort());
    expect(tools.filter((t) => WRITE_LIKE.test(t))).toEqual([]);
  });
  it('інструмент запису має рівно одна роль — звідник', () => {
    expect(ROLES.filter((r) => r.tools.some((t) => WRITE_LIKE.test(t))).map((r) => r.name)).toEqual(['synthesizer']);
    expect(ROLES.find((r) => r.name === 'verifier')?.tools).toEqual([]);
  });
});

describe('fork-tools: лише в межах форка', () => {
  it('рядки з номерами', () => {
    expect(readLines(fakeFork(), 'lib/helpers/buildURL.js', 3, 3)).toContain('    3  export default function buildURL(url) {');
  });
  it('пошук знаходить імпортера з файлом і рядком', () => {
    expect(searchCode(fakeFork(), 'buildURL.js', 'lib')).toContain('lib/core/Axios.js:1:');
  });
  it('поза форком і .env — відмова, а не вміст', async () => {
    const tools = readOnlyForkTools(fakeFork());
    const read = tools.read_file!.execute!;
    await expect(read({ path: '../outside.txt' }, { toolCallId: 'a', messages: [] } as never)).resolves.toMatch(/^відмова/);
    await expect(read({ path: '.env.local' }, { toolCallId: 'b', messages: [] } as never)).resolves.toMatch(/^відмова/);
  });
});

describe('fanOut: паралельне читання з межами', () => {
  const four: Branch[] = lanes(Q);
  it('чотири гілки одного раунду — чотири ходи й чотири відповіді', async () => {
    const r = await fanOut({ model: model('ok'), readOnlyTools: {}, rounds: [four], budget: DEFAULT_BUDGET, taskId: 't', stopLog: tmpFile('stop.jsonl') });
    expect(r.out.map((o) => o.lane)).toEqual(['history', 'deps', 'module', 'tests']);
    expect(r.spent).toMatchObject({ calls: 4, input: 400, output: 80, unreported: 0 });
    expect(r.stop).toBe('none');
  });
  it('стеля ходів менша за гілки — раунд не стартує, рядок у журналі', async () => {
    const log = tmpFile('stop.jsonl');
    const r = await fanOut({ model: model('ok'), readOnlyTools: {}, rounds: [four], budget: { ...DEFAULT_BUDGET, maxTurns: 3 }, taskId: 'q9-fanout', stopLog: log });
    expect(r).toMatchObject({ stop: 'turn-budget', stopRound: 0, out: [], failed: ['history', 'deps', 'module', 'tests'] });
    expect(JSON.parse(readFileSync(log, 'utf8').trim())).toMatchObject({ taskId: 'q9-fanout', limit: 'turn-budget', round: 0 });
  });
  it('стеля токенів спрацьовує на fan-in навіть при одному раунді', async () => {
    const r = await fanOut({ model: model('ok', 1000, 10), readOnlyTools: {}, rounds: [four], budget: { ...DEFAULT_BUDGET, tokenCeiling: 2000 }, taskId: 't', stopLog: tmpFile('s.jsonl') });
    expect(r).toMatchObject({ stop: 'token-ceiling', stopRound: 0 });
    expect(r.out).toHaveLength(4); // перевищення можливе на один раунд — чесне обмеження методу
  });
  it('упала гілка — у failed і в ходах; 429 — QuotaError для брейкера', async () => {
    const boom = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('boom'); } });
    const r = await fanOut({ model: boom, readOnlyTools: {}, rounds: [[four[0]!]], budget: DEFAULT_BUDGET, taskId: 't', stopLog: tmpFile('s.jsonl') });
    expect(r).toMatchObject({ failed: ['history'], spent: { calls: 1, unreported: 1 } });
    const quota = new MockLanguageModelV4({ doGenerate: async () => { throw Object.assign(new Error('Too Many Requests'), { statusCode: 429 }); } });
    await expect(fanOut({ model: quota, readOnlyTools: {}, rounds: [[four[0]!]], budget: DEFAULT_BUDGET, taskId: 't', stopLog: tmpFile('s.jsonl') })).rejects.toBeInstanceOf(QuotaError);
    expect(isQuotaError({ message: 'RESOURCE_EXHAUSTED' })).toBe(true);
  });
});

describe('ask: звід, верифікатор на fan-in, єдина смуга запису', () => {
  const draft = JSON.stringify({ answer: 'buildURL імпортує core/Axios.js', claims: [{ text: 'визначено buildURL', path: 'lib/helpers/buildURL.js', line: 3 }] });
  const verdict = (v: string) => model(`{"id":"c1","verdict":"${v}","reason":"так","evidence":"export default function buildURL"}`);
  const paths = () => ({ answersDir: join(mkdtempSync(join(tmpdir(), 'ans-'))), runsLog: tmpFile('runs.jsonl'), stopLog: tmpFile('stop.jsonl') });

  it('pass → відповідь записано, рядок у журналі прогонів', async () => {
    const p = paths();
    const row = await ask({ mode: 'fanout', q: Q, root: fakeFork(), readerModel: model('читання'), synthModel: model(draft), verifierModel: verdict('pass'), budget: DEFAULT_BUDGET, ...p });
    expect(row).toMatchObject({ blocked: false, stop: 'none', spent: { calls: 6 }, quality: { importers: 1, importersTotal: 2 } });
    expect(existsSync(row.answerFile!)).toBe(true);
    expect(readFileSync(p.runsLog, 'utf8')).toContain('"qid":"q1"');
  });
  it('unknown від верифікатора → падаємо закрито: відповіді немає', async () => {
    const row = await ask({ mode: 'fanout', q: Q, root: fakeFork(), readerModel: model('читання'), synthModel: model(draft), verifierModel: verdict('unknown'), budget: DEFAULT_BUDGET, ...paths() });
    expect(row).toMatchObject({ blocked: true, answerFile: null });
  });
  it('на верифікатор не лишилось ходів → твердження unknown, блок, зупинка turn-budget', async () => {
    const row = await ask({ mode: 'fanout', q: Q, root: fakeFork(), readerModel: model('читання'), synthModel: model(draft), verifierModel: verdict('pass'), budget: { ...DEFAULT_BUDGET, maxTurns: 5 }, ...paths() });
    expect(row).toMatchObject({ blocked: true, stop: 'turn-budget', answerFile: null, spent: { calls: 5 } });
    expect(row.verdicts[0]).toMatchObject({ verdict: 'unknown' });
  });
  it('впалий виклик верифікатора — unknown саме цього твердження і рядок помилки в журналі', async () => {
    const down = new MockLanguageModelV4({ doGenerate: async () => { throw Object.assign(new Error('No endpoints found matching your data policy'), { statusCode: 404 }); } });
    const row = await ask({ mode: 'fanout', q: Q, root: fakeFork(), readerModel: model('читання'), synthModel: model(draft), verifierModel: down, budget: DEFAULT_BUDGET, ...paths() });
    expect(row).toMatchObject({ blocked: true, spent: { calls: 6, unreported: 1 } });
    expect(row.errors).toEqual([{ stage: 'verify:c1', name: 'Error', status: 404, message: 'No endpoints found matching your data policy' }]);
  });
  it('звід із зайвими твердженнями не падає: беремо перші три', async () => {
    const many = JSON.stringify({ answer: 'a', claims: [1, 2, 3, 4, 5].map((n) => ({ text: `t${n}`, path: 'lib/helpers/buildURL.js', line: n })) });
    const row = await ask({ mode: 'fanout', q: Q, root: fakeFork(), readerModel: model('читання'), synthModel: model(many), verifierModel: verdict('pass'), budget: { ...DEFAULT_BUDGET, maxTurns: 10 }, ...paths() });
    expect(row.verdicts).toHaveLength(3);
    expect(row.errors).toEqual([]);
  });
  it('базова лінія — один читач, той самий звід і верифікатор', async () => {
    const row = await ask({ mode: 'single', q: Q, root: fakeFork(), readerModel: model('читання'), synthModel: model(draft), verifierModel: verdict('pass'), budget: DEFAULT_BUDGET, ...paths() });
    expect(row).toMatchObject({ mode: 'single', blocked: false, spent: { calls: 3 } });
    expect(singleLane(Q).prompt).toContain('Смуга «тести»');
  });
});

describe('допоміжне', () => {
  it('вердикт поза схемою — unknown', () => {
    expect(parseVerdict('c1', 'не JSON').verdict).toBe('unknown');
    expect(parseVerdict('c1', '```json\n{"verdict":"pass","reason":"r","evidence":"e"}\n```').verdict).toBe('pass');
  });
  it('якість — частка еталонних імпортерів у відповіді', () => {
    expect(score(Q, { answer: 'зачепить Axios.js і http.js', claims: [{ text: 'x' }] })).toMatchObject({ importers: 2, importersTotal: 2 });
  });
  it('набір питань розбирається, верифікатор не з родини Google', () => {
    expect(parseQuestions(readFileSync('docs/lab4/multi-questions.jsonl', 'utf8'))).toHaveLength(5);
    expect(() => assertNotGemini('google/gemini-3.5-flash-lite')).toThrow();
    expect(() => assertNotGemini('nvidia/nemotron-3-super-120b-a12b:free')).not.toThrow();
  });
  it('перемикач: типово один агент, розгалуження лише з MULTI_FANOUT=1', () => {
    expect(selectModes(undefined, undefined)).toEqual(['single']);
    expect(selectModes(undefined, '1')).toEqual(['fanout']);
    expect(selectModes('both', undefined)).toEqual(['single', 'fanout']);
    expect(() => selectModes('fast', undefined)).toThrow();
  });
  it('503 повторюється до двох разів, 429 — ні', async () => {
    const seq = (codes: number[]) => {
      let i = 0;
      return (async () => new Response('x', { status: codes[Math.min(i++, codes.length - 1)] ?? 200 })) as typeof fetch;
    };
    let retries = 0;
    expect((await retry503Fetch(seq([503, 503, 200]), [1, 1], () => retries++)('u')).status).toBe(200);
    expect(retries).toBe(2);
    expect((await retry503Fetch(seq([503, 503, 503, 200]), [1, 1])('u')).status).toBe(503);
    expect((await retry503Fetch(seq([429, 200]), [1, 1])('u')).status).toBe(429);
  });
  it('ліміт запитів розводить старти', async () => {
    const starts: number[] = [];
    const f = rateLimitedFetch(600, (async () => { starts.push(Date.now()); return new Response('ok'); }) as typeof fetch);
    await Promise.all([f('a'), f('b'), f('c')]);
    expect(starts[2]! - starts[0]!).toBeGreaterThanOrEqual(190);
  });
});
