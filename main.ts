import { Cmd } from '@axhxrx/cmd';
import { parseArgs } from '@std/cli';
import { prompt, Input, Select } from '@cliffy/prompt';
import { loadConfig, saveConfig } from './config.ts';
import { fetchRemoteBranches } from './git-stuff.ts';
import { printHelp } from './printHelp.ts';

export interface ParsedArgs
{
  _?: string[] | number[];
  r?: string;
  repo?: string;
  l?: boolean;
  list?: boolean;
  h?: boolean;
  help?: boolean;
  b?: string;
  branch?: string;
}

export async function main(parsedArgs?: ParsedArgs): Promise<number>
{
  const cwd = Deno.cwd();

  const args = parsedArgs ?? parseArgs(Deno.args, {
    string: ['r', 'repo', 'b', 'branch'],
    boolean: ['l', 'list', 'h', 'help'],
    alias: { r: 'repo', l: 'list', h: 'help', b: 'branch' },
  });

  if (args.help)
  {
    printHelp();
    return 0;
  }

  const config = await loadConfig();

  // List repositories
  if (args.list)
  {
    console.log('Saved repositories:');

    if (config.repos.length === 0)
    {
      console.log('  No repositories saved yet');
    }
    else
    {
      config.repos.forEach((repo, i) =>
      {
        const prefix = repo === config.lastRepo ? '* ' : '  ';
        console.log(`${prefix}${i + 1}. ${repo}`);
      });
    }
    return 0;
  }

  // Get repo URL - always show list even if repo is specified on command line
  let repoUrl = args.repo
    ? args.repo
    : config.repos.length > 0
    ? config.lastRepo
    : undefined;

  // === Repository Selection ===
  const ENTER_NEW_URL = Symbol('ENTER_NEW_URL'); // Sentinel value

  if (!repoUrl || (args.list && config.repos.length > 0))
  {
    console.log('Selecting Repository...');
    const repoOptions = [
      ...config.repos.map((r) => ({ name: r, value: r })),
      Select.separator('---'),
      { name: '[Enter New URL]', value: ENTER_NEW_URL },
    ];

    const selectedRepo = await prompt([
      {
        name: 'repo',
        message: 'Select a repository or enter a new one',
        type: Select,
        options: repoOptions,
        default: repoUrl || (config.repos.length > 0 ? config.repos[0] : undefined),
        search: true,
      },
    ]);

    // Correctly compare with the symbol sentinel (ensure it's not undefined first)
    if (selectedRepo.repo && typeof selectedRepo.repo === 'symbol' && selectedRepo.repo === ENTER_NEW_URL) {
      const { newRepoUrl } = await prompt([
        {
          name: 'newRepoUrl',
          message: 'Enter repository URL:',
          type: Input,
          default: '',
        },
      ]);
      repoUrl = newRepoUrl || '';
    }
    else if (selectedRepo.repo)
    {
      repoUrl = selectedRepo.repo;
    }
  }

  // List repos if requested and exit
  if (args.list)
  {
    if (config.repos.length > 0)
    {
      console.log('Saved repositories:');
      config.repos.forEach((r) => console.log(` - ${r}`));
    }
    else
    {
      console.log('No repositories saved yet.');
    }
    return 0;
  }

  // Final check for repo URL
  if (!repoUrl)
  {
    console.error('Repository URL is required');
    return 1;
  }

  // === Branch Selection ===
  const CREATE_NEW_BRANCH = Symbol('CREATE_NEW_BRANCH'); // Sentinel value
  let branchName: string | undefined = args.branch || (typeof args._?.[0] === 'string' ? args._?.[0] : undefined);
  let createNewBranch = false;

  // Only prompt if branch wasn't specified via args
  if (!branchName) {
    const specificAction = typeof args._?.[0] === 'string' ? args._?.[0] : undefined; // Store if user used '.' or '..'
    // branchName = undefined; // Reset branchName for selection - Already done above

    console.log('Fetching remote branches...');
    // Pass repoUrl to fetchRemoteBranches
    const branches = await fetchRemoteBranches(repoUrl);

    if (specificAction === '..') { // User wants to select an existing branch
      if (branches.length === 0)
      {
        console.error('No existing remote branches found to select from.');
        return 1;
      }
      const branchOptions = branches.map((b) => ({ name: b, value: b }));
      const selectedBranch = await prompt([
        {
          name: 'branch',
          message: 'Select an existing branch',
          type: Select,
          options: branchOptions,
          search: true,
        },
      ]);
      branchName = selectedBranch.branch; // Assign to the outer scope variable
    }
    else if (specificAction === '.') { // User wants to create a new branch
      const { newBranch } = await prompt([
        {
          name: 'newBranch',
          message: 'Enter new branch name:',
          type: Input,
          default: '',
        },
      ]);
      branchName = newBranch || ''; // Assign to the outer scope variable
      createNewBranch = true;
    }
    else { // Default: let user select existing or create new
      const branchOptions = [
        ...branches.map((b) => ({ name: b, value: b })),
        Select.separator('---'),
        { name: '[Create New Branch]', value: CREATE_NEW_BRANCH },
      ];

      const selectedBranch = await prompt([
        {
          name: 'branch',
          message: 'Select an existing branch or create a new one',
          type: Select,
          options: branchOptions,
          search: true,
          default: branches.length > 0 ? branches[0] : undefined,
        },
      ]);

      // Correctly compare with the symbol sentinel (ensure it's not undefined first)
      if (selectedBranch.branch && typeof selectedBranch.branch === 'symbol' && selectedBranch.branch === CREATE_NEW_BRANCH) {
        const { newBranch } = await prompt([
          {
            name: 'newBranch',
            message: 'Enter new branch name:',
            type: Input,
            default: '',
          },
        ]);
        branchName = newBranch || ''; // Assign to the outer scope variable
        createNewBranch = true;
      }
      else if (selectedBranch.branch) {
        branchName = selectedBranch.branch; // Assign to the outer scope variable
      }
    }
  }

  // Final check for branch name
  if (!branchName) {
    console.error('Branch name is required');
    return 1;
  }

  // Update config
  if (!config.repos.includes(repoUrl))
  {
    config.repos.push(repoUrl);
  }
  config.lastRepo = repoUrl;
  await saveConfig(config);

  // Execute the clone command
  if (createNewBranch) {
    console.log(`Cloning ${repoUrl} and creating new branch ${branchName}...`);
    await new Cmd('git', ['clone', '--origin', 'origin', '--branch', 'main', repoUrl, cwd]).run(); // Clone main first
    await new Cmd('git', ['-C', cwd, 'checkout', '-b', branchName]).run(); // Create new branch
    await new Cmd('git', ['-C', cwd, 'push', '-u', 'origin', branchName]).run(); // Push new branch
  } else {
    console.log(`Cloning branch ${branchName} from ${repoUrl}...`);
    await new Cmd('git', ['clone', '--origin', 'origin', '--branch', branchName, repoUrl, cwd]).run();
  }

  console.log(`Successfully cloned to ${cwd}`);

  // Go back to original CWD just to work around a Deno LSP editor extension bug
  Deno.chdir(cwd);

  return 0;
}

if (import.meta.main)
{
  main();
}
