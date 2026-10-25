/**
 * Необовʼязкова температура в Chat Completions-адаптері (Лаб2, крок 03): суддя-верифікатор
 * ставить 0, решта коду Лабораторної 1 не передає поле зовсім. Підроблений fetch — без мережі.
 */

import { describe, expect, it } from 'vitest';

import { chatCompletionsModel, type Fetch } from '../src/agent/adapters';

function capture(): { send: Fetch; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  const send: Fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'ок' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      { status: 200 },
    );
  };
  return { send, bodies };
}

describe('chatCompletionsModel: temperature', () => {
  it('передає temperature, коли її задано (зокрема 0)', async () => {
    const { send, bodies } = capture();
    await chatCompletionsModel({ url: 'https://example.test/v1/chat/completions', model: 'm', fetch: send, temperature: 0 })(
      's',
      [{ role: 'user', text: 'q' }],
      [],
    );
    expect(bodies[0]).toMatchObject({ temperature: 0 });
  });

  it('не передає поле, коли temperature не задано', async () => {
    const { send, bodies } = capture();
    await chatCompletionsModel({ url: 'https://example.test/v1/chat/completions', model: 'm', fetch: send })(
      's',
      [{ role: 'user', text: 'q' }],
      [],
    );
    expect(bodies[0]).not.toHaveProperty('temperature');
  });
});
