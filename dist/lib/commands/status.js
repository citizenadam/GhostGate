// .opencode/plugin/ghostgate/lib/commands/status.ts
/**
 * Initializes a fresh metrics object.
 */
export const createTokenMetrics = () => ({
    toolsActivated: 0,
    schemasInjected: 0,
    estimatedTokensSaved: 0,
    toolCallsIntercepted: 0,
    contextPrunes: 0,
    lastReset: new Date()
});
/**
 * Estimates token count based on standard 4-character-per-token heuristic.
 * Used for rapid in-process calculation without external heavy libraries.
 */
export const estimateTokenCount = (text) => {
    if (!text)
        return 0;
    return Math.ceil(text.length / 4);
};
/**
 * Estimates the token weight of a tool schema JSON.
 */
export const estimateSchemaTokens = (schema) => {
    const str = JSON.stringify(schema);
    return estimateTokenCount(str);
};
/**
 * Generates a structured report object for the CLI.
 */
export const generateStatusReport = async (state, registryPath, storedCount, startTime) => {
    const uptime = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
    return {
        uptime: `${uptime}s`,
        registryPath,
        storedCount,
        activeCount: state.activeTools.size,
        activeTools: Array.from(state.activeTools),
        metrics: state.tokenMetrics
    };
};
/**
 * Formats the diagnostic report into a high-density CLI table.
 */
export const formatStatusOutput = (report) => {
    const lines = [
        "╔══════════════════════════════════════════════════════════════╗",
        "║                   GHOSTGATE SYSTEM DIAGNOSTIC                 ║",
        "╠══════════════════════════════════════════════════════════════╣",
        `║ Status: [ACTIVE]                  Uptime: ${report.uptime.padEnd(19)}║`,
        `║ Registry: ${report.registryPath.padEnd(51)}║`,
        `║ Stored Tools: ${String(report.storedCount).padEnd(5)}            Active Tools: ${String(report.activeCount).padEnd(16)}║`,
        "╠══════════════════════════════════════════════════════════════╣",
        `║ Active: ${report.activeTools.join(', ').slice(0, 52).padEnd(52)}║`,
        "╚══════════════════════════════════════════════════════════════╝"
    ];
    return lines.join("\n");
};
