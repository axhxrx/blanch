/**
 * Prints help information for the blanch command.
 */
export function printHelp(): void
{
  console.log(`
blanch - clone repo and checkout branch

USAGE:
  blanch [options]

OPTIONS:
  -r, --repo <url>   Specify repository URL (saves for future use)
  -l, --list         List saved repositories
  -h, --help         Show this help message
  -b, --branch <name>   Specify branch name (optional, can select interactively)

EXAMPLES:
  blanch                                     # Interactive mode
  blanch --repo git@github.com:user/new-repo.git
  blanch --branch feature-branch
  blanch --list

FEATURES:
  - Select from saved repositories or enter a new one
  - Fetch and choose from remote branches
  - Create a new branch
  - Clone repository and set up development environment
  - Auto-detect and install dependencies for various project types:
    • npm, yarn, pnpm, bun (Node.js)
    • Cargo (Rust)
    • Bundler (Ruby)
    • pip (Python)
    • Go modules
    `);
}
