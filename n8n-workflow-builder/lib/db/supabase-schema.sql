-- n8n Workflow Builder PostgreSQL Schema for Supabase
-- Converted from SQLite to PostgreSQL syntax
-- Includes proper JSONB types and indexes for optimal performance

-- Drop existing table if it exists (for development)
DROP TABLE IF EXISTS workflow_sessions CASCADE;

-- Main workflow sessions table
CREATE TABLE workflow_sessions (
    -- PostgreSQL auto-increment using SERIAL
    id SERIAL PRIMARY KEY,
    
    -- Session identifier with proper indexing
    session_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Timestamps with timezone support
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- JSONB for better performance and query capabilities in PostgreSQL
    -- Store ALL state in one JSONB column
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Operation history as JSONB array
    operations JSONB DEFAULT '[]'::jsonb,
    
    -- Basic fields
    user_prompt TEXT,
    is_active BOOLEAN DEFAULT true,
    
    -- Version field for optimistic locking
    version INTEGER DEFAULT 1 NOT NULL
);

-- Create indexes for optimal performance
CREATE INDEX idx_session_id ON workflow_sessions(session_id);
CREATE INDEX idx_active_sessions ON workflow_sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_created_at ON workflow_sessions(created_at DESC);
CREATE INDEX idx_updated_at ON workflow_sessions(updated_at DESC);

-- GIN index for JSONB queries (optional but recommended for complex queries)
CREATE INDEX idx_state_gin ON workflow_sessions USING GIN (state);
CREATE INDEX idx_operations_gin ON workflow_sessions USING GIN (operations);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_workflow_sessions_updated_at 
    BEFORE UPDATE ON workflow_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - Disabled for now as this is an MVP without auth
-- When you add authentication, uncomment and modify these:
-- ALTER TABLE workflow_sessions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable all access for authenticated users" ON workflow_sessions
--     FOR ALL USING (auth.uid() IS NOT NULL);

-- Example of state structure (stored in 'state' column):
/*
{
  "phase": "discovery",
  "nodes": [
    {
      "id": "temp_1",
      "type": "n8n-nodes-base.webhook",
      "name": "Webhook",
      "purpose": "Receive HTTP requests",
      "position": [250, 300],
      "parameters": {},
      "isSelected": false
    }
  ],
  "connections": [
    {
      "source": "temp_1",
      "target": "temp_2",
      "sourceOutput": "main",
      "targetInput": "main"
    }
  ],
  "settings": {
    "name": "My Workflow",
    "timezone": "America/New_York"
  },
  "pendingClarifications": [],
  "clarificationHistory": [],
  "validations": {}
}
*/

-- Example of operations array structure:
/*
[
  {
    "index": 1,
    "type": "discoverNode",
    "data": {
      "node": {
        "id": "temp_1",
        "type": "n8n-nodes-base.webhook",
        "purpose": "Receive HTTP requests"
      }
    },
    "timestamp": "2024-01-20T10:30:00Z",
    "createdBy": "claude"
  },
  {
    "index": 2,
    "type": "selectNode",
    "data": {
      "nodeId": "temp_1"
    },
    "timestamp": "2024-01-20T10:31:00Z",
    "createdBy": "user"
  }
]
*/

-- Grant permissions (adjust based on your Supabase setup)
-- These are typical permissions for a public schema
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;

-- For anon and authenticated roles, grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON workflow_sessions TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE workflow_sessions_id_seq TO anon, authenticated;