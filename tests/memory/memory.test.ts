// tests/memory/memory.test.ts — Лабораторна 4, крок 04. Без мережі: тимчасові git-репозиторії, моделі підроблені.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { propose } from '../../src/memory/propose-tool';
import { describeRecall, isStale, recall, reject, remember, type Entry } from '../../src/memory/store';
import { inFork, researchForkTools } from '../../src/multi/fork-tools';
import { RESEARCH_TOOLS, WRITE_LIKE } from '../../src/multi/roles';
import { checkCite } from '../../src/research/cite-check';
import { checkClaims, research, RESEARCH_BUDGET } from '../../src/research/research';
import { isCompound } from '../../scripts/multi/summarize-runs';

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

/** Репозиторій із двома комітами: a.js змінено в другому, b.js — лише в першому. */
function repo(): { dir: string; first: string; second: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mem-repo-'));
  git(dir, 'init', '-q');
  mkdirSync(join(dir, 'lib'));
  writeFileSync(join(dir, 'lib', 'a.js'), "export const a = 1;\n// hash\nexport const b = '#';\n");
  writeFileSync(join(dir, 'lib', 'b.js'), 'export const b = 2;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  const first = git(dir, 'rev-parse', 'HEAD');
  writeFileSync(join(dir, 'lib', 'a.js'), "export const a = 3;\n// hash\nexport const b = '#';\n");
  git(dir, 'commit', '-q', '-am', 'second');
  return { dir, first, second: git(dir, 'rev-parse', 'HEAD') };
}

const e = (over: Partial<Entry>): Entry => ({ at: '2026-11-26T00:00:00Z', kind: 'decision', text: 'рішення', sha: 'abcdef1', repo: 'course', paths: [], source: 'тест', ...over });
const tmp = (name: string) => join(mkdtempSync(join(tmpdir(), 'mem-')), name);

describe('памʼять: детерміновані відмови', () => {
  it.each([
    ['ключ', 'ключ AIzaSyA1234567890abcdefghijklmnopqrstu'],
    ['ключ=значення', 'api_key = hunter2hunter2'],
    ['файл секретів', 'ключі лежать у .env.local'],
    ['код', 'export function f() {}'],
    ['ціле файло', 'a\nb\nc\nd'],
    ['пошта', 'автор — someone@example.com'],
  ])('%s — відмова', (_, text) => expect(reject({ text })).not.toBeNull());
  it('звичайне твердження проходить', () => {
    expect(reject({ text: 'Твердження зводу мають бути атомарними: один факт — одне посилання.' })).toBeNull();
  });
  it('повний SHA у тексті — помилкова відмова, свідомий напрямок помилки', () => {
    expect(reject({ text: 'коміт 4baf9678ef9a85fbc9e3514fe9114805bbe55322' })).toBe('схоже на ключ або токен');
  });
  it('remember: невалідна схема — виняток; відмова — виняток і рядок у журналі відмов', () => {
    const file = tmp('store.jsonl');
    const rejections = tmp('rej.jsonl');
    expect(() => remember({ ...e({}), kind: 'idea' as never }, { file, rejections })).toThrow();
    expect(() => remember(e({ text: 'export const x = 1;' }), { file, rejections })).toThrow(/відхилено/);
    expect(existsSync(file)).toBe(false);
    expect(JSON.parse(readFileSync(rejections, 'utf8').trim())).toMatchObject({ why: 'схоже на фрагмент коду' });
    remember(e({}), { file, rejections });
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1);
  });
});

describe('памʼять: застарілість і дві межі', () => {
  it('застаріле — лише якщо ПІСЛЯ sha змінювали саме цей шлях, у ТОМУ репозиторії', () => {
    const r = repo();
    const roots = { course: mkdtempSync(join(tmpdir(), 'empty-')), fork: r.dir };
    expect(isStale(e({ repo: 'fork', sha: r.first, paths: ['lib/a.js'] }), { roots })).toBe(true);
    expect(isStale(e({ repo: 'fork', sha: r.first, paths: ['lib/b.js'] }), { roots })).toBe(false); // давно не змінюваний файл — свіжий
    expect(isStale(e({ repo: 'fork', sha: r.second, paths: ['lib/a.js'] }), { roots })).toBe(false);
    expect(isStale(e({ repo: 'fork', sha: 'deadbee', paths: ['lib/b.js'] }), { roots })).toBe(true); // невідомий коміт — застаріле
    expect(isStale(e({ repo: 'course', sha: r.first, paths: ['lib/b.js'] }), { roots })).toBe(true); // не той репозиторій — застаріле
  });
  it('recall: застарілі не вантажимо, найновіші першими, обидві межі з числами', () => {
    const r = repo();
    const file = tmp('store.jsonl');
    const roots = { course: r.dir, fork: r.dir };
    remember(e({ text: 'старе про a', sha: r.first, paths: ['lib/a.js'] }), { file, roots });
    for (let i = 1; i <= 4; i++) remember(e({ text: `рішення ${i}`, sha: r.second }), { file, roots });
    const got = recall({ file, roots, maxEntries: 2, maxBytes: 10_000 });
    expect(got).toMatchObject({ used: 2, total: 5, staleDropped: 1, cutEntries: 2 });
    expect(got.text.split('\n')[0]).toContain('рішення 4');
    expect(describeRecall(got)).toContain('у промпт пішло 2 записів із 5');
  });
  it('propose: sha ставить код (HEAD репозиторію), не модель; невалідна пропозиція — відмова, а не запис', () => {
    const r = repo();
    const file = tmp('store.jsonl');
    expect(propose({ kind: 'outcome', text: 'тест зелений', repo: 'fork', paths: ['lib/a.js'], source: 'прогін' }, { file, roots: { course: r.dir, fork: r.dir } })).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(file, 'utf8').trim()).sha).toBe(r.second);
    expect(propose({ kind: 'outcome', text: 'x', repo: 'fork', paths: [], source: 's', sha: 'abc1234' }, { file })).toMatchObject({ ok: false });
  });
});

describe('дослідження: корінь читання і цитати', () => {
  it('інструменти дослідника — рівно RESEARCH_TOOLS, без запису', () => {
    const tools = Object.keys(researchForkTools(repo().dir)).sort();
    expect(tools).toEqual([...RESEARCH_TOOLS].sort());
    expect(tools.filter((t) => WRITE_LIKE.test(t))).toEqual([]);
  });
  it('канонічний шлях: закодоване «..» і вихід назовні — відмова', () => {
    const { dir } = repo();
    expect(() => inFork(dir, '%2e%2e/secret')).toThrow(/закодований/);
    expect(() => inFork(dir, '../x')).toThrow();
    expect(inFork(dir, 'lib/a.js')).toContain('a.js');
  });
  it('cite-check: коміт і рядок на коміті існують; вигадані — брак', () => {
    const r = repo();
    expect(checkCite(r.dir, { sha: r.first })).toBeNull();
    expect(checkCite(r.dir, { sha: r.first, file: 'lib/a.js', line: 3 })).toBeNull();
    expect(checkCite(r.dir, { sha: r.first, file: 'lib/a.js', line: 99 })).toMatch(/не існує/);
    expect(checkCite(r.dir, { sha: 'deadbee' })).toMatch(/немає/);
    expect(checkCite(r.dir, { sha: r.first, file: '../x.js', line: 1 })).toMatch(/не відносний/);
  });
  it('checkClaims: файл+рядок — на нульовій точці, коміт — як є, без посилання — брак', () => {
    const r = repo();
    const got = checkClaims(r.dir, r.first, [{ text: 'a', file: 'lib/a.js', line: 2 }, { text: 'b', sha: r.second.slice(0, 7) }, { text: 'c' }]);
    expect(got.map((c) => c.why)).toEqual([null, null, 'посилання відсутнє']);
  });
});

describe('дослідження: раунди й критерій зупинки', () => {
  const lane = new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: 'text', text: 'знайдено lib/a.js:2' }], finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 10, text: 10, reasoning: undefined } }, warnings: [] }) });
  const json = (o: object) => new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: 'text', text: JSON.stringify(o) }], finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 80, noCache: 80, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } }, warnings: [] }) });
  const pass = json({ id: 'c1', verdict: 'pass', reason: 'так', evidence: '// hash' });

  const three = [1, 2, 3].map((line) => ({ text: `рядок ${line}`, file: 'lib/a.js', line }));
  it('три твердження з існуючими цитатами — один раунд, зупинка all-cited, верифікатор лише на них', async () => {
    const r = repo();
    const res = await research({ question: 'чому?', module: 'lib/a.js', root: r.dir, zeroSha: r.first, readerModel: lane, synthModel: json({ answer: 'бо так', claims: three }), verifierModel: pass, stopLog: tmp('s.jsonl') });
    expect(res).toMatchObject({ rounds: 1, stopReason: 'all-cited', citesTotal: 3, citesBad: 0, spent: { calls: 9 } });
    expect(res.verdicts).toHaveLength(3);
    expect(res.lanes.map((l) => l.lane)).toEqual(['history', 'blame', 'callers', 'tests', 'docs']);
  });
  it('одне твердження — замало навіть із цитатою: раунд добору', async () => {
    const r = repo();
    const res = await research({ question: 'чому?', module: 'lib/a.js', root: r.dir, zeroSha: r.first, readerModel: lane, synthModel: json({ answer: 'бо так', claims: [three[0]] }), verifierModel: pass, stopLog: tmp('s.jsonl') });
    expect(res).toMatchObject({ rounds: 2, stopReason: 'no-new-cites', citesBad: 0 });
  });
  it('вигадана цитата — раунд добору; нових цитат немає — стоп no-new-cites; модель не бачить браку', async () => {
    const r = repo();
    const res = await research({ question: 'чому?', module: 'lib/a.js', root: r.dir, zeroSha: r.first, readerModel: lane, synthModel: json({ answer: 'бо так', claims: [{ text: 'існує', file: 'lib/a.js', line: 2 }, { text: 'вигадано', file: 'lib/a.js', line: 99 }] }), verifierModel: pass, budget: RESEARCH_BUDGET, stopLog: tmp('s.jsonl') });
    expect(res).toMatchObject({ rounds: 2, stopReason: 'no-new-cites', citesTotal: 2, citesBad: 1 });
    expect(res.verdicts).toHaveLength(1); // верифікатор — лише на твердженні з існуючою цитатою
  });
});

describe('помилка, яку памʼять мала попередити', () => {
  it('складене твердження — два й більше різних .js-файлів в одному claim', () => {
    expect(isCompound('Імпортери: lib/adapters/http.js, lib/core/Axios.js')).toBe(true);
    expect(isCompound('lib/adapters/http.js імпортує settle.js')).toBe(true);
    expect(isCompound('http.js імпортує модуль у рядку 2')).toBe(false);
  });
});
