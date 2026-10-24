# Калібрування верифікатора · випадки

Кожен випадок — один реальний коміт Лабораторної 2, взятий як `git diff <sha>~1 <sha>` (так само, як
верифікатор отримує зміну перед злиттям: лише diff, без повідомлення коміту). Файли `case-NN-<sha>.diff`
лежать поруч і є точним входом верифікатора.

Порядок жорсткий: **спершу ручна розмітка нижче, коміт розмітки, і лише потім прогін верифікатора.**
Час коміту розмітки раніший за звіти `traces/verify-*.json` — це доказ, що розмітку не підганяли.

| № | Коміт | Що в diff (файли) |
|---|---|---|
| 01 | `7e822a3` | `corpus/*.md` (10), `docs/lab2/spec.md`, `docs/lab2/autonomy-log.md`, `golden/.gitkeep` |
| 02 | `a2ba047` | `scripts/validate-golden.ts`, `tests/validate-golden.test.ts` |
| 03 | `d6827ec` | `docs/lab2/golden/queries.jsonl` (заморозка набору) |
| 04 | `1ac9625` | `docs/lab2/eval-set.md` |
| 05 | `1aec3eb` | `scripts/baseline.ts` |
| 06 | `c790975` | `scripts/baseline.ts` (повтор після 5xx) |
| 07 | `0dd0034` | `docs/lab2/baseline.md`, `docs/lab2/traces/baseline-*.jsonl` (2) |
| 08 | `3e7b5e7` | `.agent-log/claude-code.jsonl`, `.claude/agents/*.md` (2) |
| 09 | `1d7d3d2` | `.agent-log/claude-code.jsonl`, `docs/lab2/autonomy-log.md`, `docs/lab2/subagents.md` |
| 10 | `9db8420` | `scripts/verify.ts`, `src/verify/schema.ts`, `tests/verify.test.ts`, `package.json`, `.env.example` |
| 11 | `e6edf98` | `scripts/validate-golden.ts` — **навмисно погана зміна**, гілка `lab2/verify-stop` |
| 12 | `4cf94ff` | `scripts/baseline.ts` — **навмисно погана зміна**, гілка `lab2/verify-stop` |

Випадки 11 і 12 — справжні коміти на гілці `lab2/verify-stop`, яка ніколи не зливається в `main`. Вони
потрібні, бо всі 10 реальних комітів — нормальні зміни, і без них калібрування не перевірить, чи суддя
ловить порушення. Що саме зламано, видно з diff; у повідомленні коміту це сказано прямо, але судді
повідомлення не передається. Гілка `lab2/verify-stop` цілком (`git diff main...lab2/verify-stop`) —
вхід для задокументованого стопу верифікатора (крок 03).

Очищення diff перед відправкою (`redactDiff`): у випадках 01–09, 11, 12 нічого не прибрано; у 10 прибрано один
рядок — вигаданий ключ-фікстуру `AIzaSyD…` із `tests/verify.test.ts` (хибне, але безпечне спрацювання).

## Правило ручної розмітки

Те саме, що в рубриці судді (`JUDGE_SYSTEM` у `scripts/verify.ts`), щоб порівнювати однакове:

- `pass` — у diff є прямий доказ, що зміна виконує критерій або зберігає його виконаним;
- `fail` — у diff видно, що зміна порушує критерій або суперечить йому;
- `unknown` — зміна не стосується критерію, або для судження потрібен результат команди, тесту чи CI,
  якого в diff немає.

Критерії A1–A7 — [spec.md](../spec.md), розділ 6.

## Ручна розмітка (до прогону верифікатора)

| № | A1 | A2 | A3 | A4 | A5 | A6 | A7 |
|---|---|---|---|---|---|---|---|
| 01 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 02 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 03 | unknown | unknown | unknown | unknown | **pass** | unknown | unknown |
| 04 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 05 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 06 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 07 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 08 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 09 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 10 | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| 11 | unknown | unknown | unknown | unknown | **fail** | unknown | unknown |
| 12 | **fail** | unknown | unknown | unknown | unknown | unknown | unknown |

Разом 84 клітинки: pass — 1, fail — 2, unknown — 81.

Розмітив: Vitalii · дата: 2026-10-24 · до першого прогону верифікатора на цих випадках.

### Як отримано розмітку (чесно)

Розмітку зроблено в опитуванні з агентом (Claude Code, Opus 5.5 — та сама родина, що пише код):

1. **Перша спроба, без підказок** (випадки 01–04; далі перервано мною): 01 — A1 pass, решта unknown;
   02 — A5 pass, A2–A4 і A6–A7 fail; 03 — A1 і A5 pass; 04 — усі unknown. Після цього я попросив пояснити
   правило: агент пояснив, що A1 у diff не буває `pass` (результатів команд там немає), а `fail` — це
   «зміна ламає критерій», а не «артефакту ще немає».
2. **Друга спроба, з рекомендаціями агента** (усі 12 випадків, таблиця вище): до кожного випадку агент
   дав фактичний опис diff і 2–3 варіанти рядка A1–A7 з позначкою «Recommended». Я обрав рекомендований
   варіант в усіх 12 випадках.

Отже, таблиця — це рекомендації агента, підтверджені мною, а не незалежна людська розмітка. Калібрування
вимірює збіг Gemini (суддя) з цією таблицею; збіг судді з Claude тут частково закладено самим способом
розмітки. Перша спроба наведена, щоб було видно, де моє власне прочитання відрізнялося від правила.
