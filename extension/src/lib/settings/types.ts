/**
 * User Settings Type Definitions
 * Schema for Magnee extension user preferences
 */

export interface UserSettings {
  // Feature toggles
  interceptionEnabled: boolean;
  
  // UI preferences
  theme: 'light' | 'dark';
  
  // Per-chain token preferences (chainId -> token address)
  preferredTokens: {
    [chainId: number]: string;
  };
  
  // Transaction settings
  slippage: number; // basis points (e.g., 50 = 0.5%)
  gasLimit?: number; // custom gas limit multiplier (e.g., 1.2 = 120%)
  
  // Metadata
  version: 1;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: UserSettings = {
  interceptionEnabled: true,
  theme: 'dark',
  preferredTokens: {},
  slippage: 50, // 0.5%
  gasLimit: undefined,
  version: 1,
};

/**
 * Validate settings object structure
 */
export function validateSettings(settings: any): settings is UserSettings {
  if (!settings || typeof settings !== 'object') return false;
  
  // Check required fields
  if (typeof settings.interceptionEnabled !== 'boolean') return false;
  if (settings.theme !== 'light' && settings.theme !== 'dark') return false;
  if (typeof settings.slippage !== 'number') return false;
  if (typeof settings.preferredTokens !== 'object') return false;
  if (settings.version !== 1) return false;
  
  // Check optional fields
  if (settings.gasLimit !== undefined && typeof settings.gasLimit !== 'number') return false;
  
  return true;
}

/**
 * Merge partial settings with defaults
 */
export function mergeWithDefaults(partial: Partial<UserSettings>): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    preferredTokens: {
      ...DEFAULT_SETTINGS.preferredTokens,
      ...(partial.preferredTokens || {}),
    },
  };
}

/**
 * Minify settings JSON for ENS storage (removes whitespace)
 */
export function minifySettings(settings: UserSettings): string {
  return JSON.stringify(settings);
}

/**
 * Parse and validate settings from JSON string
 */
export function parseSettings(json: string): UserSettings | null {
  try {
    const parsed = JSON.parse(json);
    if (validateSettings(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
