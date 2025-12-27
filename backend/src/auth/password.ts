/**
 * Password Hashing and Verification
 *
 * Implements SEC-2: Password Storage (bcrypt with cost factor ≥ 12)
 */

import { hash, compare } from "bcrypt";

// SEC-2: bcrypt cost factor >= 12
const BCRYPT_COST_FACTOR = 12;

// ============================================================================
// Password Hashing
// ============================================================================

/**
 * Hash a password using bcrypt.
 * SEC-2: Cost factor of 12 or higher.
 */
export async function hashPassword(password: string): Promise<string> {
    return hash(password, BCRYPT_COST_FACTOR);
}

/**
 * Verify a password against its hash.
 */
export async function verifyPassword(
    password: string,
    hashedPassword: string
): Promise<boolean> {
    return compare(password, hashedPassword);
}

// ============================================================================
// Password Validation
// ============================================================================

export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validate password strength requirements.
 */
export function validatePasswordStrength(
    password: string
): PasswordValidationResult {
    const errors: string[] = [];

    if (password.length < 8) {
        errors.push("Password must be at least 8 characters long");
    }

    if (password.length > 128) {
        errors.push("Password must be at most 128 characters long");
    }

    if (!/[a-z]/.test(password)) {
        errors.push("Password must contain at least one lowercase letter");
    }

    if (!/[A-Z]/.test(password)) {
        errors.push("Password must contain at least one uppercase letter");
    }

    if (!/[0-9]/.test(password)) {
        errors.push("Password must contain at least one number");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ============================================================================
// Email Validation
// ============================================================================

/**
 * Validate email format.
 */
export function validateEmail(email: string): boolean {
    // Basic email validation - allows most valid emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 255;
}

/**
 * Normalize email for storage and comparison.
 * Lowercases the entire email.
 */
export function normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
}
