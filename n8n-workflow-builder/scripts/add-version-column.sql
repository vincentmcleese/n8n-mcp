-- Migration to add version column for optimistic locking
-- This script adds the version column to existing workflow_sessions table

-- Check if version column already exists before adding
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'workflow_sessions' 
        AND column_name = 'version'
    ) THEN
        ALTER TABLE workflow_sessions 
        ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;
        
        RAISE NOTICE 'Version column added successfully';
    ELSE
        RAISE NOTICE 'Version column already exists';
    END IF;
END $$;