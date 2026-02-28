/**
 * Core state interface for GhostGate lifecycle management.
 */
export interface TokenMetrics {
    toolsActivated: number;
    schemasInjected: number;
    estimatedTokensSaved: number;
    toolCallsIntercepted: number;
    contextPrunes: number;
    lastReset: Date;
}
export interface GhostGateState {
    activeTools: Set<string>;
    lastStatus: string;
    tokenMetrics: TokenMetrics;
}
/**
 * Initializes a fresh metrics object.
 */
export declare const createTokenMetrics: () => TokenMetrics;
/**
 * Estimates token count based on standard 4-character-per-token heuristic.
 * Used for rapid in-process calculation without external heavy libraries.
 */
export declare const estimateTokenCount: (text: string) => number;
/**
 * Estimates the token weight of a tool schema JSON.
 */
export declare const estimateSchemaTokens: (schema: Record<string, unknown>) => number;
/**
 * Generates a structured report object for the CLI.
 */
export declare const generateStatusReport: (state: GhostGateState, registryPath: string, storedCount: number, startTime: Date) => Promise<{
    uptime: string;
    registryPath: string;
    storedCount: number;
    activeCount: number;
    activeTools: string[];
    metrics: TokenMetrics;
}>;
/**
 * Formats the diagnostic report into a high-density CLI table.
 */
export declare const formatStatusOutput: (report: any) => string;
//# sourceMappingURL=status.d.ts.map