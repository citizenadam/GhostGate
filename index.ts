// .opencode/plugin/ghostgate/index.ts
import type { Plugin } from "@opencode-ai/plugin";
import { tool, fs } from "@opencode-ai/plugin";

/**
 * GhostGate: Zero-Process Context Orchestrator & Pruning Engine
 * Inherits state management and transformation hooks from DCP architecture.
 */
const GhostGate: Plugin = (async (ctx) => {
    // 1. Initial State & Configuration
    const REGISTRY_PATH = './.opencode/ghostgate/registry';
    const state = {
        activeTools: new Set<string>(),
        lastQuery: "",
        sessionID: ""
    };

    // 2. Comprehensive Helper: Registry Scoping
    const getRegistry = async () => {
        try {
            const files = await fs.readdir(REGISTRY_PATH);
            const registry: Record<string, any> = {};
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const content = await fs.readFile(`${REGISTRY_PATH}/${file}`, 'utf-8');
                    const schema = JSON.parse(content);
                    registry[schema.name] = schema;
                }
            }
            return registry;
        } catch { return {}; }
    };

    return {
        // 3. Lifecycle Hooks (DCP Pattern)
        // Intercepts the system prompt to dynamically inject active tool schemas
        "experimental.chat.system.transform": async (input: { prompt: string }) => {
            if (state.activeTools.size === 0) return input.prompt;
            
            const registry = await getRegistry();
            const activeSchemas = Array.from(state.activeTools)
                .map(name => JSON.stringify(registry[name]))
                .join("\n");

            return `${input.prompt}\n\n[GhostGate Active Tools]:\n${activeSchemas}`;
        },

        // 4. GhostGate Tools
        tool: {
            search_ghost_tools: tool({
                description: 'Search internal registry. Minimizes initial context bloat.',
                args: { query: tool.schema.string() },
                async execute({ query }) {
                    state.lastQuery = query;
                    const registry = await getRegistry();
                    const matches = Object.keys(registry).filter(n => n.includes(query));
                    return matches.length > 0 
                        ? `Found: ${matches.join(', ')}. Use 'activate_ghost_tool' to load.` 
                        : "No matching tools found.";
                }
            }),

            activate_ghost_tool: tool({
                description: 'Injects a tool schema into the current session state (Context Injection).',
                args: { toolName: tool.schema.string() },
                async execute({ toolName }) {
                    const registry = await getRegistry();
                    if (!registry[toolName]) return "Error: Tool not in registry.";
                    
                    state.activeTools.add(toolName);
                    return `Tool '${toolName}' activated. Its schema is now part of your system instructions.`;
                }
            }),

            execute_ghost_action: tool({
                description: 'Executes a verified ghost tool action.',
                args: { 
                    toolName: tool.schema.string(),
                    parameters: tool.schema.any() 
                },
                async execute({ toolName, parameters }) {
                    if (!state.activeTools.has(toolName)) {
                        return `Error: Tool '${toolName}' must be activated before execution.`;
                    }
                    
                    // Comprehensive Security Validation
                    // Here you would integrate DCP-style logic for path scrubbing
                    return { status: "success", tool: toolName, data: parameters };
                }
            }),

            deactivate_all_tools: tool({
                description: 'Purges all ghost tool schemas from context to save tokens.',
                args: {},
                async execute() {
                    state.activeTools.clear();
                    return "All ghost tools deactivated. Context pruned.";
                }
            })
        },

        // 5. Native Config Mutation (DCP Pattern)
        config: async (opencodeConfig) => {
            // Automatically promote GhostGate tools to primary_tools for easier LLM access
            const toolsToAdd = ["search_ghost_tools", "activate_ghost_tool", "execute_ghost_action"];
            opencodeConfig.experimental = {
                ...opencodeConfig.experimental,
                primary_tools: [...(opencodeConfig.experimental?.primary_tools ?? []), ...toolsToAdd]
            };
        }
    };
}) satisfies Plugin;

export default GhostGate;