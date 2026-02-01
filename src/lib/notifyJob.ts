import { log } from "@/lib/logger";

// ============================================================
// NOTIFY CHAT ABOUT JOB COMPLETION
// Call this from worker after job completes
// ============================================================

export async function notifyJobComplete(
  jobType: string,
  projectId: string,
  status: "succeeded" | "failed",
  result?: any
) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    
    const res = await fetch(`${baseUrl}/api/chat/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_type: jobType,
        project_id: projectId,
        status,
        result,
      }),
    });

    if (!res.ok) {
      log("notify", "notification failed", { status: res.status });
    } else {
      const data = await res.json();
      log("notify", "notification sent", { jobType, status, sent: data.notification_sent });
    }
  } catch (error) {
    // Don't fail the job if notification fails
    log("notify", "notification error (non-fatal)", { error });
  }
}

// ============================================================
// EXAMPLE USAGE IN WORKER:
// ============================================================
/*
import { notifyJobComplete } from "@/lib/notifyJob";

// In instagramIngest processor:
await notifyJobComplete("instagram.ingest", project_id, "succeeded", {
  media_count: mediaItems.length,
});

// In analyzeInstagram processor:
await notifyJobComplete("analyze.instagram", project_id, "succeeded", {
  products_detected: detectedProducts.length,
});

// When all analyses complete:
await notifyJobComplete("analyze.complete", project_id, "succeeded");

// In brandRebuild processor:
await notifyJobComplete("brand.rebuild", project_id, "succeeded");

// In plan.generate processor:
await notifyJobComplete("plan.generate", project_id, "succeeded", {
  posts_created: posts.length,
});
*/
