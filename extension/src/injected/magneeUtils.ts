// Magnee Router Address (Anvil Deployment)
export const ROUTER_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

/**
 * ABI Encodes the 'forward' functional call for MagneeRouter
 * function forward(address target, bytes calldata data)
 * Selector: 0xd948d468
 */
export function encodeForwardData(targetAddress: string, originalData: string | undefined): string {
    // Selector: 0xd948d468
    const selector = '0xd948d468';

    // Param 1: Target Address (padded to 32 bytes)
    const cleanTarget = targetAddress.startsWith('0x') ? targetAddress.slice(2) : targetAddress;
    const targetPadded = cleanTarget.padStart(64, '0');

    // Data handling
    const cleanData = (originalData && originalData !== '0x')
        ? (originalData.startsWith('0x') ? originalData.slice(2) : originalData)
        : '';

    const dataLength = cleanData.length / 2;

    // Param 2: Offset to bytes (0x40 = 64 bytes)
    const offsetPadded = '0000000000000000000000000000000000000000000000000000000000000040';

    // Param 3: Length of bytes
    const lengthPadded = dataLength.toString(16).padStart(64, '0');

    // Param 4: Data itself (padded to 32 bytes)
    const dataContent = cleanData.padEnd(Math.ceil(cleanData.length / 64) * 64, '0');

    return selector + targetPadded + offsetPadded + lengthPadded + dataContent;
}

/**
 * Constructs the full Magneefied transaction
 */
export function createMagneefiedTx(originalTx: any): any {
    const newData = encodeForwardData(originalTx.to, originalTx.data);

    return {
        ...originalTx,
        to: ROUTER_ADDRESS,
        data: newData
        // value is kept as is (ETH)
    };
}
