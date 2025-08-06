/**
 * JSON Recovery Utilities
 * 
 * Advanced recovery strategies for malformed JSON responses.
 * These are separated from the main parsing logic for modularity.
 */

import { loggers } from '@/lib/utils/logger';

// ==========================================
// Advanced Recovery Strategies
// ==========================================

/**
 * Remove comments from JSON-like content
 * Handles both single-line (//) and multi-line comments
 */
export function removeJsonComments(content: string): string {
  // Remove single-line comments
  let result = content.replace(/\/\/[^\n\r]*/g, '');
  
  // Remove multi-line comments  
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  
  return result;
}

/**
 * Fix unquoted keys in JSON-like objects
 * Converts JavaScript object notation to valid JSON
 */
export function fixUnquotedKeys(content: string): string {
  // Match unquoted keys and add quotes
  // This regex looks for word characters followed by a colon
  // but not inside existing strings
  return content.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
}

/**
 * Fix single quotes to double quotes
 * Converts JavaScript-style single quotes to JSON double quotes
 */
export function fixSingleQuotes(content: string): string {
  // This is tricky because we need to avoid replacing single quotes
  // inside double-quoted strings
  let result = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escapeNext = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += '"'; // Replace single quote with double quote
    } else {
      result += char;
    }
  }
  
  return result;
}

/**
 * Fix trailing data after valid JSON
 * Removes incomplete or corrupted data at the end
 */
export function removeTrailingGarbage(content: string): string {
  // Find the last complete JSON structure
  const matches = content.match(/^(.*[}\]])[^}\]]*$/);
  if (matches) {
    return matches[1];
  }
  return content;
}

/**
 * Fix incomplete string literals
 * Closes unclosed strings at the end of content
 */
export function fixIncompleteStrings(content: string): string {
  // Count quotes to see if we have an unclosed string
  let quoteCount = 0;
  let escapeNext = false;
  
  for (let i = 0; i < content.length; i++) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (content[i] === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (content[i] === '"') {
      quoteCount++;
    }
  }
  
  // If odd number of quotes, we have an unclosed string
  if (quoteCount % 2 === 1) {
    // Close the string and any open structures
    return content + '"';
  }
  
  return content;
}

/**
 * Fix array/object nesting issues
 * Attempts to close improperly nested structures
 */
export function fixNesting(content: string): string {
  const stack: ('object' | 'array')[] = [];
  let inString = false;
  let escapeNext = false;
  
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
      if (char === '{') {
        stack.push('object');
      } else if (char === '[') {
        stack.push('array');
      } else if (char === '}') {
        // Check if we're closing the right type
        if (stack.length > 0 && stack[stack.length - 1] === 'object') {
          stack.pop();
        } else {
          // Mismatched closing, might need fixing
          loggers.claude.debug('Mismatched closing brace at position', i);
        }
      } else if (char === ']') {
        // Check if we're closing the right type
        if (stack.length > 0 && stack[stack.length - 1] === 'array') {
          stack.pop();
        } else {
          // Mismatched closing, might need fixing
          loggers.claude.debug('Mismatched closing bracket at position', i);
        }
      }
    }
  }
  
  // Close any remaining open structures
  let result = content;
  while (stack.length > 0) {
    const type = stack.pop();
    if (type === 'object') {
      result += '}';
    } else {
      result += ']';
    }
  }
  
  return result;
}

/**
 * Comprehensive recovery attempt
 * Applies multiple recovery strategies in sequence
 */
export function comprehensiveRecover(content: string): string {
  let recovered = content;
  
  // Apply recovery strategies in order of likelihood
  recovered = removeJsonComments(recovered);
  recovered = fixSingleQuotes(recovered);
  recovered = fixUnquotedKeys(recovered);
  recovered = fixIncompleteStrings(recovered);
  recovered = removeTrailingGarbage(recovered);
  recovered = fixNesting(recovered);
  
  return recovered;
}

// ==========================================
// Validation and Testing Utilities
// ==========================================

/**
 * Check if JSON recovery changed the content
 */
export function hasRecoveryChanges(original: string, recovered: string): boolean {
  return original !== recovered;
}

/**
 * Calculate the edit distance between original and recovered
 * Useful for determining how much recovery changed the content
 */
export function calculateEditDistance(original: string, recovered: string): number {
  // Simple character difference count
  if (original === recovered) return 0;
  
  const lengthDiff = Math.abs(original.length - recovered.length);
  
  // Count character differences in the overlapping part
  let differences = lengthDiff;
  const minLength = Math.min(original.length, recovered.length);
  
  for (let i = 0; i < minLength; i++) {
    if (original[i] !== recovered[i]) {
      differences++;
    }
  }
  
  return differences;
}

/**
 * Generate a recovery report for debugging
 */
export function generateRecoveryReport(
  original: string, 
  recovered: string,
  success: boolean
): {
  changed: boolean;
  editDistance: number;
  lengthDifference: number;
  success: boolean;
  strategies: string[];
} {
  return {
    changed: hasRecoveryChanges(original, recovered),
    editDistance: calculateEditDistance(original, recovered),
    lengthDifference: recovered.length - original.length,
    success,
    strategies: [
      'removeComments',
      'fixQuotes', 
      'fixKeys',
      'fixStrings',
      'removeTrailing',
      'fixNesting'
    ]
  };
}

// ==========================================
// Export Recovery Module
// ==========================================

export const Recovery = {
  removeJsonComments,
  fixUnquotedKeys,
  fixSingleQuotes,
  removeTrailingGarbage,
  fixIncompleteStrings,
  fixNesting,
  comprehensiveRecover,
  hasRecoveryChanges,
  calculateEditDistance,
  generateRecoveryReport,
};