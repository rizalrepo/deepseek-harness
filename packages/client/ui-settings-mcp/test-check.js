import assert from 'node:assert';

// ponytail: check standalone parser against sample YAML; upgrade path: integrate into test runner
const sample = `
- id: mcp-puppeteer
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: puppeteer
    transport: stdio
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-puppeteer"
`;

const nameMatch = sample.match(/serverName:\s*['"]?([^'"\n\r]+)['"]?/);
const cmdMatch = sample.match(/command:\s*['"]?([^'"\n\r]+)['"]?/);
const transMatch = sample.match(/transport:\s*['"]?([^'"\n\r]+)['"]?/);

assert.strictEqual(nameMatch?.[1], 'puppeteer');
assert.strictEqual(cmdMatch?.[1], 'npx');
assert.strictEqual(transMatch?.[1], 'stdio');

console.log('✓ ui-settings-mcp parser assertion passed.');
