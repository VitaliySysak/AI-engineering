/** Витяжка траси без мережі: дерево і те, що вміст у публічний репозиторій не потрапляє. */
import { describe, expect, it } from 'vitest';

import { safeAttributes, treeLines, type Observation } from '../../scripts/harness/pull-trace';

const at = (s: number) => new Date(Date.UTC(2026, 10, 9, 10, 0, s)).toISOString();
const span = (id: string, parent: string | null, name: string, start: number, metadata: unknown = {}, level = 'DEFAULT'): Observation => ({ id, parentObservationId: parent, name, type: 'SPAN', startTime: at(start), endTime: at(start + 1), level, metadata });

describe('атрибути витяжки', () => {
  it('пропускає лише дозволені, зокрема із вкладеної обгортки', () => {
    expect(safeAttributes({ attributes: { tool_name: 'Bash', success: 'false', error: 'denied' } })).toEqual({ tool_name: 'Bash', success: 'false', error: 'denied' });
  });

  it('ключ із префіксом бекенда розпізнається, а не відкидається', () => {
    expect(safeAttributes({ 'attributes.tool_name': 'Bash', 'attributes.success': false })).toEqual({ tool_name: 'Bash', success: 'false' });
  });

  it('атрибут лише зі схожим кінцем назви не видається за інший', () => {
    expect(safeAttributes({ 'attributes.gen_ai.usage.cache_read.input_tokens': 0, 'attributes.gen_ai.usage.input_tokens': 640 })).toEqual({ 'gen_ai.usage.input_tokens': '640' });
  });

  it('префікс не відкриває вміст', () => {
    expect(JSON.stringify(safeAttributes({ 'attributes.full_command': 'ТАЄМНИЦЯ', 'attributes.gen_ai.input.messages': 'ТАЄМНИЦЯ', 'attributes.user_prompt': 'ТАЄМНИЦЯ' }))).not.toContain('ТАЄМНИЦЯ');
  });

  it('вміст не потрапляє у витяжку', () => {
    const attrs = JSON.stringify(safeAttributes({ attributes: { 'gen_ai.input.messages': 'ТАЄМНИЦЯ', 'gen_ai.output.messages': 'ТАЄМНИЦЯ', full_command: 'cat ТАЄМНИЦЯ', user_prompt: 'ТАЄМНИЦЯ', 'gen_ai.tool.call.arguments': 'ТАЄМНИЦЯ', tool_input: 'ТАЄМНИЦЯ' } }));
    expect(attrs).not.toContain('ТАЄМНИЦЯ');
  });

  it('масив причин завершення зберігається, порожні значення відкидаються', () => {
    expect(safeAttributes({ 'gen_ai.response.finish_reasons': ['tool_call'], error: null })).toEqual({ 'gen_ai.response.finish_reasons': '["tool_call"]' });
  });

  it('довге значення обрізається, не-обʼєкт не ламає', () => {
    expect(safeAttributes({ error: 'x'.repeat(500) }).error).toHaveLength(120);
    expect(safeAttributes('рядок')).toEqual({});
    expect(safeAttributes(null)).toEqual({});
  });
});

describe('дерево', () => {
  it('вкладає дочірні за parentObservationId і впорядковує за часом', () => {
    const lines = treeLines([span('c', 'b', 'tool', 3), span('b', 'a', 'llm', 2), span('d', 'a', 'llm2', 9), span('a', null, 'root', 1)]);
    expect(lines.map((l) => l.split(' [')[0])).toEqual(['root', '  llm', '    tool', '  llm2']);
    expect(lines[0]).toContain('1000 мс');
  });

  it('батько поза трасою — спан стає коренем, а не зникає', () => {
    expect(treeLines([span('x', 'немає', 'сирота', 1)])).toHaveLength(1);
  });

  it('рівень помилки й атрибути видно', () => {
    const [line] = treeLines([span('a', null, 'Bash', 1, { attributes: { tool_name: 'Bash', success: 'false' } }, 'ERROR')]);
    expect(line).toContain('level=ERROR');
    expect(line).toContain('tool_name=Bash success=false');
  });
});
