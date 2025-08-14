// Aliases for node types that don't directly match icon filenames
// Keep this list minimal and extend as we discover gaps
export const ICON_ALIASES: Record<string, string> = {
  // Core/platform
  scheduleTrigger: "n8nTrigger",
  webhook: "webhook",
  code: "code",

  // HTTP Request uses lowercase file name
  httpRequest: "httprequest",

  // Common variations
  openAI: "openAi",
};

export function resolveIconName(baseName: string): string {
  return ICON_ALIASES[baseName] ?? baseName;
}
