import { describe, it, expect } from "bun:test";
import { encodeForwardData, createMagneefiedTx, ROUTER_ADDRESS } from "../src/injected/magneeUtils.js";

describe("Magnee Utils", () => {
    it("should encode forward data correctly for simple inputs", () => {
        const target = "0x1234567890123456789012345678901234567890";
        const data = "0xabcdef";

        const encoded = encodeForwardData(target, data);

        // Selector 4 bytes = 8 hex chars
        expect(encoded.startsWith("0xd948d468")).toBe(true);
        // Should contain padded target 
        expect(encoded).toContain(target.slice(2).padStart(64, '0'));
    });

    it("should handle empty data", () => {
        const target = "0x1111111111111111111111111111111111111111";
        const encoded = encodeForwardData(target, "0x");

        // Data length should be 0
        // ...offset...length...
        // length is at position: selector(8) + target(64) + offset(64) = 136 chars?
        // Wait, output is: selector(8) + target(64) + offset(64) + length(64) + content
        // 0 length -> 000...000
        expect(encoded).toContain("0000000000000000000000000000000000000000000000000000000000000000");
    });

    it("should create a valid magneefied tx", () => {
        const originalTx = {
            to: "0xTargetAddress",
            value: "0x100",
            data: "0x123"
        };

        const magneefied = createMagneefiedTx(originalTx);

        expect(magneefied.to).toBe(ROUTER_ADDRESS);
        expect(magneefied.value).toBe(originalTx.value);
        expect(magneefied.data).not.toBe(originalTx.data);
        expect(magneefied.data.startsWith("0xd948d468")).toBe(true);
    });
});
