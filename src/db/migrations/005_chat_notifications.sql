-- ============================================================
-- MIGRATION: Chat Notifications Table
-- ============================================================
-- Dodaje tablicu za async notifikacije iz workera u chat.
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  chips JSONB,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_notifications_session 
  ON chat_notifications(session_id, read);

CREATE INDEX IF NOT EXISTS idx_chat_notifications_project 
  ON chat_notifications(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_notifications_unread 
  ON chat_notifications(session_id) 
  WHERE read = false;

-- Deduplication index (za sprječavanje duplikata)
CREATE INDEX IF NOT EXISTS idx_chat_notifications_dedupe 
  ON chat_notifications(session_id, type, (data->>'dedupe_key'))
  WHERE data->>'dedupe_key' IS NOT NULL;

-- Cleanup: Auto-delete old read notifications (> 7 days)
-- Ovo je opcionalno, možete pokrenuti kao cron job
-- DELETE FROM chat_notifications WHERE read = true AND created_at < NOW() - INTERVAL '7 days';
