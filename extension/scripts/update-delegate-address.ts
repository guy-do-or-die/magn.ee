#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Update delegate addresses after deployment
 * 
 * Usage: bun scripts/update-delegate-address.ts <chainId> <address>
 * Example: bun scripts/update-delegate-address.ts 8453 0x1234...
 */

const DELEGATES_JSON = 'src/lib/delegates.json';

async function updateDelegatesJson(chainId: string, address: string): Promise<void> {
    const file = Bun.file(DELEGATES_JSON);
    const delegates = await file.json() as Record<string, string>;
    
    const existingAddress = delegates[chainId];
    delegates[chainId] = address;
    
    await Bun.write(DELEGATES_JSON, JSON.stringify(delegates, null, 4) + '\n');
    
    if (existingAddress) {
        console.log(`✅ Updated chainId ${chainId}: ${existingAddress} → ${address}`);
    } else {
        console.log(`✅ Added chainId ${chainId}: ${address}`);
    }
}

// Main
const [chainIdArg, addressArg] = Bun.argv.slice(2);

if (!chainIdArg || !addressArg) {
    console.log('Usage: bun scripts/update-delegate-address.ts <chainId> <address>');
    console.log('Example: bun scripts/update-delegate-address.ts 8453 0x31ebF2B83aD3450...');
    console.log('');
    console.log('Common chain IDs:');
    console.log('  1     - Ethereum Mainnet');
    console.log('  10    - Optimism');
    console.log('  8453  - Base');
    console.log('  42161 - Arbitrum');
    process.exit(1);
}

if (!addressArg.startsWith('0x') || addressArg.length !== 42) {
    console.error('❌ Invalid address format. Expected 0x... (42 chars)');
    process.exit(1);
}

if (!/^\d+$/.test(chainIdArg)) {
    console.error('❌ Chain ID must be a number');
    process.exit(1);
}

await updateDelegatesJson(chainIdArg, addressArg);

export {};
