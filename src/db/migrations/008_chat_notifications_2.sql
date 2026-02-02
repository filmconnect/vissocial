-- ============================================================
-- Migration 005: Chat Notifications Table
-- ============================================================
-- Purpose: Store async notifications from workers to chat
-- ============================================================

-- Create chat_notifications table
CREATE TABLE IF NOT EXISTS chat_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  chips JSONB,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for polling unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_session_unread 
ON chat_notifications(session_id, read) 
WHERE read = false;

-- Index for project
CREATE INDEX IF NOT EXISTS idx_notifications_project 
ON chat_notifications(project_id);

-- Index for created_at (for cleanup)
CREATE INDEX IF NOT EXISTS idx_notifications_created 
ON chat_notifications(created_at);

-- ============================================================
-- Add project_id to chat_sessions if missing
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chat_sessions' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN project_id TEXT REFERENCES projects(id);
  END IF;
END $$;

-- ============================================================
-- Verify
-- ============================================================
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'chat_notifications'
ORDER BY ordinal_position;
