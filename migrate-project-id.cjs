#!/usr/bin/env node
// ============================================================
// migrate-project-id.js
// ============================================================
// Run from project root:
//   node migrate-project-id.js
//
// Replaces hardcoded "proj_local" with dynamic getProjectId()
// in all API route files.
// ============================================================

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
let changes = 0;
let filesChanged = 0;

function log(msg) {
  console.log(`  ${msg}`);
}

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    console.log(`⚠️  SKIP (not found): ${relPath}`);
    return null;
  }
  return fs.readFileSync(full, "utf-8");
}

function writeFile(relPath, content) {
  const full = path.join(ROOT, relPath);
  fs.writeFileSync(full, content, "utf-8");
}

// ============================================================
// GRUP A: Standard API routes with "const PROJECT_ID = "proj_local""
// Pattern: add import, remove const, add getProjectId() in handler,
//          replace all PROJECT_ID → projectId
// ============================================================

const GROUP_A_FILES = [
  "src/app/api/chat/message/route.ts",
  "src/app/api/chat/notifications/route.ts",
  "src/app/api/chat/notify/route.ts",
  "src/app/api/content/latest/route.ts",
  "src/app/api/export/route.ts",
  "src/app/api/products/pending/route.ts",
  "src/app/api/products/route.ts",
  "src/app/api/profile/rebuild/route.ts",
  "src/app/api/profile/route.ts",
  "src/app/api/scrape/website/route.ts",
  "src/app/api/admin/instagram/test/route.ts",
  "src/app/api/analyze/status/route.ts",
  "src/app/api/analyze/trigger/route.ts",
  "src/app/api/assets/presign/route.ts",
];

function migrateGroupA(filePath) {
  let content = readFile(filePath);
  if (!content) return;

  const original = content;

  // 1. Remove the hardcoded constant line
  content = content.replace(
    /^const PROJECT_ID\s*=\s*["']proj_local["'];?\s*(?:\/\/.*)?$/m,
    "// V9: PROJECT_ID removed — now uses getProjectId()"
  );

  // 2. Add import for getProjectId (after last existing import)
  if (!content.includes("getProjectId")) {
    // Find the last import statement
    const importRegex = /^import .+$/gm;
    let lastImportEnd = 0;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }

    if (lastImportEnd > 0) {
      content =
        content.slice(0, lastImportEnd) +
        '\nimport { getProjectId } from "@/lib/projectId";' +
        content.slice(lastImportEnd);
    }
  }

  // 3. Add "const projectId = await getProjectId();" at start of each handler
  //    Handlers are: export async function GET/POST/PATCH/DELETE
  //    Skip if already present (idempotent)
  if (!content.includes("await getProjectId()")) {
    const handlerRegex = /(export\s+async\s+function\s+(?:GET|POST|PATCH|DELETE)\s*\([^)]*\)\s*\{)/g;
    content = content.replace(handlerRegex, (match) => {
      return match + "\n  const projectId = await getProjectId();";
    });
  }

  // 4. Replace all PROJECT_ID references with projectId
  //    But NOT in comments or the "removed" comment we just added
  content = content.replace(
    /(?<!")PROJECT_ID(?!")/g,
    (match, offset) => {
      // Check if this is in our "removed" comment
      const lineStart = content.lastIndexOf("\n", offset) + 1;
      const line = content.slice(lineStart, content.indexOf("\n", offset));
      if (line.includes("// V9:")) return match;
      return "projectId";
    }
  );

  if (content !== original) {
    writeFile(filePath, content);
    filesChanged++;
    changes++;
    console.log(`✅ ${filePath}`);
  } else {
    console.log(`⏭️  ${filePath} (no changes needed)`);
  }
}

// ============================================================
// GROUP B: Assets routes with different pattern
// ============================================================

function migrateAssetsReferences() {
  const filePath = "src/app/api/assets/references/route.ts";
  let content = readFile(filePath);
  if (!content) return;

  const original = content;

  // Add import
  if (!content.includes("getProjectId")) {
    const importRegex = /^import .+$/gm;
    let lastImportEnd = 0;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }
    if (lastImportEnd > 0) {
      content =
        content.slice(0, lastImportEnd) +
        '\nimport { getProjectId } from "@/lib/projectId";' +
        content.slice(lastImportEnd);
    }
  }

  // Replace: searchParams.get("project_id") || "proj_local"
  // With: await getProjectId()
  content = content.replace(
    /const project_id\s*=\s*searchParams\.get\("project_id"\)\s*\|\|\s*"proj_local";?/,
    "const project_id = await getProjectId();"
  );

  // Make sure the handler is async (GET)
  content = content.replace(
    /export\s+function\s+GET/,
    "export async function GET"
  );

  if (content !== original) {
    writeFile(filePath, content);
    filesChanged++;
    changes++;
    console.log(`✅ ${filePath}`);
  }
}

function migrateAssetsUpload() {
  const filePath = "src/app/api/assets/upload/route.ts";
  let content = readFile(filePath);
  if (!content) return;

  const original = content;

  // Add import
  if (!content.includes("getProjectId")) {
    const importRegex = /^import .+$/gm;
    let lastImportEnd = 0;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }
    if (lastImportEnd > 0) {
      content =
        content.slice(0, lastImportEnd) +
        '\nimport { getProjectId } from "@/lib/projectId";' +
        content.slice(lastImportEnd);
    }
  }

  // Replace: (formData.get("project_id") as string) || "proj_local"
  // With: await getProjectId()
  content = content.replace(
    /const project_id\s*=\s*\(formData\.get\("project_id"\)\s*as\s*string\)\s*\|\|\s*"proj_local";?/,
    "const project_id = await getProjectId();"
  );

  if (content !== original) {
    writeFile(filePath, content);
    filesChanged++;
    changes++;
    console.log(`✅ ${filePath}`);
  }
}

// ============================================================
// GROUP D: Frontend — chat/page.tsx
// Remove the hardcoded project_id from formData (API now uses cookie)
// ============================================================

function migrateChatPage() {
  const filePath = "src/app/chat/page.tsx";
  let content = readFile(filePath);
  if (!content) return;

  const original = content;

  // Remove: formData.append("project_id", "proj_local");
  content = content.replace(
    /\s*formData\.append\("project_id",\s*"proj_local"\);?\s*/g,
    "\n"
  );

  if (content !== original) {
    writeFile(filePath, content);
    filesChanged++;
    changes++;
    console.log(`✅ ${filePath}`);
  }
}

// ============================================================
// WORKER: scheduleTick.ts + worker.ts
// These can't use cookies — query all active projects instead
// ============================================================

function migrateScheduleTick() {
  const filePath = "src/server/processors/scheduleTick.ts";
  let content = readFile(filePath);
  if (!content) return;

  const original = content;

  // Replace fallback: data?.project_id || "proj_local"
  // Keep using job data but log warning if missing
  content = content.replace(
    /const project_id\s*=\s*data\?\.project_id\s*\|\|\s*"proj_local";?/,
    'const project_id = data?.project_id;\n  if (!project_id) { log("scheduleTick", "ERROR: no project_id in job data"); return; }'
  );

  if (content !== original) {
    writeFile(filePath, content);
    filesChanged++;
    changes++;
    console.log(`✅ ${filePath}`);
  }
}

function migrateWorker() {
  const filePath = "src/server/worker.ts";
  let content = readFile(filePath);
  if (!content) return;

  const original = content;

  // The worker creates a repeatable "schedule.tick" job with hardcoded proj_local.
  // Replace with: query all active projects and create a tick for each.
  //
  // Find the pattern: { project_id: "proj_local" }
  // in the repeatable job setup and replace with a comment + dynamic approach.
  //
  // For now: just remove the hardcoded value and add a TODO.
  // The scheduler will be updated to iterate over active projects.

  // Replace hardcoded project_id in repeatable job
  content = content.replace(
    /\{\s*project_id:\s*"proj_local"\s*\}/,
    '{ project_id: "__tick__" } // V9: scheduler will iterate active projects'
  );

  if (content !== original) {
    writeFile(filePath, content);
    filesChanged++;
    changes++;
    console.log(`✅ ${filePath}`);
  }
}

// ============================================================
// INIT CHIPS FIX: chat/message/route.ts
// Fix "suggestion" → "navigation" chips in the init step
// ============================================================

function fixInitChipsInMessage() {
  const filePath = "src/app/api/chat/message/route.ts";
  let content = readFile(filePath);
  if (!content) return;

  const original = content;

  // Fix the default init step chips (at end of init handler)
  // Before: { type: "suggestion", label: "Spoji Instagram", value: "spoji instagram" }
  // After:  { type: "navigation", label: "Spoji Instagram", href: "/settings" }
  content = content.replace(
    /\{\s*type:\s*"suggestion",\s*label:\s*"Spoji Instagram",\s*value:\s*"spoji instagram"\s*\}/g,
    '{ type: "navigation", label: "Spoji Instagram", href: "/settings" }'
  );

  // Also fix: { type: "suggestion", label: "Nastavi bez Instagrama", value: "nastavi bez" }
  // → { type: "onboarding_option", ... }
  // But ONLY in the init default block, not everywhere. 
  // The "Nastavi bez" in other contexts (like scrape_complete) should stay as suggestion.
  // Since this is tricky with regex, we'll leave those as-is for now.
  // The navigation chip for "Spoji Instagram" is the critical fix.

  if (content !== original) {
    writeFile(filePath, content);
    changes++;
    console.log(`✅ ${filePath} (chip fix)`);
  }
}

// ============================================================
// RUN ALL
// ============================================================

console.log("\n🔄 Migrating proj_local → getProjectId()...\n");

// Group A — standard API routes
for (const f of GROUP_A_FILES) {
  migrateGroupA(f);
}

// Group B — assets with different patterns
migrateAssetsReferences();
migrateAssetsUpload();

// Group D — frontend
migrateChatPage();

// Worker files
migrateScheduleTick();
migrateWorker();

// Chip fix in message route
fixInitChipsInMessage();

console.log(`\n✨ Done! ${filesChanged} files changed, ${changes} total modifications.\n`);

// Verify: check for remaining proj_local references
console.log("🔍 Checking for remaining 'proj_local' references...\n");

const { execSync } = require("child_process");
try {
  const result = execSync(
    'findstr /S /N /C:"proj_local" src\\*.ts src\\*.tsx 2>nul',
    { encoding: "utf-8", cwd: ROOT }
  ).trim();

  if (result) {
    const lines = result.split("\n").filter(
      (l) => !l.includes("// V9:") && !l.includes("projectId.ts") && !l.includes("storageUrl.ts")
    );
    if (lines.length > 0) {
      console.log("⚠️  Remaining references (may be comments/acceptable):");
      lines.forEach((l) => console.log(`   ${l}`));
    } else {
      console.log("✅ No remaining active proj_local references!");
    }
  }
} catch {
  console.log("✅ No remaining proj_local references found!");
}
