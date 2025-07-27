-- Simple Workflow Builder Database Schema
-- MVP version without user authentication
-- Compatible with SQLite (development) and PostgreSQL (production)

-- Single table design for maximum simplicity
CREATE TABLE workflow_sessions (
    -- Simple auto-increment ID (works in both SQLite and PostgreSQL)
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- SQLite syntax
    -- id SERIAL PRIMARY KEY, -- PostgreSQL syntax
    
    -- Simple session identifier (e.g., 'sess_abc123')
    session_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Basic timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Store ALL state in one JSONB column
    -- Includes: phase, nodes, connections, settings, clarifications, validations
    state JSON NOT NULL DEFAULT '{}', -- JSON for SQLite, JSONB for PostgreSQL
    
    -- Operation history as JSON array for audit trail
    operations JSON DEFAULT '[]', -- JSON for SQLite, JSONB for PostgreSQL
    
    -- Basic fields
    user_prompt TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Simple index for session lookups
CREATE INDEX idx_session_id ON workflow_sessions(session_id);
CREATE INDEX idx_active_sessions ON workflow_sessions(is_active) WHERE is_active = true;

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

-- Simple helper to generate session IDs (for application layer)
-- In your app, use something like: 'sess_' + randomString(8)

-- Example data for testing
INSERT INTO workflow_sessions (
    session_id,
    user_prompt,
    state,
    operations
) VALUES (
    'sess_example001',
    'I want to monitor a website and send Slack alerts',
    '{
      "phase": "discovery",
      "nodes": [],
      "connections": [],
      "settings": {},
      "pendingClarifications": [],
      "clarificationHistory": [],
      "validations": {}
    }',
    '[]'
);

-- Notes for developers:
-- 1. This schema is intentionally minimal for MVP
-- 2. All complex queries happen in application code, not SQL
-- 3. To add user auth later, just add a 'user_id' column
-- 4. To add expiration, add an 'expires_at' column
-- 5. For production, consider switching JSON to JSONB in PostgreSQL
-- 6. Session IDs should be generated as random strings in your app