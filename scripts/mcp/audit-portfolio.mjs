import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const token = process.env.APIFY_TOKEN?.trim();
if (!token) throw new Error('APIFY_TOKEN is required.');

const actors = [
  'industrial_platform/research-brief-agent',
  'industrial_platform/web-change-intelligence',
  'industrial_platform/web-metadata-intelligence',
  'industrial_platform/article-content-intelligence',
  'industrial_platform/pdf-text-intelligence',
  'industrial_platform/sitemap-intelligence'
];

const endpoint = new URL('https://mcp.apify.com/');
endpoint.searchParams.set('tools', actors.join(','));

const client = new Client({ name: 'industrial-platform-mcp-audit', version: '1.0.0' }, {});
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: 'Bearer ' + token } }
});

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const rows = tools.map((tool) => ({
    name: tool.name,
    title: tool.title ?? null,
    description: tool.description ?? null,
    required: Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [],
    properties: Object.keys(tool.inputSchema?.properties ?? {}),
    propertyDescriptions: Object.fromEntries(
      Object.entries(tool.inputSchema?.properties ?? {}).map(([key, value]) => [
        key,
        value && typeof value === 'object' ? value.description ?? null : null
      ])
    )
  }));
  const report = {
    endpoint: endpoint.toString(),
    tool_count: rows.length,
    tools: rows,
    audited_at: new Date().toISOString()
  };
  console.log(JSON.stringify(report, null, 2));
  if (rows.length < actors.length) {
    console.error('Expected at least ' + actors.length + ' portfolio tools, received ' + rows.length + '.');
    process.exitCode = 2;
  }
} finally {
  await client.close().catch(() => {});
}
