/**
 * AES-256-GCM encryption for BYOK (Bring Your Own Key) API keys.
 *
 * Layout of the encoded string (base64):
 *   [12-byte IV][N-byte ciphertext][16-byte auth tag]
 *
 * The encryption key is 32 bytes, derived from ENCRYPTION_KEY env var via SHA-256.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;  // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;

function getKey(): Buffer {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) throw new Error("ENCRYPTION_KEY environment variable is required for BYOK encryption");
    // Derive a stable 32-byte key from the env var string via SHA-256
    return createHash("sha256").update(raw).digest();
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string containing IV + ciphertext + GCM auth tag.
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Pack: iv (12) + ciphertext (variable) + tag (16)
    const combined = Buffer.concat([iv, encrypted, tag]);
    return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded string produced by encrypt().
 * Returns the original plaintext.
 */
export function decrypt(encoded: string): string {
    const key = getKey();
    const combined = Buffer.from(encoded, "base64");

    if (combined.length < IV_LENGTH + TAG_LENGTH + 1) {
        throw new Error("Invalid encrypted data: too short");
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}
