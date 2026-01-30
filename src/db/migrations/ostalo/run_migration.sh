#!/bin/bash

# ============================================================
# VISSOCIAL Database Migration Script
# ============================================================
# Usage: ./run_migration.sh
# 
# Make sure Docker is running and database is accessible
# ============================================================

# Load environment variables from .env if exists
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | xargs)
fi

# Default connection string (matches docker-compose)
DB_URL="${DATABASE_URL:-postgres://vissocial:vissocial@localhost:5434/vissocial}"

echo "============================================================"
echo "VISSOCIAL Database Migration"
echo "============================================================"
echo ""
echo "Database: $DB_URL"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
  echo "❌ psql not found. Using docker exec instead..."
  
  # Run via docker
  docker exec -i vissocial_app-postgres-1 psql -U vissocial -d vissocial < sql/migration_combined.sql
  
  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
  else
    echo ""
    echo "❌ Migration failed. Check the error above."
    exit 1
  fi
else
  # Run directly with psql
  psql "$DB_URL" < sql/migration_combined.sql
  
  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
  else
    echo ""
    echo "❌ Migration failed. Check the error above."
    exit 1
  fi
fi

echo ""
echo "============================================================"
echo "Verify migration by running:"
echo "  psql $DB_URL -c '\\dt'"
echo "============================================================"
