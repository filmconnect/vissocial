// ============================================================
// WORKER NOTIFICATION PATCHES
// ============================================================
// Add these imports and calls to your existing worker processors
// ============================================================

// ============================================================
// STEP 1: Add import to each processor file
// ============================================================

// In src/server/processors/instagramIngest.ts:
// In src/server/processors/analyzeInstagram.ts:
// In src/server/processors/brandRebuild.ts:
// In src/server/processors/planGenerate.ts:

// ADD THIS IMPORT AT TOP:
import { notify } from "@/lib/notifications";

// ============================================================
// STEP 2: Add notification calls
// ============================================================

// --------------------------------------------------------
// In instagramIngest.ts - after successful ingest:
// --------------------------------------------------------

// At the END of instagramIngest function, before return:

  // Notify chat about ingest completion
  if (stored > 0) {
    await notify.ingestComplete(project_id, stored);
  }

  log("instagramIngest", "complete", {
    project_id,
    stored,
    skipped,
    analysis_queued: analysisQueued,
    duration_ms: Date.now() - startTime
  });

  return {
    ok: true,
    stored,
    skipped,
    analysis_queued: analysisQueued,
    event_id
  };

// --------------------------------------------------------
// In analyzeInstagram.ts - after analysis completes:
// --------------------------------------------------------

// Inside analyzeInstagram, after products are saved:

  // Check if this completes all analyses
  const [progress] = await q<any>(
    \`SELECT 
       COUNT(*) FILTER (WHERE ia.id IS NOT NULL) as analyzed,
       COUNT(*) as total
     FROM assets a
     LEFT JOIN instagram_analyses ia ON ia.asset_id = a.id
     WHERE a.project_id = $1 AND a.source = 'instagram'\`,
    [project_id]
  );

  const isComplete = parseInt(progress.analyzed) >= parseInt(progress.total);

  if (isComplete) {
    // Get total products found
    const [productCount] = await q<any>(
      \`SELECT COUNT(*) as count FROM detected_products 
       WHERE project_id = $1 AND status = 'pending'\`,
      [project_id]
    );
    
    // Notify that analysis is complete
    await notify.analysisComplete(
      project_id, 
      parseInt(productCount.count),
      parseInt(progress.total)
    );
  }

// --------------------------------------------------------
// In brandRebuild.ts - after rebuild completes:
// --------------------------------------------------------

// At the END of brandRebuild function:

  // Notify chat
  await notify.brandRebuildComplete(project_id);

  log("brandRebuild", "complete", {
    project_id,
    duration_ms: Date.now() - startTime
  });

// --------------------------------------------------------
// In planGenerate.ts - after plan is generated:
// --------------------------------------------------------

// At the END of planGenerate function:

  // Notify chat
  await notify.planGenerated(project_id, generatedItems, month);

  log("planGenerate", "complete", {
    project_id,
    month,
    items: generatedItems,
    duration_ms: Date.now() - startTime
  });

// ============================================================
// STEP 3: Add error notifications to worker.ts
// ============================================================

// In src/server/worker.ts, for each worker catch block:

// Example for q_ingest worker:
    } catch (e: any) {
      log("worker:q_ingest", "job failed", {
        name: job.name,
        error: e.message,
        stack: e.stack
      });
      
      // Notify chat about failure
      const { notify } = await import("@/lib/notifications");
      await notify.jobFailed(job.data.project_id, job.name, e.message);
      
      throw e;
    }

// ============================================================
// COMPLETE EXAMPLE: Updated instagramIngest.ts
// ============================================================

/*
// At top of file, add:
import { notify } from "@/lib/notifications";

// At end of function, before return:
if (stored > 0) {
  await notify.ingestComplete(project_id, stored);
}
*/

// ============================================================
// COMPLETE EXAMPLE: Updated analyzeInstagram.ts  
// ============================================================

/*
// At top of file, add:
import { notify } from "@/lib/notifications";

// After saving products, add:
const [progress] = await q<any>(
  \`SELECT 
     COUNT(*) FILTER (WHERE ia.id IS NOT NULL) as analyzed,
     COUNT(*) as total
   FROM assets a
   LEFT JOIN instagram_analyses ia ON ia.asset_id = a.id
   WHERE a.project_id = $1 AND a.source = 'instagram'\`,
  [project_id]
);

if (parseInt(progress.analyzed) >= parseInt(progress.total)) {
  const [pc] = await q<any>(
    \`SELECT COUNT(*) as count FROM detected_products 
     WHERE project_id = $1 AND status = 'pending'\`,
    [project_id]
  );
  await notify.analysisComplete(project_id, parseInt(pc.count), parseInt(progress.total));
}
*/
