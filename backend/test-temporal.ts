import { parseTemporalExpression } from "@/llm/temporal-parser";

const dateText = "Saturday, Jan 3 at 7:05 AM";
const referenceTimestamp = Date.now();
const timezone = "America/Los_Angeles";

console.log("Reference time:", new Date(referenceTimestamp).toISOString());
console.log("Parsing:", dateText);
console.log("Timezone:", timezone);

const result = parseTemporalExpression(dateText, {
    referenceTimestamp,
    referenceTimezone: timezone,
    preferBusinessDays: true,
    localeHint: "US",
    holidays: [],
});

if (result) {
    console.log("Parsed timestamp:", result.timestamp);
    console.log("As ISO:", new Date(result.timestamp).toISOString());
    console.log("As local PST:", new Date(result.timestamp).toLocaleString("en-US", { timeZone: timezone }));
    console.log("Components:", result.components);
} else {
    console.log("Failed to parse");
}
