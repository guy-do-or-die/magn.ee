#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Deploy MagneeDelegateAccount, update delegates.json, then verify
 * 
 * Usage: bun scripts/deploy-delegate.ts <chain>
 * Example: bun scripts/deploy-delegate.ts base
 * 
 * Requires:
 * - Foundry keystore with 'default' account
 * - ETHERSCAN_API_KEY in .env
 */

const DELEGATES_JSON = 'src/lib/delegates.json';
const DEPLOY_SCRIPT = 'script/Deploy7702Delegate.s.sol';
const CONTRACTS_DIR = '../contracts';

const CHAIN_IDS: Record<string, number> = {
    mainnet: 1,
    ethereum: 1,
    optimism: 10,
    opt: 10,
    base: 8453,
    arbitrum: 42161,
    arb: 42161,
};

/** Run a command with live output (stdio inherited) */
async function run(cmd: string[], cwd = CONTRACTS_DIR): Promise<number> {
    const proc = Bun.spawn(cmd, { cwd, stdio: ['inherit', 'inherit', 'inherit'] });
    return proc.exited;
}

async function deploy(chain: string, chainId: number): Promise<string | null> {
    console.log(`\n🚀 Deploying to ${chain}...`);
    
    const exitCode = await run([
        'forge', 'script', DEPLOY_SCRIPT,
        '--account', 'default', '--broadcast', '--rpc-url', chain
    ]);
    
    if (exitCode !== 0) {
        console.error('❌ Deployment failed');
        return null;
    }
    
    // Parse deployed address from broadcast JSON (more reliable than stdout)
    const broadcastFile = Bun.file(`${CONTRACTS_DIR}/broadcast/Deploy7702Delegate.s.sol/${chainId}/run-latest.json`);
    if (!await broadcastFile.exists()) {
        console.error('❌ Broadcast file not found');
        return null;
    }
    
    const broadcast = await broadcastFile.json() as any;
    const createTx = broadcast.transactions?.find((tx: any) => tx.transactionType === 'CREATE');
    if (!createTx?.contractAddress) {
        console.error('❌ Could not find deployed address in broadcast');
        return null;
    }
    
    return createTx.contractAddress;
}

async function updateDelegatesJson(chainId: number, address: string): Promise<void> {
    console.log(`\n📝 Updating ${DELEGATES_JSON}...`);
    
    const file = Bun.file(DELEGATES_JSON);
    const delegates = await file.json() as Record<string, string>;
    
    const existingAddress = delegates[chainId.toString()];
    delegates[chainId.toString()] = address;
    
    await Bun.write(DELEGATES_JSON, JSON.stringify(delegates, null, 4) + '\n');
    
    if (existingAddress && existingAddress !== address) {
        console.log(`⚠️  Replaced: ${existingAddress}`);
    }
    console.log(`✅ Set chainId ${chainId}: ${address}`);
}

async function verify(chain: string, address: string): Promise<void> {
    console.log(`\n🔍 Verifying on ${chain}...`);
    
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
        console.log('⚠️  ETHERSCAN_API_KEY not set - skipping verification');
        return;
    }
    
    const exitCode = await run([
        'forge', 'verify-contract', address,
        'src/MagneeDelegateAccount.sol:MagneeDelegateAccount',
        '--rpc-url', chain, '--etherscan-api-key', apiKey
    ]);
    
    if (exitCode === 0) {
        console.log('✅ Verification complete');
    } else {
        console.log('⚠️  Verification failed (exit code', exitCode + ')');
    }
}

// Main
const chainArg = Bun.argv[2];

if (!chainArg) {
    console.log('Usage: bun scripts/deploy-delegate.ts <chain>');
    console.log('');
    console.log('Supported chains:', Object.keys(CHAIN_IDS).join(', '));
    process.exit(1);
}

const chainId = CHAIN_IDS[chainArg.toLowerCase()];
if (!chainId) {
    console.error(`❌ Unknown chain: ${chainArg}`);
    console.error(`Supported: ${Object.keys(CHAIN_IDS).join(', ')}`);
    process.exit(1);
}

console.log('═══════════════════════════════════════════════════');
console.log(`  Magnee Delegate Deployment: ${chainArg} (${chainId})`);
console.log('═══════════════════════════════════════════════════');

// Step 1: Deploy
const address = await deploy(chainArg, chainId);
if (!address) {
    process.exit(1);
}

// Step 2: Update JSON
await updateDelegatesJson(chainId, address);

// Step 3: Verify
await verify(chainArg, address);

console.log('\n═══════════════════════════════════════════════════');
console.log('  ✅ DEPLOYMENT COMPLETE');
console.log(`  Chain: ${chainArg} (${chainId})`);
console.log(`  Address: ${address}`);
console.log('═══════════════════════════════════════════════════\n');

export {};
