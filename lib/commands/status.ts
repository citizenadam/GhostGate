// GhostGate Status Command Handler
// Provides diagnostic information about the plugin state

import type { PluginContext } from "@opencode-ai/plugin";

export interface GhostGateState {
    activeTools: Set<string>;
    lastStatus: string;
    tokenMetrics: TokenMetrics;
}

export interface TokenMetrics {
    toolsActivated: number;
    schemasInjected: number;
    estimatedTokensSaved: number;
    toolCallsIntercepted: number;
    contextPrunes: number;
    lastReset: Date;
}

export function createTokenMetrics(): TokenMetrics {
    return {
        toolsActivated: 0,
        schemasInjected: 0,
        estimatedTokensSaved: 0,
        toolCallsIntercepted: 0,
        contextPrunes: 0,
        lastReset: new Date()
    };
}

export interface StatusReport {
    runtime: string;
    registry: string;
    storedTools: number;
    activeTools: number;
    activeToolNames: string[];
    tokenMetrics: TokenMetrics;
    uptime: string;
}

export async function generateStatusReport(
    state: GhostGateState,
    registryPath: string,
    storedToolCount: number,
    startTime: Date
): Promise<StatusReport> {
    const now = new Date();
    const uptimeMs = now.getTime() - startTime.getTime();
    const uptime = formatUptime(uptimeMs);

    return {
        runtime: "In-Process",
        registry: registryPath,
        storedTools: storedToolCount,
        activeTools: state.activeTools.size,
        activeToolNames: Array.from(state.activeTools),
        tokenMetrics: state.tokenMetrics,
        uptime
    };
}

export function formatStatusOutput(report: StatusReport): string {
    const lines = [
        "╔══════════════════════════════════════════════════════════════╗",
        "║                    GhostGate Status                          ║",
        "╠══════════════════════════════════════════════════════════════╣",
        `║ Runtime:          ${report.runtime.padEnd(42)}║`,
        `║ Registry:         ${report.registry.padEnd(42)}║`,
        `║ Uptime:           ${report.uptime.padEnd(42)}║`,
        "╠══════════════════════════════════════════════════════════════╣",
        "║ Tool Registry                                                ║",
        `║   Stored Tools:   ${String(report.storedTools).padEnd(42)}║`,
        `║   Active Tools:   ${String(report.activeTools).padEnd(42)}║`,
        report.activeToolNames.length > 0 
            ? `║   Active Names:   ${report.activeToolNames.join(", ").slice(0, 42).padEnd(42)}║`
            : `║   Active Names:   (none)                                    ║`,
        "╠══════════════════════════════════════════════════════════════╣",
        "║ Token Metrics                                                ║",
        `║   Tools Activated:    ${String(report.tokenMetrics.toolsActivated).padEnd(38)}║`,
        `║   Schemas Injected:   ${String(report.tokenMetrics.schemasInjected).padEnd(38)}║`,
        `║   Est. Tokens Saved:  ${String(report.tokenMetrics.estimatedTokensSaved).padEnd(38)}║`,
        `║   Calls Intercepted:  ${String(report.tokenMetrics.toolCallsIntercepted).padEnd(38)}║`,
        `║   Context Prunes:     ${String(report.tokenMetrics.contextPrunes).padEnd(38)}║`,
        "╚══════════════════════════════════════════════════════════════╝"
    ];

    return lines.join("\n");
}

function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Token estimation utilities
export function estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This is a conservative estimate; actual tokenization varies
    return Math.ceil(text.length / 4);
}

export function estimateSchemaTokens(schema: Record<string, unknown>): number {
    const schemaString = JSON.stringify(schema);
    return estimateTokenCount(schemaString);
}

export function calculateTokensSaved(
    inactiveToolCount: number,
    avgSchemaSize: number = 200 // Average tokens per tool schema
): number {
    return inactiveToolCount * avgSchemaSize;
}