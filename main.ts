import { Cmd, CmdSeq } from '@axhxrx/cmd';
import { parseArgs } from '@std/cli';

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
  let repoUrl = args.repo;

  // Present repository selection if there are any saved repos
  if (config.repos.length > 0)
  {
    console.log('Select repository (or enter a new one):');

    config.repos.forEach((repo, i) =>
    {
      const prefix = repo === config.lastRepo ? '* ' : '  ';
      console.log(`${prefix}${i + 1}. ${repo}`);
    });

    console.log('  n. Enter a new repository URL');

    const defaultOption = repoUrl || config.lastRepo || '';
    const defaultText = defaultOption ? ` (default: ${defaultOption})` : '';
    const response = prompt(`Selection${defaultText}: `) || '';

    if (response.toLowerCase() === 'n')
    {
      repoUrl = prompt('Enter repository URL: ') || repoUrl || '';
    }
    else if (response.trim() !== '')
    {
      const index = parseInt(response) - 1;
      if (!isNaN(index) && index >= 0 && index < config.repos.length)
      {
        repoUrl = config.repos[index];
      }
      else
      {
        console.error('Invalid selection');
        return 1;
      }
    }
    else if (repoUrl)
    {
      // Keep the repoUrl from command line
    }
    else if (config.lastRepo)
    {
      // Default to last used
      repoUrl = config.lastRepo;
    }
  }
  else if (!repoUrl)
  {
    // If no saved repos and no repo specified on command line, prompt for URL
    repoUrl = prompt('Enter repository URL: ') || '';
  }

  // Final check for repo URL
  if (!repoUrl)
  {
    console.error('Repository URL is required');
    return 1;
  }

  // Update config
  if (!config.repos.includes(repoUrl))
  {
    config.repos.push(repoUrl);
  }
  config.lastRepo = repoUrl;
  await saveConfig(config);

  // Get branch name
  let branchName = args.branch || args._?.[0]; // Support both --branch option and positional arg
  let createNewBranch = false;

  if (!branchName)
  {
    console.log('Select branch:');
    console.log('  1. Fetch branches from remote');
    console.log('  2. Enter existing branch name');
    console.log('  3. Create new branch');

    const branchResponse = prompt('Selection (default: 1): ') || '1';

    if (branchResponse === '1')
    {
      console.log(`Fetching branches from ${repoUrl}...`);
      const branches = await fetchRemoteBranches(repoUrl);

      if (branches.length === 0)
      {
        console.log('No branches found or error fetching branches.');
        branchName = prompt('Enter branch name: ') || '';
      }
      else
      {
        console.log('Available branches:');
        branches.forEach((branch, i) =>
        {
          console.log(`  ${i + 1}. ${branch}`);
        });

        const branchSelection = prompt('Select branch number: ') || '';
        const branchIndex = parseInt(branchSelection) - 1;

        if (!isNaN(branchIndex) && branchIndex >= 0 && branchIndex < branches.length)
        {
          branchName = branches[branchIndex];
        }
        else if (branchSelection.trim() !== '')
        {
          // Check if user entered branch name directly
          const matchedBranch = branches.find(b => b === branchSelection.trim());
          if (matchedBranch)
          {
            branchName = matchedBranch;
          }
          else
          {
            console.error('Invalid branch selection');
            return 1;
          }
        }
        else
        {
          console.error('No branch selected');
          return 1;
        }
      }
    }
    else if (branchResponse === '2')
    {
      branchName = prompt('Enter existing branch name: ') || '';
    }
    else if (branchResponse === '3')
    {
      branchName = prompt('Enter new branch name: ') || '';
      if (branchName)
      {
        createNewBranch = true;
      }
    }
    else
    {
      console.error('Invalid selection');
      return 1;
    }
  }

  if (!branchName)
  {
    console.error('Branch name is required');
    return 1;
  }

  // Execute the clone command
  if (createNewBranch)
  {
    console.log(`Cloning ${repoUrl}, creating new branch: ${branchName}`);
  }
  else
  {
    console.log(`Cloning ${repoUrl}, branch: ${branchName}`);
  }

  // Create a directory name from the repo URL
  const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
  const dirName = `${repoName}-${branchName}`;

  // Base commands for all scenarios
  const baseCommands = [
    `git clone ${repoUrl} ${dirName}`,
    Cmd.cd(`${dirName}`),
  ];

  // Add branch checkout command based on whether creating new branch
  if (createNewBranch)
  {
    baseCommands.push(`git checkout -b ${branchName}`);
  }
  else
  {
    baseCommands.push(`git checkout ${branchName}`);
  }

  // Add package manager commands that run only if specific files exist
  baseCommands.push(`
    bash -c '
    if [ -f package-lock.json ]; then
      echo "📦 Node.js project (npm) detected, installing dependencies..."
      time npm ci
    elif [ -f yarn.lock ]; then
      echo "📦 Node.js project (yarn) detected, installing dependencies..."
      time yarn install --frozen-lockfile
    elif [ -f pnpm-lock.yaml ]; then
      echo "📦 Node.js project (pnpm) detected, installing dependencies..."
      time pnpm install --frozen-lockfile
    elif [ -f bun.lockb ]; then
      echo "📦 Bun project (bun) detected, installing dependencies..."
      time bun install
    elif [ -f bun.lock ]; then
      echo "📦 Bun project (bun) detected, installing dependencies..."
      time bun install
    elif [ -f Cargo.toml ]; then
      echo "📦 Rust project detected, building dependencies..."
      time cargo build
    elif [ -f Gemfile ]; then
      echo "📦 Ruby project detected, installing dependencies..."
      time bundle install
    elif [ -f requirements.txt ]; then
      echo "📦 Python project detected, installing dependencies..."
      time pip install -r requirements.txt
    elif [ -f go.mod ]; then
      echo "📦 Go project detected, downloading dependencies..."
      time go mod download
    else
      echo "📦 No package manager config detected, skipping dependency installation"
    fi
    '
  `);

  const cmd = new CmdSeq({ commands: baseCommands });

  const result = await cmd.run();

  if (result.exitCode !== 0)
  {
    console.warn(`😞 Failed. Exit code: ${result.exitCode}`);
    const tempLogFile = Deno.makeTempFileSync({ suffix: '.log.json' });
    Deno.writeTextFileSync(tempLogFile, `${JSON.stringify(result, null, 2)}`);
    console.log(`📃 For details, see log file: ${tempLogFile}`);
  }
  else
  {
    console.log(`✅ All done.`);
  }

  // Go back to original CWD just to work around a Deno LSP editor extension bug
  Deno.chdir(cwd);

  return result.exitCode;
}

if (import.meta.main)
{
  main();
}
