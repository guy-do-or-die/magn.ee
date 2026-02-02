import { useState } from 'react';
import { encodeFunctionData } from 'viem';
import { ZERO_ADDRESS } from '@/lib/constants';

// ERC20 ABI
const ERC20_ABI = [
    {
        inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
    }
] as const;

export function useApproval() {
    const [needsApproval, setNeedsApproval] = useState(false);
    const [approving, setApproving] = useState(false);
    const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const checkAllowance = async (token: string, owner: string, spender: string, requiredAmount: bigint) => {
        if (token === ZERO_ADDRESS) return true;

        console.log(`[Magnee] Checking allowance for ${token} on owner ${owner} for spender ${spender}`);
        try {
            const rpcUrl = 'https://mainnet.optimism.io'; // Hardcoded for Pilot
            const body = {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [
                    {
                        to: token,
                        data: encodeFunctionData({
                            abi: ERC20_ABI,
                            functionName: 'allowance',
                            args: [owner as `0x${string}`, spender as `0x${string}`]
                        })
                    },
                    'latest'
                ]
            };

            const res = await fetch(rpcUrl, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
            const json = await res.json();
            const allowanceIdx = BigInt(json.result);

            console.log(`[Magnee] Allowance: ${allowanceIdx.toString()}, Required: ${requiredAmount.toString()}`);
            const hasAllowance = allowanceIdx >= requiredAmount;
            setNeedsApproval(!hasAllowance);
            return hasAllowance;

        } catch (e) {
            console.error('[Magnee] Failed to check allowance:', e);
            setNeedsApproval(true); // Fail safe
            return false;
        }
    };

    const triggerApproval = async (txFrom: string, route: any, reqId: string) => {
        if (!route || !txFrom) return;
        setApproving(true);
        setError(null);

        const spender = route.targetAddress;
        if (!spender) {
            setError("Cannot approve: Missing spender address");
            setApproving(false);
            return;
        }

        const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender as `0x${string}`, BigInt(route.amountIn)]
        });

        const approvalPayload = {
            from: txFrom,
            to: route.tokenIn,
            data: data,
            value: '0x0'
        };

        console.log('[Magnee UI] Sending MAGNEE_TRIGGER_TX...', approvalPayload);
        chrome.runtime.sendMessage({
            type: 'MAGNEE_TRIGGER_TX',
            payload: {
                tx: approvalPayload,
                chainId: route.chainId,
                reqId
            }
        }, (response) => {
            console.log('[Magnee UI] Approval Trigger Response:', response);

            if (chrome.runtime.lastError) {
                console.error('[Magnee UI] Runtime Error:', chrome.runtime.lastError);
                setError("Runtime Error: " + chrome.runtime.lastError.message);
                setApproving(false);
                return;
            }

            if (response && response.txHash) {
                console.log('[Magnee UI] Got TxHash immediately:', response.txHash);
                setApprovalTxHash(response.txHash);
                setTimeout(() => {
                    setNeedsApproval(false);
                    setApproving(false);
                }, 5000);
            } else if (response && response.status === 'sent_to_page') {
                console.log('[Magnee UI] Approval forwarded to page. Waiting for user action...');
                setTimeout(() => {
                    console.log('[Magnee UI] Assuming approval flow complete (timeout).');
                    setApproving(false);
                }, 10000);
            } else {
                console.warn('[Magnee UI] Unknown response:', response);
                setApproving(false);
                if (response?.error) setError("Approval failed: " + response.error);
                else setError("Failed to initiate approval");
            }
        });
    };

    return {
        needsApproval,
        approving,
        approvalTxHash,
        error,
        checkAllowance,
        triggerApproval,
        setNeedsApproval // allowing manual overrides just in case
    };
}
