import { exists } from '@std/fs';
import { join } from '@std/path';

export const CONFIG_PATH = join(Deno.env.get('HOME') || '~', '.blanch.json');

/**
 Configuration interface
 */
interface Config
{
  repos: string[];
  lastRepo: string;
}

/**
 Load configuration
 */
export async function loadConfig(): Promise<Config>
{
  try
  {
    if (await exists(CONFIG_PATH))
    {
      const text = await Deno.readTextFile(CONFIG_PATH);
      return JSON.parse(text);
    }
  }
  catch (error)
  {
    console.error('Error loading config:', error);
  }

  // Default config
  return { repos: [], lastRepo: '' };
}

/**
 Save configuration
 */
export async function saveConfig(config: Config): Promise<void>
{
  try
  {
    await Deno.writeTextFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  }
  catch (error)
  {
    console.error('Error saving config:', error);
  }
}
