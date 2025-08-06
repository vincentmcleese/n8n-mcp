/**
 * JSON Parsing with Prefill Support
 * 
 * Utilities for parsing JSON responses from Claude that use the prefill technique.
 * Handles error recovery, brace/bracket balancing, and validation.
 */

import { z } from 'zod';
import { PARSING_CONFIG } from '../constants';
import { loggers } from '@/lib/utils/logger';

// ==========================================
// Type Definitions
// ==========================================

export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: ParseError;
  recovered?: boolean; // Whether recovery was attempted
}

export interface ParseError {
  message: string;
  position?: number;
  context?: string;
  originalError?: Error;
}

export interface ParseOptions {
  attemptRecovery?: boolean;
  schema?: z.ZodSchema;
  methodName?: string; // For logging context
}

// ==========================================
// Main Parsing Functions
// ==========================================

/**
 * Parse JSON content that was generated with a prefill
 * 
 * @param prefill - The prefill string that started Claude's response
 * @param completion - Claude's completion (without prefill)
 * @param options - Parsing options including optional schema validation
 * @returns ParseResult with parsed data or error information
 */
export function parseWithPrefill<T = any>(
  prefill: string,
  completion: string,
  options: ParseOptions = {}
): ParseResult<T> {
  const fullContent = prefill + completion;
  const { attemptRecovery = PARSING_CONFIG.attemptRecovery, schema, methodName } = options;
  
  try {
    // First attempt: try parsing as-is
    const parsed = JSON.parse(fullContent);
    
    // If schema is provided, validate the parsed result
    if (schema) {
      const validationResult = schema.safeParse(parsed);
      if (!validationResult.success) {
        return {
          success: false,
          error: {
            message: 'Schema validation failed',
            originalError: validationResult.error,
          }
        };
      }
      return { success: true, data: validationResult.data };
    }
    
    return { success: true, data: parsed };
  } catch (firstError: any) {
    // If recovery is disabled, return the error immediately
    if (!attemptRecovery) {
      return createParseError(firstError, prefill, fullContent, methodName);
    }
    
    // Attempt recovery based on error type
    const recoveryResult = attemptJsonRecovery(fullContent, firstError);
    if (recoveryResult.success) {
      // If schema is provided, validate the recovered result
      if (schema && recoveryResult.data) {
        const validationResult = schema.safeParse(recoveryResult.data);
        if (!validationResult.success) {
          return {
            success: false,
            error: {
              message: 'Schema validation failed after recovery',
              originalError: validationResult.error,
            },
            recovered: true
          };
        }
        return { success: true, data: validationResult.data, recovered: true };
      }
      
      return { ...recoveryResult, recovered: true };
    }
    
    // Recovery failed, return the original error
    return createParseError(firstError, prefill, fullContent, methodName);
  }
}

/**
 * Parse JSON without prefill (standard parsing with recovery)
 */
export function parseJson<T = any>(
  content: string,
  options: ParseOptions = {}
): ParseResult<T> {
  return parseWithPrefill('', content, options);
}

// ==========================================
// Recovery Functions
// ==========================================

/**
 * Attempt to recover from JSON parsing errors
 */
function attemptJsonRecovery(content: string, error: any): ParseResult {
  // Check the type of error and attempt appropriate recovery
  if (
    error.message?.includes('after JSON') ||
    error.message?.includes('after array element') ||
    error.message?.includes('Unexpected token') ||
    error.message?.includes('Unterminated string')
  ) {
    // Try to extract valid JSON and fix common issues
    const recovered = recoverJson(content);
    if (recovered !== content) {
      try {
        const parsed = JSON.parse(recovered);
        loggers.claude.debug('Successfully recovered JSON through automatic fixing');
        return { success: true, data: parsed };
      } catch (recoveryError) {
        // Recovery attempt failed
        loggers.claude.debug('JSON recovery attempt failed');
      }
    }
  }
  
  return { success: false };
}

/**
 * Attempt to recover malformed JSON
 */
export function recoverJson(content: string): string {
  let recovered = content;
  
  // Step 1: Remove any text after the last valid JSON closing character
  recovered = truncateAfterJson(recovered);
  
  // Step 2: Balance braces and brackets
  recovered = balanceBraces(recovered);
  
  // Step 3: Fix common JSON issues
  recovered = fixCommonJsonIssues(recovered);
  
  return recovered;
}

/**
 * Truncate content after the last valid JSON structure
 */
function truncateAfterJson(content: string): string {
  // Track nesting level
  let braceLevel = 0;
  let bracketLevel = 0;
  let inString = false;
  let escapeNext = false;
  let lastValidJsonEnd = -1;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') braceLevel++;
      else if (char === '}') {
        braceLevel--;
        if (braceLevel === 0 && bracketLevel === 0) {
          lastValidJsonEnd = i + 1;
        }
      }
      else if (char === '[') bracketLevel++;
      else if (char === ']') {
        bracketLevel--;
        if (braceLevel === 0 && bracketLevel === 0) {
          lastValidJsonEnd = i + 1;
        }
      }
    }
  }
  
  // If we found a valid JSON end, truncate there
  if (lastValidJsonEnd > 0 && lastValidJsonEnd < content.length) {
    const truncated = content.substring(0, lastValidJsonEnd);
    if (truncated !== content) {
      loggers.claude.debug(`Truncated ${content.length - lastValidJsonEnd} characters after JSON`);
    }
    return truncated;
  }
  
  return content;
}

/**
 * Balance braces and brackets in JSON
 */
export function balanceBraces(content: string): string {
  // Count opening and closing braces/brackets
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/\]/g) || []).length;
  
  let result = content;
  
  // Add missing closing braces
  if (openBraces > closeBraces) {
    const missing = openBraces - closeBraces;
    result += '}'.repeat(missing);
    loggers.claude.debug(`Added ${missing} missing closing brace(s)`);
  }
  
  // Add missing closing brackets
  if (openBrackets > closeBrackets) {
    const missing = openBrackets - closeBrackets;
    result += ']'.repeat(missing);
    loggers.claude.debug(`Added ${missing} missing closing bracket(s)`);
  }
  
  return result;
}

/**
 * Fix common JSON formatting issues
 */
function fixCommonJsonIssues(content: string): string {
  let fixed = content;
  
  // Remove trailing commas in objects (,})
  fixed = fixed.replace(/,(\s*\})/g, '$1');
  
  // Remove trailing commas in arrays (,])
  fixed = fixed.replace(/,(\s*\])/g, '$1');
  
  // Fix double commas
  fixed = fixed.replace(/,,+/g, ',');
  
  // Remove comma after last element
  fixed = fixed.replace(/,(\s*)$/g, '$1');
  
  return fixed;
}

// ==========================================
// Error Handling
// ==========================================

/**
 * Create a detailed parse error with context
 */
function createParseError(
  error: any,
  prefill: string,
  fullContent: string,
  methodName?: string
): ParseResult {
  const errorMessage = error.message || 'Unknown parsing error';
  
  // Log detailed error information
  if (methodName) {
    loggers.claude.error(`Failed to parse ${methodName} response:`, errorMessage);
  } else {
    loggers.claude.error('Failed to parse JSON response:', errorMessage);
  }
  
  if (PARSING_CONFIG.errorPreviewLength > 0) {
    loggers.claude.error('Prefill was:', prefill);
    loggers.claude.error(
      'Content preview:',
      fullContent.substring(0, PARSING_CONFIG.errorPreviewLength)
    );
    
    // Show the end of content to check for truncation
    if (fullContent.length > PARSING_CONFIG.errorPreviewLength) {
      loggers.claude.error(
        'Content end:',
        fullContent.substring(fullContent.length - 100)
      );
    }
    
    loggers.claude.error('Total length:', fullContent.length);
  }
  
  // Extract error position if available
  let position: number | undefined;
  let context: string | undefined;
  
  const positionMatch = errorMessage.match(/position (\d+)/);
  if (positionMatch) {
    position = parseInt(positionMatch[1]);
    
    // Get context around error position
    if (PARSING_CONFIG.errorContextLength > 0) {
      const start = Math.max(0, position - PARSING_CONFIG.errorContextLength / 2);
      const end = Math.min(
        fullContent.length,
        position + PARSING_CONFIG.errorContextLength / 2
      );
      context = fullContent.substring(start, end);
      
      loggers.claude.error('Content around error position:', context);
    }
  }
  
  return {
    success: false,
    error: {
      message: errorMessage,
      position,
      context,
      originalError: error,
    }
  };
}

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Check if a string appears to be valid JSON without parsing
 * Useful for quick validation before expensive parsing
 */
export function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  
  // Check if it starts and ends with JSON delimiters
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    trimmed === 'null' ||
    trimmed === 'true' ||
    trimmed === 'false' ||
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed) // number
  );
}

/**
 * Extract JSON from mixed content (e.g., markdown with embedded JSON)
 */
export function extractJsonFromMixedContent(content: string): string | null {
  // Try to find JSON between code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1];
  }
  
  // Try to find JSON starting with { or [
  const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1];
  }
  
  return null;
}

// ==========================================
// Export Utilities
// ==========================================

export const JsonParser = {
  parseWithPrefill,
  parseJson,
  recoverJson,
  balanceBraces,
  looksLikeJson,
  extractJsonFromMixedContent,
};