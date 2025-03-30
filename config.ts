import { exists } from '@std/fs';
import { join } from '@std/path';

const CONFIG_PATH = join(Deno.env.get('HOME') || '~', '.blanch.json');

export const CONFIG = {
  /**
   Tests can override the config path using this. Set to `'' to disable override and use the default.
   */
  overrideConfigPath: '',
};

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
  const configPath = CONFIG.overrideConfigPath || CONFIG_PATH;
  try
  {
    if (await exists(configPath))
    {
      const text = await Deno.readTextFile(configPath);
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
  const configPath = CONFIG.overrideConfigPath || CONFIG_PATH;
  try
  {
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
  }
  catch (error)
  {
    console.error('Error saving config:', error);
  }
}
