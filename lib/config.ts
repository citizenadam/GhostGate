import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import { parse } from "jsonc-parser"
import type { PluginInput } from "@opencode-ai/plugin"

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
    enabled: boolean
    /** Path to the registry directory (relative to project or absolute) */
    path: string
}

export interface PruningConfig {
    /** Enable automatic tool result pruning */
    enabled: boolean
    /** Maximum tokens for pruned results */
    maxTokens: number
    /** Minimum token count before pruning is applied */
    minTokens: number
}

export interface MetricsConfig {
    /** Enable metrics tracking */
    enabled: boolean
    /** Show metrics in status command */
    showInStatus: boolean
}

export interface CommandsConfig {
    /** Enable /ghostgate commands */
    enabled: boolean
}

export interface PluginConfig {
    /** Enable or disable the plugin */
    enabled: boolean
    /** Enable debug logging */
    debug: boolean
    /** Registry configuration */
    registry: RegistryConfig
    /** Pruning configuration */
    pruning: PruningConfig
    /** Metrics configuration */
    metrics: MetricsConfig
    /** Commands configuration */
    commands: CommandsConfig
}

const defaultConfig: PluginConfig = {
    enabled: true,
    debug: false,
    registry: {
        enabled: true,
        path: "./.opencode/ghostgate/registry",
    },
    pruning: {
        enabled: true,
        maxTokens: 2000,
        minTokens: 100,
    },
    metrics: {
        enabled: true,
        showInStatus: true,
    },
    commands: {
        enabled: true,
    },
}

const GLOBAL_CONFIG_DIR = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, "opencode")
    : join(homedir(), ".config", "opencode")
const GLOBAL_CONFIG_PATH_JSONC = join(GLOBAL_CONFIG_DIR, "ghostgate.jsonc")
const GLOBAL_CONFIG_PATH_JSON = join(GLOBAL_CONFIG_DIR, "ghostgate.json")

/**
 * Find the .opencode directory starting from a given directory
 */
function findOpencodeDir(startDir: string): string | null {
    let current = startDir
    while (current !== "/") {
        const candidate = join(current, ".opencode")
        if (existsSync(candidate) && statSync(candidate).isDirectory()) {
            return candidate
        }
        const parent = dirname(current)
        if (parent === current) break
        current = parent
    }
    return null
}

/**
 * Get config file paths for all locations
 */
function getConfigPaths(ctx?: PluginInput): {
    global: string | null
    configDir: string | null
    project: string | null
} {
    let globalPath: string | null = null
    if (existsSync(GLOBAL_CONFIG_PATH_JSONC)) {
        globalPath = GLOBAL_CONFIG_PATH_JSONC
    } else if (existsSync(GLOBAL_CONFIG_PATH_JSON)) {
        globalPath = GLOBAL_CONFIG_PATH_JSON
    }

    let configDirPath: string | null = null
    const opencodeConfigDir = process.env.OPENCODE_CONFIG_DIR
    if (opencodeConfigDir) {
        const configJsonc = join(opencodeConfigDir, "ghostgate.jsonc")
        const configJson = join(opencodeConfigDir, "ghostgate.json")
        if (existsSync(configJsonc)) {
            configDirPath = configJsonc
        } else if (existsSync(configJson)) {
            configDirPath = configJson
        }
    }

    let projectPath: string | null = null
    if (ctx?.directory) {
        const opencodeDir = findOpencodeDir(ctx.directory)
        if (opencodeDir) {
            const projectJsonc = join(opencodeDir, "ghostgate.jsonc")
            const projectJson = join(opencodeDir, "ghostgate.json")
            if (existsSync(projectJsonc)) {
                projectPath = projectJsonc
            } else if (existsSync(projectJson)) {
                projectPath = projectJson
            }
        }
    }

    return { global: globalPath, configDir: configDirPath, project: projectPath }
}

/**
 * Create the default global config file
 */
function createDefaultConfig(): void {
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
        mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true })
    }

    const configContent = `{
  "$schema": "https://raw.githubusercontent.com/opencode-ai/ghostgate/main/ghostgate.schema.json"
}
`
    writeFileSync(GLOBAL_CONFIG_PATH_JSONC, configContent, "utf-8")
}

interface ConfigLoadResult {
    data: Record<string, unknown> | null
    parseError?: string
}

/**
 * Load and parse a config file
 */
function loadConfigFile(configPath: string): ConfigLoadResult {
    let fileContent: string
    try {
        fileContent = readFileSync(configPath, "utf-8")
    } catch {
        return { data: null }
    }

    try {
        const parsed = parse(fileContent)
        if (parsed === undefined || parsed === null) {
            return { data: null, parseError: "Config file is empty or invalid" }
        }
        return { data: parsed }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to parse config"
        return { data: null, parseError: message }
    }
}

/**
 * Deep clone config to avoid mutation
 */
function deepCloneConfig(config: PluginConfig): PluginConfig {
    return {
        ...config,
        registry: { ...config.registry },
        pruning: { ...config.pruning },
        metrics: { ...config.metrics },
        commands: { ...config.commands },
    }
}

/**
 * Merge partial config with base config
 */
function mergeConfig(
    base: PluginConfig,
    override?: Partial<PluginConfig>
): PluginConfig {
    if (!override) return base

    return {
        enabled: override.enabled ?? base.enabled,
        debug: override.debug ?? base.debug,
        registry: {
            enabled: override.registry?.enabled ?? base.registry.enabled,
            path: override.registry?.path ?? base.registry.path,
        },
        pruning: {
            enabled: override.pruning?.enabled ?? base.pruning.enabled,
            maxTokens: override.pruning?.maxTokens ?? base.pruning.maxTokens,
            minTokens: override.pruning?.minTokens ?? base.pruning.minTokens,
        },
        metrics: {
            enabled: override.metrics?.enabled ?? base.metrics.enabled,
            showInStatus: override.metrics?.showInStatus ?? base.metrics.showInStatus,
        },
        commands: {
            enabled: override.commands?.enabled ?? base.commands.enabled,
        },
    }
}

/**
 * Get the effective configuration for GhostGate
 * 
 * Loads config from multiple locations and merges them with precedence:
 * Project > Config Dir > Global > Defaults
 */
export function getConfig(ctx: PluginInput): PluginConfig {
    let config = deepCloneConfig(defaultConfig)
    const configPaths = getConfigPaths(ctx)

    if (configPaths.global) {
        const result = loadConfigFile(configPaths.global)
        if (result.data) {
            config = mergeConfig(config, result.data as Partial<PluginConfig>)
        }
    } else {
        createDefaultConfig()
    }

    if (configPaths.configDir) {
        const result = loadConfigFile(configPaths.configDir)
        if (result.data) {
            config = mergeConfig(config, result.data as Partial<PluginConfig>)
        }
    }

    if (configPaths.project) {
        const result = loadConfigFile(configPaths.project)
        if (result.data) {
            config = mergeConfig(config, result.data as Partial<PluginConfig>)
        }
    }

    return config
}

/**
 * Resolve the registry path to an absolute path
 */
export function resolveRegistryPath(config: PluginConfig, workingDirectory: string): string {
    const registryPath = config.registry.path
    
    if (registryPath.startsWith("/")) {
        return registryPath
    }
    
    return join(workingDirectory, registryPath)
}
