/**
 * Assertion: valid-json
 * Verifies the LLM response is parseable JSON.
 */
module.exports = (output) => {
    if (!output || typeof output !== "string") {
        return { pass: false, score: 0, reason: "Output is empty or not a string" };
    }

    try {
        JSON.parse(output);
        return { pass: true, score: 1 };
    } catch (err) {
        // Show first 200 chars of bad output to help debug
        const preview = output.slice(0, 200).replace(/\n/g, "\\n");
        return {
            pass: false,
            score: 0,
            reason: `Response is not valid JSON: ${err.message}. Preview: "${preview}"`,
        };
    }
};
