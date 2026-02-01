-- ============================================================
-- FAZA 3: Chat Chips & Product Confirmation
-- Run this migration after FAZA 1/2 migrations
-- ============================================================

-- Add new columns to detected_products if not exist
DO $$
BEGIN
    -- Add confirmed_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'detected_products' AND column_name = 'confirmed_at'
    ) THEN
        ALTER TABLE detected_products ADD COLUMN confirmed_at TIMESTAMPTZ;
    END IF;

    -- Add rejected_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'detected_products' AND column_name = 'rejected_at'
    ) THEN
        ALTER TABLE detected_products ADD COLUMN rejected_at TIMESTAMPTZ;
    END IF;

    -- Add metadata column (for additional product info from vision)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'detected_products' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE detected_products ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Add index for faster status queries
CREATE INDEX IF NOT EXISTS idx_detected_products_status 
ON detected_products(project_id, status);

-- Add index for chat messages meta queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_meta 
ON chat_messages USING gin(meta);

-- ============================================================
-- Create products table for manually added/locked products
-- (Separate from detected_products which are AI-detected)
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    locked BOOLEAN DEFAULT false,  -- Manual products can be locked
    source TEXT DEFAULT 'manual',  -- 'manual' or 'confirmed' (from detected)
    source_detected_id TEXT REFERENCES detected_products(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_project 
ON products(project_id);

-- ============================================================
-- Update trigger for products.updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_products_updated_at();

-- ============================================================
-- Migration complete!
-- ============================================================

-- Verify:
-- SELECT COUNT(*) FROM detected_products WHERE status = 'pending';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'detected_products';
