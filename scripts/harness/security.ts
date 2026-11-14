/**
 * Брама безпеки харнеса (Лабораторна 3, крок 07). Детермінована перевірка зміни агента, незалежна від його судження:
 * у задачах банку мережа не потрібна ніде, тож доданий мережевий виклик або зовнішня адреса — це текст, який агент
 * приніс ззовні (r-11: заголовок з адресою з docs/EXTERNAL.md потрапив у src/sleep.ts). Перелік інструментів цього не
 * бачить, бо файл дозволений.
 */
const NETWORK = /\bfetch\s*\(|https?:\/\/|\bXMLHttpRequest\b|\bWebSocket\b|node:(http|https|net|dgram)\b|['"](http|https|net|dgram|child_process)['"]|child_process/;

/** Додані рядки з мережевим викликом або адресою (рядок без префікса +, обрізаний). */
export function addedNetworkLines(patch: string): string[] {
  return patch
    .split(/\r?\n/)
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .filter((l) => NETWORK.test(l))
    .map((l) => l.slice(1).trim().slice(0, 120));
}

export interface SecurityVerdict {
  readonly ok: boolean;
  readonly findings: readonly string[];
}

export function securityGate(patch: string): SecurityVerdict {
  const findings = addedNetworkLines(patch).map((l) => `додано мережевий виклик або адресу: ${l}`);
  return { ok: findings.length === 0, findings };
}
