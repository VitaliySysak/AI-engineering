/**
 * Ролі мультиагентного питання і межі кожної (Лабораторна 4, крок 03). Це файл конфігурації,
 * а не опис у промпті: тест tests/multi/roles.test.ts звіряє його з реальними інструментами.
 */

/** Інструменти ролі «читач» — лише читальні. Жодного запису, жодного запуску команд. */
export const READER_TOOLS = ['read_file', 'search_code', 'git_history', 'list_dir'] as const;

/** Імена, які НЕ можуть потрапити до читача: усе, що пише або змінює стан. */
export const WRITE_LIKE = /write|edit|patch|delete|remove|exec|shell|bash|commit|push|run/i;

export type Role = {
  name: 'reader' | 'synthesizer' | 'verifier';
  does: string;
  tools: readonly string[];
  limit: string;
};

export const ROLES: readonly Role[] = [
  {
    name: 'reader',
    does: 'одна смуга читання форка: історія, залежності, тіло модуля, тести',
    tools: READER_TOOLS,
    limit: 'без запису; isStepCount(stepsPerBranch); корінь — тека форка',
  },
  {
    name: 'synthesizer',
    does: 'після fan-in зводить гілки в чернетку з твердженнями; після вердикту — ЄДИНА смуга запису',
    // Модель зводу інструментів не отримує взагалі; writeAnswer викликає оркестратор від імені цієї ролі,
    // і лише тоді, коли верифікатор не заблокував чернетку.
    tools: ['writeAnswer'],
    limit: 'стартує лише після fan-in; один хід; пише лише в docs/lab4/answers і docs/lab4/traces',
  },
  {
    name: 'verifier',
    does: 'перевіряє кожне твердження зводу проти доказу, який дістає оркестратор',
    tools: [],
    limit: 'модель іншої родини; один запит на одне твердження; блокує все, що не pass',
  },
];

/** Інструменти дослідника (крок 04): ті самі читальні + git blame і git show. Жодного запису. */
export const RESEARCH_TOOLS = [...READER_TOOLS, 'git_blame', 'git_show'] as const;
