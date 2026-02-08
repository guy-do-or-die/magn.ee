/**
 * Chrome Extension Storage Wrapper
 * Handles persistence to chrome.storage.sync
 */

import { UserSettings, DEFAULT_SETTINGS, validateSettings, mergeWithDefaults } from './types';

const STORAGE_KEY = 'magnee_settings';

/**
 * Load settings from chrome.storage.sync
 */
export async function loadFromExtensionStorage(): Promise<UserSettings> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    
    if (!stored) {
      console.log('[Magnee Settings] No settings in storage, using defaults');
      return DEFAULT_SETTINGS;
    }
    
    // Validate and merge with defaults
    if (validateSettings(stored)) {
      return mergeWithDefaults(stored);
    } else {
      console.warn('[Magnee Settings] Invalid settings in storage, using defaults');
      return DEFAULT_SETTINGS;
    }
  } catch (err) {
    console.error('[Magnee Settings] Failed to load from storage:', err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to chrome.storage.sync
 */
export async function saveToExtensionStorage(settings: UserSettings): Promise<void> {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
    console.log('[Magnee Settings] Saved to chrome.storage.sync');
  } catch (err) {
    console.error('[Magnee Settings] Failed to save to storage:', err);
    throw err;
  }
}

/**
 * Watch for settings changes across extension contexts
 */
export function watchSettings(callback: (settings: UserSettings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName === 'sync' && changes[STORAGE_KEY]) {
      const newValue = changes[STORAGE_KEY].newValue;
      if (validateSettings(newValue)) {
        callback(newValue);
      }
    }
  };
  
  chrome.storage.onChanged.addListener(listener);
  
  // Return cleanup function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

/**
 * Clear all settings (reset to defaults)
 */
export async function clearSettings(): Promise<void> {
  try {
    await chrome.storage.sync.remove(STORAGE_KEY);
    console.log('[Magnee Settings] Cleared from storage');
  } catch (err) {
    console.error('[Magnee Settings] Failed to clear storage:', err);
    throw err;
  }
}
