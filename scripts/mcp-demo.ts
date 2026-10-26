/**
 * ДРУГИЙ БІК (крок 09): застосунок викликає ті самі інструменти MCP-сервера, що й агент кодування.
 * Процес сервера породжує транспорт — окремо його запускати не треба й не можна.
 *
 *   npx tsx scripts/mcp-demo.ts "як встановити nginx"
 *
 * Ключа застосунок серверу НЕ передає: оточення — getDefaultEnvironment() + підпис MCP_CLIENT_LABEL.
 * Ключ ембедера сервер, якщо він є, бере сам із файлу поза git (прапорець --env-file-if-exists у команді,
 * тій самій, що в .mcp.json і в mcp-spec.md). Без ключа search_corpus відмовляє з причиною — це теж видно тут.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

// Корінь репозиторію — від цього файлу, а не від cwd: відносний src/mcp/server.ts читається від робочої теки процесу.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const query = process.argv[2] ?? 'як встановити nginx';

const client = new Client({ name: 'lab2-app', version: '1.0.0' });

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '--env-file-if-exists=.env.local', 'src/mcp/server.ts'],
  cwd: ROOT,
  // НЕ ...process.env: інакше застосунок віддав би серверу всі свої секрети.
  // MCP_CLIENT_LABEL — підпис у журналі сервера: за ним видно, що виклик ЗВІДСИ.
  env: { ...getDefaultEnvironment(), MCP_CLIENT_LABEL: 'lab2-app' },
});

type CallResult = Awaited<ReturnType<typeof client.callTool>>;

function show(title: string, result: CallResult): void {
  console.log(`\n=== ${title}`);
  // Тип блоку перевіряємо ДО читання .text — це канонічна форма з документації.
  for (const block of result.content) {
    if (block.type === 'text') console.log(block.text);
  }
  if (result.isError) console.log('^ це ВІДМОВА сервера (isError: true)');
}

async function main(): Promise<void> {
  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    console.log('=== tools/list');
    for (const tool of tools) console.log(`${tool.name} — ${tool.description}`);

    show(`search_corpus { query: "${query}", topK: 3 }`, await client.callTool({ name: 'search_corpus', arguments: { query, topK: 3 } }));
    show('fetch_chunk { id: "install-nginx#0000" }', await client.callTool({ name: 'fetch_chunk', arguments: { id: 'install-nginx#0000' } }));
    // навмисно за межею: доказ, що застосунок бачить відмову, а не порожній результат
    show('fetch_chunk { id: "add-shortcut#0099" } — очікувана відмова', await client.callTool({ name: 'fetch_chunk', arguments: { id: 'add-shortcut#0099' } }));
  } finally {
    // без close() процес сервера залишиться живим
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
