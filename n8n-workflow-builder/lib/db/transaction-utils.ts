import { createServiceClient } from '../supabase';

/**
 * Options for retry mechanism
 */
interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  jitterMs?: number;
}

/**
 * Since Supabase doesn't expose direct transaction control, we'll use
 * atomic operations with RETURNING clause and optimistic locking instead.
 * This provides similar consistency guarantees without explicit transactions.
 */

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Function to retry
 * @param options - Retry configuration options
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 50,
    backoffMultiplier = 2,
    maxDelayMs = 2000,
    jitterMs = 10
  } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const baseDelay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * jitterMs * 2 - jitterMs;
      const delay = Math.max(0, baseDelay + jitter);
      
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Ensure consistent read after write operation
 * Combines retry logic with consistency checks
 * 
 * @param readFn - Function that performs the read operation
 * @param validationFn - Function to validate if the read data is consistent
 * @param options - Retry options
 * @returns Result of the read operation
 */
export async function ensureConsistentRead<T>(
  readFn: () => Promise<T>,
  validationFn: (data: T) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(async () => {
    const data = await readFn();
    
    if (!validationFn(data)) {
      throw new Error('Read returned stale data');
    }
    
    return data;
  }, options);
}

/**
 * Hash a string to create a numeric lock ID for advisory locks
 * 
 * @param str - String to hash (e.g., session ID)
 * @returns Numeric hash suitable for PostgreSQL advisory locks
 */
export function hashStringToLockId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Check if an error is a serialization failure that should be retried
 * 
 * @param error - Error to check
 * @returns True if the error is a serialization failure
 */
export function isSerializationError(error: any): boolean {
  if (error?.code === '40001') {
    return true; // PostgreSQL serialization failure
  }
  
  if (error?.message?.includes('serialization') || 
      error?.message?.includes('could not serialize')) {
    return true;
  }
  
  return false;
}

/**
 * Default retry options for database operations
 */
export const DEFAULT_DB_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 50,
  backoffMultiplier: 2,
  maxDelayMs: 1000,
  jitterMs: 10
};