import type { PluginInput } from "@opencode-ai/plugin";
/**
 * GhostGate Plugin Configuration
 *
 * Config file locations (in order of precedence):
 * 1. Project: <project>/.opencode/ghostgate.jsonc|json
 * 2. Config Dir: $OPENCODE_CONFIG_DIR/ghostgate.jsonc|json
 * 3. Global: ~/.config/opencode/ghostgate.jsonc|json
 *
 * Higher precedence configs override lower ones.
 */
export interface RegistryConfig {
    /** Enable or disable the registry system */
    enabled: boolean;
    /** Path to the registry directory (relative to project or absolute) */
    path: string;
}
export interface PruningConfig {
    /** Enable automatic tool result pruning */
    enabled: boolean;
    /** Maximum tokens for pruned results */
    maxTokens: number;
    /** Minimum token count before pruning is applied */
    minTokens: number;
}
export interface MetricsConfig {
    /** Enable metrics tracking */
    enabled: boolean;
    /** Show metrics in status command */
    showInStatus: boolean;
}
export interface CommandsConfig {
    /** Enable /ghostgate commands */
    enabled: boolean;
}
export interface PluginConfig {
    /** Enable or disable the plugin */
    enabled: boolean;
    /** Enable debug logging */
    debug: boolean;
    /** Registry configuration */
    registry: RegistryConfig;
    /** Pruning configuration */
    pruning: PruningConfig;
    /** Metrics configuration */
    metrics: MetricsConfig;
    /** Commands configuration */
    commands: CommandsConfig;
}
/**
 * Get the effective configuration for GhostGate
 *
 * Loads config from multiple locations and merges them with precedence:
 * Project > Config Dir > Global > Defaults
 */
export declare function getConfig(ctx: PluginInput): PluginConfig;
/**
 * Resolve the registry path to an absolute path
 */
export declare function resolveRegistryPath(config: PluginConfig, workingDirectory: string): string;
//# sourceMappingURL=config.d.ts.map