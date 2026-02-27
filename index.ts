// .opencode/plugin/ghostgate/index.ts
import type { Plugin } from "@opencode-ai/plugin";
import { tool, fs } from "@opencode-ai/plugin";

/**
 * GhostGate: Zero-Process Context Orchestrator & Pruning Engine
 * * Features:
 * - Automated Environment Setup: Self-creates registry directories.
 * - Dynamic Context Pruning: Injects tool schemas only when active.
 * - In-Process Execution: Zero external Node.js dependencies.
 */
export const GhostGate: Plugin = (async (ctx) => {
    // 1. AUTOMATED ENVIRONMENT SETUP
    const REGISTRY_PATH = './.opencode/ghostgate/registry';
    
    try {
        const stats = await fs.stat(REGISTRY_PATH).catch(() => null);
        if (!stats) {
            // Recursive creation mimics 'mkdir -p'
            await fs.mkdir(REGISTRY_PATH, { recursive: true });
            const welcomeSchema = {
                name: "example_tool",
                description: "A placeholder tool for GhostGate.",
                parameters: { input: "string" }
            };
            await fs.writeFile(
                `${REGISTRY_PATH}/example.json`, 
                JSON.stringify(welcomeSchema, null, 2)
            );
        }
    } catch (err) {
        // Log setup errors to the OpenCode console
        console.error("[GhostGate] Initialization Error:", err);
    }

    // 2. SESSION STATE
    const state = {
        activeTools: new Set<string>(),
        sessionID: ctx.directory
    };

    // 3. REGISTRY HELPER
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
        // 4. CONTEXT PRUNING (DCP PATTERN)
        // Dynamically modifies the system prompt to include only 'Activated' tools
        "experimental.chat.system.transform": async (input: { prompt: string }) => {
            if (state.activeTools.size === 0) return input.prompt;
            
            const registry = await getRegistry();
            const activeSchemas = Array.from(state.activeTools)
                .filter(name => registry[name])
                .map(name => `Tool: ${name}\nSchema: ${JSON.stringify(registry[name])}`)
                .join("\n\n");

            return `${input.prompt}\n\n[GHOSTGATE ACTIVE REGISTRY]:\n${activeSchemas}`;
        },

        // 5. NATIVE CONFIG MUTATION
        // Promotes GhostGate tools to primary status automatically
        config: async (opencodeConfig) => {
            const ghostCoreTools = ["search_ghost_tools", "activate_ghost_tool", "execute_ghost_action", "purge_ghost_context"];
            opencodeConfig.experimental = {
                ...opencodeConfig.experimental,
                primary_tools: [
                    ...new Set([...(opencodeConfig.experimental?.primary_tools ?? []), ...ghostCoreTools])
                ]
            };
        },

        // 6. GHOSTGATE CORE TOOLS
        tool: {
            search_ghost_tools: tool({
                description: 'Search the internal registry for specialized tools while minimizing initial context.',
                args: { query: tool.schema.string().describe('Search term for tool names or descriptions') },
                async execute({ query }) {
                    const registry = await getRegistry();
                    const matches = Object.keys(registry).filter(n => 
                        n.toLowerCase().includes(query.toLowerCase()) || 
                        registry[n].description.toLowerCase().includes(query.toLowerCase())
                    );
                    return matches.length > 0 
                        ? `Found matches: ${matches.join(', ')}. Use 'activate_ghost_tool' to load a schema.` 
                        : "No matching tools found in registry.";
                }
            }),

            activate_ghost_tool: tool({
                description: 'Loads a tool schema into the active session context.',
                args: { toolName: tool.schema.string().describe('The specific tool name to activate') },
                async execute({ toolName }) {
                    const registry = await getRegistry();
                    if (!registry[toolName]) return `Error: '${toolName}' not found.`;
                    
                    state.activeTools.add(toolName);
                    return `Success: ${toolName} schema injected into system prompt. You can now use it via 'execute_ghost_action'.`;
                }
            }),

            execute_ghost_action: tool({
                description: 'Executes a validated action for an activated ghost tool.',
                args: { 
                    toolName: tool.schema.string(),
                    parameters: tool.schema.any().describe('Arguments as defined by the tool schema')
                },
                async execute({ toolName, parameters }) {
                    if (!state.activeTools.has(toolName)) {
                        return `Error: Tool '${toolName}' is not activated. Use 'activate_ghost_tool' first.`;
                    }
                    
                    // Logic: Implement specific internal handlers or proxy to system APIs here.
                    return {
                        status: "success",
                        tool: toolName,
                        results: "Action simulated successfully in-process.",
                        timestamp: new Date().toISOString()
                    };
                }
            }),

            purge_ghost_context: tool({
                description: 'Deactivates all ghost tools to reset context and save tokens.',
                args: {},
                async execute() {
                    state.activeTools.clear();
                    return "Registry context purged. All ghost tools moved to cold storage.";
                }
            })
        }
    };
}) satisfies Plugin;

export default GhostGate;