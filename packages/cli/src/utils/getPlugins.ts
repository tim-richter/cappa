import type { PluginDef, UserConfig } from "@cappa/core";

export async function getPlugins(
  plugins: UserConfig["plugins"],
): Promise<PluginDef[]> {
  if (!plugins) {
    return [];
  }

  const loadedPlugins: PluginDef[] = [];

  for (const plugin of plugins) {
    if (typeof plugin === "function") {
      // Plugin is a function that returns PluginDef
      const pluginDef = plugin();
      loadedPlugins.push(pluginDef);
    } else {
      // Plugin is already a PluginDef
      loadedPlugins.push(plugin);
    }
  }

  return loadedPlugins;
}

export function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    "then" in value &&
    typeof (value as any).then === "function"
  );
}
