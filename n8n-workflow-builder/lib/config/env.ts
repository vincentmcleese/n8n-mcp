import { z } from 'zod';

// Define the schema for our environment variables
const envSchema = z.object({
  // Public variables (available in browser)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL"
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, {
    message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"
  }),
  
  // Server-only variables
  ANTHROPIC_API_KEY: z.string().startsWith('sk-', {
    message: "ANTHROPIC_API_KEY must start with 'sk-'"
  }),
  MCP_SERVER_URL: z.string().url({
    message: "MCP_SERVER_URL must be a valid URL"
  }),
  MCP_API_KEY: z.string().min(1, {
    message: "MCP_API_KEY is required"
  }),
  MCP_PROFILE: z.string().min(1, {
    message: "MCP_PROFILE is required"
  }),
  CRON_SECRET: z.string().min(32, {
    message: "CRON_SECRET must be at least 32 characters for security"
  }),
  
  // Supabase service key (server-only)
  SUPABASE_SERVICE_KEY: z.string().min(1, {
    message: "SUPABASE_SERVICE_KEY is required for database operations"
  }),
  
  // Optional: Runtime environment
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
});

// Type for the validated environment
export type Env = z.infer<typeof envSchema>;

// Helper to get public environment variables (safe for client-side)
export function getClientEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

// Validate environment variables
let env: Env | undefined;

export function getEnv(): Env {
  if (!env) {
    // Skip validation in test mode
    if (process.env.SKIP_ENV_VALIDATION === 'true' || process.env.NODE_ENV === 'test') {
      env = {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-key',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'sk-test',
        MCP_SERVER_URL: process.env.MCP_SERVER_URL || 'http://localhost:3001',
        MCP_API_KEY: process.env.MCP_API_KEY || 'test-key',
        MCP_PROFILE: process.env.MCP_PROFILE || 'test',
        CRON_SECRET: process.env.CRON_SECRET || 'test-secret',
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || 'test-service-key',
        NODE_ENV: process.env.NODE_ENV as 'development' | 'production' | 'test'
      };
      return env;
    }
    
    try {
      env = envSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map(err => `❌ ${err.path.join('.')}: ${err.message}`)
          .join('\n');
        
        throw new Error(
          `\n🚨 Environment validation failed:\n\n${errorMessage}\n\n` +
          `💡 Please check your .env.local file and ensure all required variables are set.\n` +
          `📄 See .env.example for reference.\n`
        );
      }
      throw error;
    }
  }
  return env;
}

// Check if running on server
export const isServer = typeof window === 'undefined';

// Check if running as a script (tsx)
// In middleware/edge runtime, process.argv may not be available
const isScript = process.argv && process.argv[1] && 
  (process.argv[1].includes('tsx') || process.argv[1].includes('.ts'));

// Validate environment on server startup (but not in scripts)
if (isServer && process.env.NODE_ENV !== 'test' && !isScript) {
  getEnv();
}