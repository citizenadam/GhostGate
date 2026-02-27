// .opencode/plugin/ghostgate/index.ts
import type { Plugin } from "@opencode-ai/plugin";
import { tool, fs } from "@opencode-ai/plugin";

/**
 * GhostGate: Zero-Process Context Orchestrator
 * Comprehensive in-process implementation of MCP routing and DCP pruning.
 */
export const GhostGate: Plugin = (async (ctx) => {
    // 1. CONFIGURATION & STATE
    const REGISTRY_PATH = './.opencode/ghostgate/registry';
    const state = {
        activeTools: new Set<string>(),
        lastStatus: "initialized"
    };

    // 2. AUTOMATED BOOTSTRAPPING
    // Mimics 'mkdir -p' and ensures environment readiness on load
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
        console.error("[GhostGate] Setup Failed:", err);
    }

    // 3. INTERNAL REGISTRY LOADER
    const getRegistry = async () => {
        try {
            const files = await fs.readdir(REGISTRY_PATH);
            const registry: Record<string, any> = {};
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const content = await fs.readFile(`${REGISTRY_PATH}/${file}`, 'utf-8');
                    const parsed = JSON.parse(content);
                    registry[parsed.name] = parsed;
                }
            }
            return registry;
        } catch { return {}; }
    };

    return {
        // 4. COMMAND INTERCEPTION (Internal Status Check)
        "command.execute.before": async (input) => {
            if (input.command === "ghostgate" && input.args[0] === "status") {
                const files = await fs.readdir(REGISTRY_PATH).catch(() => []);
                const report = [
                    "--- GhostGate Status ---",
                    `Runtime: In-Process`,
                    `Registry: ${REGISTRY_PATH}`,
                    `Stored Tools: ${files.length}`,
                    `Active Tools: ${state.activeTools.size}`,
                    `Current Context: ${state.activeTools.size > 0 ? Array.from(state.activeTools).join(", ") : "Empty"}`,
                    "------------------------"
                ].join("\n");
                
                return { status: "success", output: report, halt: true };
            }
        },

        // 5. SYSTEM PROMPT TRANSFORMATION (DCP Pattern)
        // Prunes context by only injecting schemas for "Activated" tools
        "experimental.chat.system.transform": async (input: { prompt: string }) => {
            if (state.activeTools.size === 0) return input.prompt;
            
            const registry = await getRegistry();
            const activeSchemas = Array.from(state.activeTools)
                .filter(name => registry[name])
                .map(name => `[TOOL_DEFINITION]: ${name}\n${JSON.stringify(registry[name])}`)
                .join("\n\n");

            return `${input.prompt}\n\n[GHOSTGATE ACTIVE TOOLS]:\n${activeSchemas}`;
        },

        // 6. NATIVE CONFIG MUTATION
        config: async (opencodeConfig) => {
            // Register CLI command
            opencodeConfig.command ??= {};
            opencodeConfig.command["ghostgate"] = {
                description: "Diagnostic and management commands for GhostGate.",
                template: "usage: /ghostgate status"
            };

            // Promote core tools to primary status
            const core = ["search_ghost_tools", "activate_ghost_tool", "execute_ghost_action", "purge_ghost_context"];
            opencodeConfig.experimental = {
                ...opencodeConfig.experimental,
                primary_tools: [...new Set([...(opencodeConfig.experimental?.primary_tools ?? []), ...core])]
            };
        },

        // 7. CORE TOOLSET
        tool: {
            search_ghost_tools: tool({
                description: 'Search the GhostGate registry for tools. Minimizes initial token bloat.',
                args: { query: tool.schema.string() },
                async execute({ query }) {
                    const registry = await getRegistry();
                    const matches = Object.keys(registry).filter(n => n.includes(query));
                    return matches.length > 0 
                        ? `Matches found: ${matches.join(', ')}. Use 'activate_ghost_tool' to load a specific schema.`
                        : "No matching tools found in registry.";
                }
            }),

            activate_ghost_tool: tool({
                description: 'Injects a specific tool schema into the active system context.',
                args: { toolName: tool.schema.string() },
                async execute({ toolName }) {
                    const registry = await getRegistry();
                    if (!registry[toolName]) return `Error: Tool '${toolName}' not found.`;
                    state.activeTools.add(toolName);
                    return `Activated: ${toolName}. Schema is now visible in your system prompt.`;
                }
            }),

            execute_ghost_action: tool({
                description: 'Executes a verified ghost tool action using in-process logic.',
                args: { 
                    toolName: tool.schema.string(),
                    parameters: tool.schema.any()
                },
                async execute({ toolName, parameters }) {
                    if (!state.activeTools.has(toolName)) return `Error: Activate '${toolName}' first.`;
                    
                    // Direct execution logic (can be expanded to fs or shell commands)
                    return { status: "success", tool: toolName, output: "Action simulated successfully.", data: parameters };
                }
            }),

            purge_ghost_context: tool({
                description: 'Clears all activated tool schemas to reset context and save tokens.',
                args: {},
                async execute() {
                    state.activeTools.clear();
                    return "GhostGate context purged. Metadata removed from system prompt.";
                }
            })
        }
    };
}) satisfies Plugin;

export default GhostGate;