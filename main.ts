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

  if (args.help) {
    printHelp();
    return 0;
  }

  const config = await loadConfig();

  // Handle --list flag first and exit
  if (args.list) {
    if (config.repos.length > 0) {
      console.log('Saved repositories:');
      config.repos.forEach((r) => console.log(` - ${r}`));
    } else {
      console.log('No repositories saved yet.');
    }
    return 0;
  }

  // Initialize repoUrl: command-line arg takes precedence, then last used repo
  let repoUrl = args.repo
    ? args.repo
    : config.repos.length > 0
    ? config.lastRepo
    : undefined;

  // === Repository Selection (only if not provided via args) ===
  const ENTER_NEW_URL = Symbol('ENTER_NEW_URL'); // Sentinel value

  if (!args.repo) { // Prompt only if repo wasn't specified on the command line
    console.log('Selecting Repository...');
    const repoOptions = [
      // Ensure unique values for options if names are the same
      ...config.repos.map((r, index) => ({ name: r, value: `${r}_${index}` })), // Add index to value for uniqueness
      Select.separator('---'),
      { name: '[Enter New URL]', value: ENTER_NEW_URL },
    ];

    // Use the initialized repoUrl (which might be lastRepo) as the default
    // Find the unique value corresponding to the default repoUrl
    const defaultRepoValue = config.repos.findIndex(r => r === repoUrl) !== -1
      ? `${repoUrl}_${config.repos.findIndex(r => r === repoUrl)}`
      : undefined;

    const selectedRepoResult = await prompt([
      {
        name: 'selectedValue',
        message: 'Select a repository or enter a new one',
        type: Select,
        options: repoOptions,
        default: defaultRepoValue,
        search: true,
      },
    ]);

    const selectedValue = selectedRepoResult.selectedValue;

    // Correctly compare with the symbol sentinel (ensure it's not undefined first)
    if (selectedValue && typeof selectedValue === 'symbol' && selectedValue === ENTER_NEW_URL) {
      const { newRepoUrl } = await prompt([
        {
          name: 'newRepoUrl',
          message: 'Enter repository URL:',
          type: Input,
          default: '',
        },
      ]);
      repoUrl = newRepoUrl || ''; // Update repoUrl
    } else if (selectedValue && typeof selectedValue === 'string') {
      // Extract the original repo URL from the unique value
      repoUrl = selectedValue.substring(0, selectedValue.lastIndexOf('_')); 
    }
    // If prompt was cancelled or nothing selected, repoUrl should retain its initial value (lastRepo or undefined)
  }

  // Final check for repo URL
  if (!repoUrl) {
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
