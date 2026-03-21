/**
 * Action Mapper — Deterministic action generation from classification output.
 *
 * Mini/nano models classify emails but don't decide whether to alert.
 * This module takes the classification and applies hard rules to generate
 * the appropriate actions (send_alert, ignore_thread, etc.)
 *
 * This replaces the stochastic model-driven alerting with reliable,
 * testable, deterministic logic.
 */

import type { AgentResponse } from "./schema";

interface ClassificationResult {
    email_analysis: {
        summary: string;
        intent: string;
        urgency: "low" | "normal" | "high";
        sender_is_human?: boolean;
        needs_response?: boolean;
        entities: string[];
        reasoning?: string;
    } | null;
    memory_append: AgentResponse["memory_append"];
    memory_obsolete: AgentResponse["memory_obsolete"];
    thread_updates: AgentResponse["thread_updates"];
}

interface ActionMapperConfig {
    reactivity: number;      // 1-5
    threadId?: string;
    silenceHours?: number;
}

/**
 * Map a classification result to a full AgentResponse with deterministic actions.
 */
export function mapClassificationToActions(
    classification: ClassificationResult,
    config: ActionMapperConfig
): AgentResponse {
    const actions: AgentResponse["actions"] = [];
    const analysis = classification.email_analysis;

    if (analysis) {
        const shouldAlert = determineAlert(analysis, config.reactivity);

        if (shouldAlert) {
            actions.push({
                tool: "send_alert",
                params: {
                    thread_id: config.threadId ?? "",
                    message: analysis.summary,
                    urgency: analysis.urgency,
                },
                reasoning: `Urgency: ${analysis.urgency}, sender_is_human: ${analysis.sender_is_human ?? "unknown"}, needs_response: ${analysis.needs_response ?? "unknown"}. ${analysis.reasoning ?? ""}`,
            });
        }
    }

    return {
        actions,
        memory_append: classification.memory_append,
        memory_obsolete: classification.memory_obsolete,
        thread_updates: classification.thread_updates,
        email_analysis: analysis ? {
            summary: analysis.summary,
            intent: analysis.intent,
            urgency: analysis.urgency,
            entities: analysis.entities,
            reasoning: analysis.reasoning,
        } : null,
    };
}

/**
 * Deterministic alert decision based on classification signals.
 * Returns true if send_alert should fire.
 */
function determineAlert(
    analysis: ClassificationResult["email_analysis"] & {},
    reactivity: number
): boolean {
    const { urgency, sender_is_human, needs_response } = analysis;

    // Reactivity 1: nearly silent — only high urgency alerts
    if (reactivity <= 1) {
        return urgency === "high";
    }

    // Reactivity 2: low — high urgency always, normal only if needs_response
    if (reactivity === 2) {
        if (urgency === "high") return true;
        if (urgency === "normal" && needs_response) return true;
        return false;
    }

    // Reactivity 3 (default balanced):
    // - high urgency → always alert
    // - normal urgency + human sender → alert
    // - normal urgency + needs_response → alert
    // - normal urgency + automated financial alert → alert
    // - low urgency → never alert
    if (reactivity === 3) {
        if (urgency === "high") return true;
        if (urgency === "normal") {
            if (sender_is_human) return true;
            if (needs_response) return true;
            // Financial/balance alerts from automated systems are still alertable
            return true; // at reactivity 3, any "normal" urgency gets alerted
        }
        return false;
    }

    // Reactivity 4: high — alert on anything normal or high
    if (reactivity === 4) {
        return urgency !== "low";
    }

    // Reactivity 5: maximum — alert on almost everything
    return true;
}

/**
 * Map tick classification to actions — silence alerts for overdue threads.
 * For ticks, the model returns thread analysis. The engine checks which
 * active threads exceed the silence threshold and fires alerts.
 */
export function mapTickToActions(
    classification: ClassificationResult,
    overdueTthreads: Array<{ id: string; subject: string; hoursSilent: number; summary: string }>,
    config: ActionMapperConfig
): AgentResponse {
    const actions: AgentResponse["actions"] = [];

    // Fire silence alerts for every overdue active thread
    for (const thread of overdueTthreads) {
        actions.push({
            tool: "send_alert",
            params: {
                thread_id: thread.id,
                message: `This thread has been quiet for ${Math.round(thread.hoursSilent)} hours — have you already handled this? ${thread.summary}`,
                urgency: "normal",
            },
            reasoning: `Thread "${thread.subject}" silent for ${Math.round(thread.hoursSilent)}h, exceeds threshold of ${config.silenceHours ?? 48}h.`,
        });
    }

    // If the model's tick analysis flagged urgency (e.g. deadline from memory),
    // alert on active threads that weren't already covered by silence alerts
    const analysis = classification.email_analysis;
    if (analysis && (analysis.urgency === "high" || analysis.urgency === "normal")) {
        const alertedIds = new Set(actions.map(a => a.params.thread_id));
        // The model may reference specific threads in its analysis.
        // For now, this is a catch-all for deadline-based tick alerts.
    }

    return {
        actions,
        memory_append: classification.memory_append,
        memory_obsolete: classification.memory_obsolete,
        thread_updates: classification.thread_updates,
        email_analysis: classification.email_analysis ? {
            summary: classification.email_analysis.summary,
            intent: classification.email_analysis.intent,
            urgency: classification.email_analysis.urgency,
            entities: classification.email_analysis.entities,
            reasoning: classification.email_analysis.reasoning,
        } : null,
    };
}
