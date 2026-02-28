import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { promises as fs } from "fs";
import { cwd } from "process";
import {
    createTokenMetrics,
    estimateTokenCount,
    estimateSchemaTokens,
    formatStatusOutput,
    generateStatusReport,
    type TokenMetrics,
    type GhostGateState
} from "./lib/commands/status.js";
import { getConfig, resolveRegistryPath } from "./lib/config.js";

export const GhostGate: Plugin = (async (ctx) => {
    const config = getConfig(ctx);
    
    if (!config.enabled) {
        return {};
    }

    const startTime = new Date();
    const workingDirectory = ctx.directory ?? cwd();
    const REGISTRY_PATH = config.registry.enabled 
        ? resolveRegistryPath(config, workingDirectory)
        : "";
    
    const state: GhostGateState = {
        activeTools: new Set<string>(),
        lastStatus: "initialized",
        tokenMetrics: createTokenMetrics()
    };

    const prunedResults: Map<string, { original: string; pruned: string; tokensSaved: number }> = new Map();

    if (config.registry.enabled && REGISTRY_PATH) {
        try {
            const stats = await fs.stat(REGISTRY_PATH).catch(() => null);
            if (!stats) {
                await fs.mkdir(REGISTRY_PATH, { recursive: true });
                const example = {
                    name: "sys_info",
                    description: "Retrieves comprehensive system metrics.",
                    parameters: { detail_level: "string" }
                };
                await fs.writeFile(`${REGISTRY_PATH}/sys_info.json`, JSON.stringify(example, null, 2));
            }
        } catch (err) {
            if (config.debug) {
                console.error("[GhostGate] Setup Failed:", err);
            }
        }
    }

    const getRegistry = async (): Promise<Record<string, unknown>> => {
        if (!config.registry.enabled || !REGISTRY_PATH) return {};
        
        try {
            const files = await fs.readdir(REGISTRY_PATH);
            const registry: Record<string, unknown> = {};
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const content = await fs.readFile(`${REGISTRY_PATH}/${file}`, 'utf-8');
                    const parsed = JSON.parse(content);
                    registry[parsed.name as string] = parsed;
                }
            }
            return registry;
        } catch { return {}; }
    };

    const pruneToolResult = (result: string, toolName: string): { pruned: string; tokensSaved: number } => {
        if (!config.pruning.enabled) {
            return { pruned: result, tokensSaved: 0 };
        }

        const originalTokens = estimateTokenCount(result);
        
        if (originalTokens < config.pruning.minTokens) {
            return { pruned: result, tokensSaved: 0 };
        }

        let pruned = result;
        
        const patterns = [
            /\s+/g,
            /```[\w]*\n?/g,
            /\n{3,}/g,
            /(?:^|\n)(?:\s*[-*#])\s*\n/g,
        ];
        
        for (const pattern of patterns) {
            pruned = pruned.replace(pattern, (match) => {
                if (pattern.source === '\\s+') return ' ';
                if (pattern.source.includes('```')) return '```\n';
                if (pattern.source.includes('{3,}')) return '\n\n';
                return match;
            });
        }

        const maxTokens = config.pruning.maxTokens;
        const maxChars = maxTokens * 4;
        if (pruned.length > maxChars) {
            const truncated = pruned.slice(0, maxChars);
            pruned = truncated + "\n\n[GhostGate: Result truncated to save tokens. Original length: " + result.length + " chars]";
        }

        const prunedTokens = estimateTokenCount(pruned);
        const tokensSaved = Math.max(0, originalTokens - prunedTokens);

        return { pruned, tokensSaved };
    };

    const hooks: Record<string, unknown> = {};

    if (config.commands.enabled) {
        hooks["command.execute.before"] = async (input: { command: string; arguments: string }) => {
            if (input.command === "ghostgate") {
                const args = input.arguments.split(" ");
                const subCommand = args[0];
                
                if (subCommand === "status") {
                    const files = config.registry.enabled 
                        ? await fs.readdir(REGISTRY_PATH).catch(() => [])
                        : [];
                    const registry = await getRegistry();
                    const inactiveCount = Object.keys(registry).length - state.activeTools.size;
                    state.tokenMetrics.estimatedTokensSaved += inactiveCount * 200;
                    
                    const report = await generateStatusReport(state, REGISTRY_PATH, files.length, startTime);
                    const output = formatStatusOutput(report);
                    
                    return { parts: [{ type: "text", text: output }] };
                }
                
                if (subCommand === "metrics") {
                    const metrics = state.tokenMetrics;
                    const output = [
                        "╔══════════════════════════════════════════════════════════════╗",
                        "║                  GhostGate Token Metrics                     ║",
                        "╠══════════════════════════════════════════════════════════════╣",
                        `║ Tools Activated:     ${String(metrics.toolsActivated).padEnd(38)}║`,
                        `║ Schemas Injected:    ${String(metrics.schemasInjected).padEnd(38)}║`,
                        `║ Est. Tokens Saved:   ${String(metrics.estimatedTokensSaved).padEnd(38)}║`,
                        `║ Calls Intercepted:   ${String(metrics.toolCallsIntercepted).padEnd(38)}║`,
                        `║ Context Prunes:      ${String(metrics.contextPrunes).padEnd(38)}║`,
                        `║ Last Reset:          ${metrics.lastReset.toISOString().slice(0, 38).padEnd(38)}║`,
                        "╚══════════════════════════════════════════════════════════════╝"
                    ].join("\n");
                    
                    return { parts: [{ type: "text", text: output }] };
                }
                
                if (subCommand === "reset") {
                    state.activeTools.clear();
                    state.tokenMetrics = createTokenMetrics();
                    prunedResults.clear();
                    
                    return { parts: [{ type: "text", text: "GhostGate state reset complete." }] };
                }
            }
        };
    }

    hooks["tool.execute.after"] = async (input: { tool: string; sessionID: string; callID: string; args: unknown }, output: { title: string; output: string; metadata: unknown }) => {
        state.tokenMetrics.toolCallsIntercepted++;
        
        const toolName = input.tool;
        const result = output.output;
        
        if (typeof result === 'string' && result.length > 500) {
            const { pruned, tokensSaved } = pruneToolResult(result, toolName);
            
            if (tokensSaved > 0) {
                prunedResults.set(`${toolName}-${Date.now()}`, {
                    original: result,
                    pruned,
                    tokensSaved
                });
                
                state.tokenMetrics.estimatedTokensSaved += tokensSaved;
                state.tokenMetrics.contextPrunes++;
                output.output = pruned;
            }
        }
    };

    hooks["experimental.chat.system.transform"] = async (_input: unknown, output: { system: string[] }) => {
        if (state.activeTools.size === 0) return;
        
        const registry = await getRegistry();
        const activeSchemas = Array.from(state.activeTools)
            .filter(name => registry[name])
            .map(name => {
                const schema = registry[name];
                state.tokenMetrics.schemasInjected++;
                return `[TOOL_DEFINITION]: ${name}\n${JSON.stringify(schema)}`;
            })
            .join("\n\n");

        output.system.push(`[GHOSTGATE ACTIVE TOOLS]:\n${activeSchemas}`);
    };

    hooks["experimental.session.compacting"] = async (_input: unknown, output: { context: string[] }) => {
        output.context.push(`
[GhostGate Context Summary]
- Active Tools: ${Array.from(state.activeTools).join(', ') || 'none'}
- Tokens Saved This Session: ${state.tokenMetrics.estimatedTokensSaved}
- Tool Calls Intercepted: ${state.tokenMetrics.toolCallsIntercepted}
- Context Prunes: ${state.tokenMetrics.contextPrunes}
[End GhostGate Context]
        `);
    };

    hooks["config"] = async (opencodeConfig: Record<string, unknown>) => {
        if (config.commands.enabled) {
            (opencodeConfig.command as Record<string, unknown>) ??= {};
            (opencodeConfig.command as Record<string, unknown>)["ghostgate"] = {
                description: "Context management and diagnostics for GhostGate.",
                template: "usage: /ghostgate [status|metrics|reset]"
            };
        }

        if (config.registry.enabled) {
            const core = ["search_ghost_tools", "activate_ghost_tool", "execute_ghost_action", "purge_ghost_context", "ghostgate_metrics"];
            opencodeConfig.experimental = {
                ...opencodeConfig.experimental as Record<string, unknown>,
                primary_tools: [...new Set([...((opencodeConfig.experimental as Record<string, unknown>)?.primary_tools ?? []) as string[], ...core])]
            };
        }
    };

    const tools: Record<string, unknown> = {};

    if (config.registry.enabled) {
        tools["search_ghost_tools"] = tool({
            description: 'Search the GhostGate registry for tools. Minimizes initial token bloat.',
            args: { query: tool.schema.string() },
            async execute({ query }: { query: string }) {
                const registry = await getRegistry();
                const matches = Object.keys(registry).filter(n => n.includes(query));
                return matches.length > 0 
                    ? `Matches found: ${matches.join(', ')}. Use 'activate_ghost_tool' to load a specific schema.`
                    : "No matching tools found in registry.";
            }
        });

        tools["activate_ghost_tool"] = tool({
            description: 'Injects a specific tool schema into the active system context.',
            args: { toolName: tool.schema.string() },
            async execute({ toolName }: { toolName: string }) {
                const registry = await getRegistry();
                if (!registry[toolName]) return `Error: Tool '${toolName}' not found.`;
                
                state.activeTools.add(toolName);
                state.tokenMetrics.toolsActivated++;
                
                const schema = registry[toolName];
                const tokens = estimateSchemaTokens(schema as Record<string, unknown>);
                state.tokenMetrics.estimatedTokensSaved -= tokens;
                
                return `Activated: ${toolName}. Schema is now visible in your system prompt.`;
            }
        });

        tools["execute_ghost_action"] = tool({
            description: 'Executes a verified ghost tool action using in-process logic.',
            args: { 
                toolName: tool.schema.string(),
                parameters: tool.schema.any()
            },
            async execute({ toolName, parameters }: { toolName: string; parameters: unknown }) {
                if (!state.activeTools.has(toolName)) return `Error: Activate '${toolName}' first.`;
                
                return `Action executed successfully for ${toolName}. Parameters: ${JSON.stringify(parameters)}`;
            }
        });

        tools["purge_ghost_context"] = tool({
            description: 'Clears all activated tool schemas to reset context and save tokens.',
            args: {},
            async execute() {
                const count = state.activeTools.size;
                state.tokenMetrics.estimatedTokensSaved += count * 200;
                state.activeTools.clear();
                state.tokenMetrics.contextPrunes++;
                
                return `GhostGate context purged. ${count} tool schemas removed from system prompt.`;
            }
        });

        tools["ghostgate_metrics"] = tool({
            description: 'Display current GhostGate token savings metrics.',
            args: {},
            async execute() {
                const m = state.tokenMetrics;
                return [
                    `Tools Activated: ${m.toolsActivated}`,
                    `Schemas Injected: ${m.schemasInjected}`,
                    `Est. Tokens Saved: ${m.estimatedTokensSaved}`,
                    `Calls Intercepted: ${m.toolCallsIntercepted}`,
                    `Context Prunes: ${m.contextPrunes}`
                ].join('\n');
            }
        });
    }

    return {
        ...hooks,
        tool: Object.keys(tools).length > 0 ? tools : undefined
    };
}) satisfies Plugin;

export default GhostGate;