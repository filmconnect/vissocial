-- ============================================================
-- Migration: add category to products
-- Purpose:
--   category is auto-filled from Vision AI when product is confirmed
-- ============================================================

ALTER TABLE products
ADD COLUMN IF NOT EXISTS category TEXT;
