import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { parse } from "jsonc-parser";
const defaultConfig = {
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
};
const GLOBAL_CONFIG_DIR = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, "opencode")
    : join(homedir(), ".config", "opencode");
const GLOBAL_CONFIG_PATH_JSONC = join(GLOBAL_CONFIG_DIR, "ghostgate.jsonc");
const GLOBAL_CONFIG_PATH_JSON = join(GLOBAL_CONFIG_DIR, "ghostgate.json");
/**
 * Find the .opencode directory starting from a given directory
 */
function findOpencodeDir(startDir) {
    let current = startDir;
    while (current !== "/") {
        const candidate = join(current, ".opencode");
        if (existsSync(candidate) && statSync(candidate).isDirectory()) {
            return candidate;
        }
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
/**
 * Get config file paths for all locations
 */
function getConfigPaths(ctx) {
    let globalPath = null;
    if (existsSync(GLOBAL_CONFIG_PATH_JSONC)) {
        globalPath = GLOBAL_CONFIG_PATH_JSONC;
    }
    else if (existsSync(GLOBAL_CONFIG_PATH_JSON)) {
        globalPath = GLOBAL_CONFIG_PATH_JSON;
    }
    let configDirPath = null;
    const opencodeConfigDir = process.env.OPENCODE_CONFIG_DIR;
    if (opencodeConfigDir) {
        const configJsonc = join(opencodeConfigDir, "ghostgate.jsonc");
        const configJson = join(opencodeConfigDir, "ghostgate.json");
        if (existsSync(configJsonc)) {
            configDirPath = configJsonc;
        }
        else if (existsSync(configJson)) {
            configDirPath = configJson;
        }
    }
    let projectPath = null;
    if (ctx?.directory) {
        const opencodeDir = findOpencodeDir(ctx.directory);
        if (opencodeDir) {
            const projectJsonc = join(opencodeDir, "ghostgate.jsonc");
            const projectJson = join(opencodeDir, "ghostgate.json");
            if (existsSync(projectJsonc)) {
                projectPath = projectJsonc;
            }
            else if (existsSync(projectJson)) {
                projectPath = projectJson;
            }
        }
    }
    return { global: globalPath, configDir: configDirPath, project: projectPath };
}
/**
 * Create the default global config file
 */
function createDefaultConfig() {
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
        mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    }
    const configContent = `{
  "$schema": "https://raw.githubusercontent.com/opencode-ai/ghostgate/main/ghostgate.schema.json"
}
`;
    writeFileSync(GLOBAL_CONFIG_PATH_JSONC, configContent, "utf-8");
}
/**
 * Load and parse a config file
 */
function loadConfigFile(configPath) {
    let fileContent;
    try {
        fileContent = readFileSync(configPath, "utf-8");
    }
    catch {
        return { data: null };
    }
    try {
        const parsed = parse(fileContent);
        if (parsed === undefined || parsed === null) {
            return { data: null, parseError: "Config file is empty or invalid" };
        }
        return { data: parsed };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse config";
        return { data: null, parseError: message };
    }
}
/**
 * Deep clone config to avoid mutation
 */
function deepCloneConfig(config) {
    return {
        ...config,
        registry: { ...config.registry },
        pruning: { ...config.pruning },
        metrics: { ...config.metrics },
        commands: { ...config.commands },
    };
}
/**
 * Merge partial config with base config
 */
function mergeConfig(base, override) {
    if (!override)
        return base;
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
    };
}
/**
 * Get the effective configuration for GhostGate
 *
 * Loads config from multiple locations and merges them with precedence:
 * Project > Config Dir > Global > Defaults
 */
export function getConfig(ctx) {
    let config = deepCloneConfig(defaultConfig);
    const configPaths = getConfigPaths(ctx);
    if (configPaths.global) {
        const result = loadConfigFile(configPaths.global);
        if (result.data) {
            config = mergeConfig(config, result.data);
        }
    }
    else {
        createDefaultConfig();
    }
    if (configPaths.configDir) {
        const result = loadConfigFile(configPaths.configDir);
        if (result.data) {
            config = mergeConfig(config, result.data);
        }
    }
    if (configPaths.project) {
        const result = loadConfigFile(configPaths.project);
        if (result.data) {
            config = mergeConfig(config, result.data);
        }
    }
    return config;
}
/**
 * Resolve the registry path to an absolute path
 */
export function resolveRegistryPath(config, workingDirectory) {
    const registryPath = config.registry.path;
    if (registryPath.startsWith("/")) {
        return registryPath;
    }
    return join(workingDirectory, registryPath);
}
