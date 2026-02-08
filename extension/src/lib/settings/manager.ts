/**
 * Settings Manager
 * Orchestrates settings loading/saving with ENS and chrome.storage fallback
 */

import { PublicClient, WalletClient } from 'viem';
import { UserSettings, DEFAULT_SETTINGS, mergeWithDefaults } from './types';
import { loadFromExtensionStorage, saveToExtensionStorage, watchSettings } from './storage';
import { loadFromENS, saveToENS, getENSName } from './ens';

export interface SaveOptions {
  /** Also save to ENS text records (requires walletClient and ensName) */
  saveToENS?: boolean;
  /** ENS name to save to (required if saveToENS is true) */
  ensName?: string;
  /** Wallet client for ENS writes (required if saveToENS is true) */
  walletClient?: WalletClient;
  /** User address (required if saveToENS is true) */
  address?: string;
}

/**
 * Load settings with intelligent fallback logic
 * 
 * Priority:
 * 1. ENS text records (if address and publicClient provided)
 * 2. chrome.storage.sync
 * 3. Defaults
 */
export async function loadSettings(
  address?: string,
  publicClient?: PublicClient
): Promise<UserSettings> {
  // Try ENS first if we have an address and client
  if (address && publicClient) {
    try {
      const ensSettings = await loadFromENS(address, publicClient);
      if (ensSettings) {
        console.log('[Magnee Settings] Loaded from ENS');
        // Also save to chrome.storage for offline access
        await saveToExtensionStorage(ensSettings).catch(err => {
          console.warn('[Magnee Settings] Failed to sync ENS settings to storage:', err);
        });
        return ensSettings;
      }
    } catch (err) {
      console.warn('[Magnee Settings] ENS load failed, falling back to storage');
    }
  }
  
  // Fall back to chrome.storage
  const storageSettings = await loadFromExtensionStorage();
  console.log('[Magnee Settings] Loaded from chrome.storage');
  return storageSettings;
}

/**
 * Save settings
 * 
 * Always saves to chrome.storage.sync for sync across browsers.
 * Optionally saves to ENS if requested.
 */
export async function saveSettings(
  settings: UserSettings,
  options?: SaveOptions
): Promise<void> {
  // Always save to chrome.storage
  await saveToExtensionStorage(settings);
  
  // Optionally save to ENS
  if (options?.saveToENS) {
    const { ensName, walletClient, address } = options;
    
    if (!ensName || !walletClient || !address) {
      throw new Error('ENS name, wallet client, and address required for ENS save');
    }
    
    try {
      const txHash = await saveToENS(ensName, settings, walletClient, address);
      console.log('[Magnee Settings] Saved to ENS:', txHash);
    } catch (err) {
      console.error('[Magnee Settings] Failed to save to ENS:', err);
      throw err;
    }
  }
}

/**
 * Force sync from ENS (overwrites local storage)
 */
export async function syncFromENS(
  address: string,
  publicClient: PublicClient
): Promise<UserSettings | null> {
  const ensSettings = await loadFromENS(address, publicClient);
  
  if (ensSettings) {
    // Save to chrome.storage
    await saveToExtensionStorage(ensSettings);
    console.log('[Magnee Settings] Synced from ENS to chrome.storage');
  }
  
  return ensSettings;
}

/**
 * Watch for settings changes
 * Returns cleanup function
 */
export function onSettingsChange(callback: (settings: UserSettings) => void): () => void {
  return watchSettings(callback);
}

/**
 * Get ENS name for an address (re-export for convenience)
 */
export { getENSName } from './ens';
