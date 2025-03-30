import { join } from '@std/path';
import { assertEquals } from 'jsr:@std/assert';
import { CONFIG, loadConfig } from './config.ts';
import { main, type ParsedArgs } from './main.ts';

const repo = 'https://github.com/axhxrx/blanch.git';
const branch = 'main';

const tempDir = Deno.makeTempDirSync();

const TEST_CONFIG_PATH = join(tempDir, '.blanch.json');
CONFIG.overrideConfigPath = TEST_CONFIG_PATH;

console.log('TEST_CONFIG_PATH', TEST_CONFIG_PATH);

Deno.test('main', async () =>
{
  const cwd = Deno.cwd();
  Deno.chdir(tempDir);

  const args: ParsedArgs = { repo, branch };
  const exitCode = await main(args);
  assertEquals(exitCode, 0);

  // Check config was saved
  const config = await loadConfig();
  assertEquals(config.repos, [repo]);
  assertEquals(config.lastRepo, repo);

  // const args2: ParsedArgs = { repo, branch: 'bonk-bonk-bonk-new-branch' };
  // const exitCode2 = await main(args2);
  // assertEquals(exitCode2, 0);

  // const config2 = await loadConfig();
  // assertEquals(config2.repos, [repo]);
  // assertEquals(config2.lastRepo, repo);

  Deno.chdir(tempDir);

  const mod1 = await Deno.stat('blanch-main');
  assertEquals(mod1.isDirectory, true);

  Deno.chdir(cwd);
});
