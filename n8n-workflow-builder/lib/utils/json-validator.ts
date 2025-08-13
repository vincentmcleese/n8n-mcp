/**
 * JSON Validator for Claude Responses
 *
 * Simple validator to ensure JSON responses are properly formatted
 * before parsing. This is a safety net - the prefill approach should
 * handle most cases correctly.
 */

import { loggers } from "./logger";

/**
 * Validate and fix common JSON issues in Claude responses
 */
export function validateAndFixJson(content: string, prefill: string): string {
  let fixed = content;

  // Only apply fixes if we detect specific known issues
  // We trust the prefill approach but add safety for edge cases

  // 1. Check for unclosed braces/brackets
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;

  if (openBraces > closeBraces) {
    const missing = openBraces - closeBraces;
    fixed += "}".repeat(missing);
    loggers.claude.debug(`Added ${missing} closing brace(s)`);
  }

  if (openBrackets > closeBrackets) {
    const missing = openBrackets - closeBrackets;
    fixed += "]".repeat(missing);
    loggers.claude.debug(`Added ${missing} closing bracket(s)`);
  }

  // 2. Validate it's valid JSON
  try {
    JSON.parse(fixed);
    return fixed;
  } catch (e) {
    // If still invalid, return original and let error handling deal with it
    loggers.claude.warn("JSON validation failed after fixes");
    return content;
  }
}

/**
 * Extract just the JSON portion from a response that might have extra text
 */
export function extractJsonOnly(content: string, prefill: string): string {
  // The prefill approach means we should have valid JSON from the start
  // This is just a safety check for edge cases

  // If content starts with the prefill, it should be valid JSON
  if (content.startsWith(prefill)) {
    return content;
  }

  // Otherwise, try to find where the JSON starts
  const jsonStart = content.indexOf(prefill);
  if (jsonStart !== -1) {
    return content.substring(jsonStart);
  }

  // If we can't find the prefill, return as-is
  return content;
}
