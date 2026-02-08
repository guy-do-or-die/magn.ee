/**
 * ENS Text Records Integration
 * Read and write settings from ENS text records
 */

import { PublicClient, WalletClient, namehash, keccak256, toBytes, toHex } from 'viem';
import { normalize } from 'viem/ens';
import { mainnet } from 'viem/chains';
import { UserSettings, parseSettings, minifySettings } from './types';

const SETTINGS_KEY = 'com.magnee.settings';

// ENS Public Resolver ABI (minimal, just setText method)
export const RESOLVER_ABI = [
  {
    name: 'setText',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
] as const;

/**
 * Get ENS name for an address (reverse resolution)
 */
export async function getENSName(
  address: string,
  publicClient: PublicClient
): Promise<string | null> {
  try {
    const ensName = await publicClient.getEnsName({
      address: address as `0x${string}`,
    });
    return ensName;
  } catch (err) {
    console.error('[Magnee Settings] Failed to resolve ENS name:', err);
    return null;
  }
}

/**
 * Load settings from ENS text records
 */
export async function loadFromENS(
  address: string,
  publicClient: PublicClient
): Promise<UserSettings | null> {
  try {
    // First, resolve address to ENS name
    const ensName = await getENSName(address, publicClient);
    if (!ensName) {
      console.log('[Magnee Settings] No ENS name found for address');
      return null;
    }
    
    console.log(`[Magnee Settings] Found ENS name: ${ensName}`);
    
    // Read text record
    const settingsJson = await publicClient.getEnsText({
      name: normalize(ensName),
      key: SETTINGS_KEY,
    });
    
    if (!settingsJson) {
      console.log('[Magnee Settings] No settings text record found');
      return null;
    }
    
    console.log('[Magnee Settings] Loaded from ENS text record');
    
    // Parse and validate
    const settings = parseSettings(settingsJson);
    if (!settings) {
      console.warn('[Magnee Settings] Invalid settings in ENS text record');
      return null;
    }
    
    return settings;
  } catch (err) {
    console.error('[Magnee Settings] Failed to load from ENS:', err);
    return null;
  }
}

/**
 * Save settings to ENS text records
 * Requires a wallet client with signer
 */
export async function saveToENS(
  ensName: string,
  settings: UserSettings,
  walletClient: WalletClient,
  address: string
): Promise<string> {
  try {
    const normalizedName = normalize(ensName);
    
    // Get the resolver address for this ENS name
    const publicClient = walletClient as unknown as PublicClient;
    const resolver = await publicClient.getEnsResolver({
      name: normalizedName,
    });
    
    if (!resolver) {
      throw new Error('No resolver found for ENS name');
    }
    
    // Minify JSON
    const settingsJson = minifySettings(settings);
    
    // Calculate namehash for the ENS name using viem's namehash utility
    const node = namehash(normalizedName);
    
    // Call setText on the resolver contract
    const hash = await walletClient.writeContract({
      address: resolver as `0x${string}`,
      abi: RESOLVER_ABI,
      functionName: 'setText',
      args: [node, SETTINGS_KEY, settingsJson],
      account: address as `0x${string}`,
      chain: mainnet,
    });
    
    console.log('[Magnee Settings] Saved to ENS, tx hash:', hash);
    return hash;
  } catch (err) {
    console.error('[Magnee Settings] Failed to save to ENS:', err);
    throw err;
  }
}

/**
 * Check if settings JSON fits in 255-char limit
 * If not, would need to split (not implemented yet)
 */
export function checkSettingsSize(settings: UserSettings): { ok: boolean; size: number } {
  const json = minifySettings(settings);
  return {
    ok: json.length <= 255,
    size: json.length,
  };
}
