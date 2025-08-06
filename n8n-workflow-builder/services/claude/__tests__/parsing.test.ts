/**
 * Tests for JSON parsing and recovery utilities
 */

import { 
  parseWithPrefill, 
  parseJson,
  recoverJson,
  balanceBraces,
  looksLikeJson,
  extractJsonFromMixedContent
} from '../parsing/json-prefill';

import {
  removeJsonComments,
  fixUnquotedKeys,
  fixSingleQuotes,
  removeTrailingGarbage,
  fixIncompleteStrings
} from '../parsing/recovery';

describe('JSON Parsing with Prefill', () => {
  describe('parseWithPrefill', () => {
    it('should parse valid JSON with prefill', () => {
      const prefill = '{"operations":[';
      const completion = '{"type":"test","value":123}]}';
      
      const result = parseWithPrefill(prefill, completion);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        operations: [{ type: 'test', value: 123 }]
      });
      expect(result.recovered).toBeUndefined();
    });

    it('should handle empty completion', () => {
      const prefill = '{"status":"';
      const completion = 'ok"}';
      
      const result = parseWithPrefill(prefill, completion);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ status: 'ok' });
    });

    it('should recover from missing closing braces', () => {
      const prefill = '{"operations":[';
      const completion = '{"type":"test","value":123}'; // Missing ]}
      
      const result = parseWithPrefill(prefill, completion, { attemptRecovery: true });
      
      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.data).toEqual({
        operations: [{ type: 'test', value: 123 }]
      });
    });

    it('should fail without recovery when disabled', () => {
      const prefill = '{"operations":[';
      const completion = '{"type":"test","value":123}'; // Missing ]}
      
      const result = parseWithPrefill(prefill, completion, { attemptRecovery: false });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.recovered).toBeUndefined();
    });

    it('should validate against schema when provided', () => {
      const { z } = require('zod');
      const schema = z.object({
        operations: z.array(z.object({
          type: z.string(),
          value: z.number()
        }))
      });
      
      const prefill = '{"operations":[';
      const completion = '{"type":"test","value":"not-a-number"}]}'; // Invalid value type
      
      const result = parseWithPrefill(prefill, completion, { schema });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Schema validation failed');
    });
  });

  describe('parseJson', () => {
    it('should parse valid JSON without prefill', () => {
      const content = '{"test": true, "value": 42}';
      
      const result = parseJson(content);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: true, value: 42 });
    });

    it('should handle arrays', () => {
      const content = '[1, 2, 3, "test"]';
      
      const result = parseJson(content);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3, 'test']);
    });
  });

  describe('recoverJson', () => {
    it('should balance missing braces', () => {
      const input = '{"test": {"nested": true}';
      const recovered = recoverJson(input);
      
      expect(recovered).toBe('{"test": {"nested": true}}');
    });

    it('should balance missing brackets', () => {
      const input = '["item1", ["nested", "array"';
      const recovered = recoverJson(input);
      
      expect(recovered).toBe('["item1", ["nested", "array"]]');
    });

    it('should remove trailing commas', () => {
      const input = '{"test": true,}';
      const recovered = recoverJson(input);
      
      // The recovery function should fix this
      const result = parseJson(recovered);
      expect(result.success).toBe(true);
    });

    it('should handle mixed issues', () => {
      const input = '{"items": [1, 2, 3,], "valid": true';
      const recovered = recoverJson(input);
      
      const result = parseJson(recovered);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('items');
      expect(result.data).toHaveProperty('valid');
    });
  });

  describe('balanceBraces', () => {
    it('should add missing closing braces', () => {
      const input = '{"level1": {"level2": {"level3": true';
      const balanced = balanceBraces(input);
      
      expect(balanced).toBe('{"level1": {"level2": {"level3": true}}}');
    });

    it('should add missing closing brackets', () => {
      const input = '[1, [2, [3, 4';
      const balanced = balanceBraces(input);
      
      expect(balanced).toBe('[1, [2, [3, 4]]]');
    });

    it('should handle mixed braces and brackets', () => {
      const input = '[{"test": [1, 2}, 3';
      const balanced = balanceBraces(input);
      
      // Should add ] for inner array and ] for outer array
      expect(balanced.endsWith(']]')).toBe(true);
    });

    it('should not modify already balanced JSON', () => {
      const input = '{"test": [1, 2, 3]}';
      const balanced = balanceBraces(input);
      
      expect(balanced).toBe(input);
    });
  });

  describe('looksLikeJson', () => {
    it('should identify objects', () => {
      expect(looksLikeJson('{"test": true}')).toBe(true);
      expect(looksLikeJson('  {"test": true}  ')).toBe(true);
    });

    it('should identify arrays', () => {
      expect(looksLikeJson('[1, 2, 3]')).toBe(true);
      expect(looksLikeJson('  [1, 2, 3]  ')).toBe(true);
    });

    it('should identify primitives', () => {
      expect(looksLikeJson('null')).toBe(true);
      expect(looksLikeJson('true')).toBe(true);
      expect(looksLikeJson('false')).toBe(true);
      expect(looksLikeJson('42')).toBe(true);
      expect(looksLikeJson('-3.14')).toBe(true);
      expect(looksLikeJson('1.23e-4')).toBe(true);
    });

    it('should identify strings', () => {
      expect(looksLikeJson('"test string"')).toBe(true);
    });

    it('should reject non-JSON', () => {
      expect(looksLikeJson('not json')).toBe(false);
      expect(looksLikeJson('undefined')).toBe(false);
      expect(looksLikeJson('')).toBe(false);
      expect(looksLikeJson('{"incomplete":')).toBe(false);
    });
  });

  describe('extractJsonFromMixedContent', () => {
    it('should extract JSON from markdown code blocks', () => {
      const content = `
        Here is some text
        \`\`\`json
        {"extracted": true, "value": 123}
        \`\`\`
        More text after
      `;
      
      const extracted = extractJsonFromMixedContent(content);
      
      expect(extracted).toBe('{"extracted": true, "value": 123}');
    });

    it('should extract JSON from code blocks without language', () => {
      const content = `
        Some explanation
        \`\`\`
        [1, 2, 3, 4]
        \`\`\`
      `;
      
      const extracted = extractJsonFromMixedContent(content);
      
      expect(extracted).toBe('[1, 2, 3, 4]');
    });

    it('should extract inline JSON', () => {
      const content = 'The response is {"status": "ok", "data": [1, 2]} as expected.';
      
      const extracted = extractJsonFromMixedContent(content);
      
      expect(extracted).toBe('{"status": "ok", "data": [1, 2]}');
    });

    it('should return null when no JSON found', () => {
      const content = 'This is just plain text without any JSON.';
      
      const extracted = extractJsonFromMixedContent(content);
      
      expect(extracted).toBeNull();
    });
  });
});

describe('JSON Recovery Utilities', () => {
  describe('removeJsonComments', () => {
    it('should remove single-line comments', () => {
      const input = `{
        "test": true, // This is a comment
        "value": 42 // Another comment
      }`;
      
      const cleaned = removeJsonComments(input);
      
      expect(cleaned).not.toContain('//');
      const result = parseJson(cleaned);
      expect(result.success).toBe(true);
    });

    it('should remove multi-line comments', () => {
      const input = `{
        /* This is a 
           multi-line comment */
        "test": true,
        "value": /* inline comment */ 42
      }`;
      
      const cleaned = removeJsonComments(input);
      
      expect(cleaned).not.toContain('/*');
      expect(cleaned).not.toContain('*/');
    });
  });

  describe('fixUnquotedKeys', () => {
    it('should quote unquoted object keys', () => {
      const input = '{test: true, value: 42}';
      const fixed = fixUnquotedKeys(input);
      
      expect(fixed).toBe('{"test": true, "value": 42}');
    });

    it('should handle nested objects', () => {
      const input = '{outer: {inner: true}}';
      const fixed = fixUnquotedKeys(input);
      
      expect(fixed).toBe('{"outer": {"inner": true}}');
    });
  });

  describe('fixSingleQuotes', () => {
    it('should replace single quotes with double quotes', () => {
      const input = "{'test': 'value', 'number': 42}";
      const fixed = fixSingleQuotes(input);
      
      expect(fixed).toBe('{"test": "value", "number": 42}');
    });

    it('should not affect quotes inside strings', () => {
      const input = '{"test": "don\'t change this"}';
      const fixed = fixSingleQuotes(input);
      
      expect(fixed).toBe('{"test": "don\'t change this"}');
    });
  });

  describe('removeTrailingGarbage', () => {
    it('should remove incomplete data after valid JSON', () => {
      const input = '{"test": true} some garbage text';
      const cleaned = removeTrailingGarbage(input);
      
      expect(cleaned).toBe('{"test": true}');
    });

    it('should handle arrays', () => {
      const input = '[1, 2, 3] extra stuff';
      const cleaned = removeTrailingGarbage(input);
      
      expect(cleaned).toBe('[1, 2, 3]');
    });
  });

  describe('fixIncompleteStrings', () => {
    it('should close unclosed strings', () => {
      const input = '{"test": "unclosed string';
      const fixed = fixIncompleteStrings(input);
      
      expect(fixed).toBe('{"test": "unclosed string"');
    });

    it('should not modify properly closed strings', () => {
      const input = '{"test": "closed string"}';
      const fixed = fixIncompleteStrings(input);
      
      expect(fixed).toBe(input);
    });

    it('should handle escaped quotes', () => {
      const input = '{"test": "string with \\" escaped';
      const fixed = fixIncompleteStrings(input);
      
      expect(fixed).toBe('{"test": "string with \\" escaped"');
    });
  });
});