-- ============================================================
-- Migration: 004_chat_notifications.sql
-- Purpose: Add async notification system for worker → chat
-- Safe to re-run: All statements are idempotent
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CREATE chat_notifications TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  
  data JSONB DEFAULT '{}'::jsonb,
  chips JSONB DEFAULT '[]'::jsonb,
  
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chat_notifications_session_unread 
ON chat_notifications(session_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_notifications_project 
ON chat_notifications(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_notifications_unread 
ON chat_notifications(project_id, read) 
WHERE read = FALSE;

COMMIT;

SELECT 'Migration 004 complete!' as status;
