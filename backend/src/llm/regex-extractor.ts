/**
 * Regex-based Extractor
 *
 * Provides fallback extraction logic when LLM service is unavailable.
 * Implements the same extraction contract as the LLM service but using
 * deterministic regex patterns.
 *
 * This file re-exports the pure functions from extractor.ts which already
 * implement regex-based extraction logic.
 */

export {
    extractHardDeadline,
    detectClosureSignal,
    extractSoftDeadlineSignal,
    detectUrgencySignal,
    runAllExtractors,
    validateSourceSpan,
    parseDeadlineText,
    hasBindingLanguage,
    isAbsoluteDeadline,
} from "./extractor";
