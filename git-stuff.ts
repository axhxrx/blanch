/**
 Fetch branches from remote repository
 */
export async function fetchRemoteBranches(repoUrl: string): Promise<string[]>
{
  try
  {
    const command = new Deno.Command('git', {
      args: ['ls-remote', '--heads', repoUrl],
      stdout: 'piped',
    });

    const output = await command.output();
    if (output.code !== 0)
    {
      console.error('Error fetching branches');
      return [];
    }

    const decoder = new TextDecoder();
    const text = decoder.decode(output.stdout);

    // Parse branch names from output
    // Output format is like: "<sha>\trefs/heads/branch-name"
    const branches: string[] = [];
    for (const line of text.split('\n'))
    {
      if (line.trim())
      {
        const parts = line.split('\t');
        if (parts.length === 2 && parts[1].startsWith('refs/heads/'))
        {
          branches.push(parts[1].replace('refs/heads/', ''));
        }
      }
    }

    return branches.sort();
  }
  catch (error)
  {
    console.error('Error fetching branches:', error);
    return [];
  }
}
