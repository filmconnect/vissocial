// src/server/processors/scheduleTick.ts

import { shouldRunScheduleTick, markScheduleTickRun } from "@/lib/scheduleDebounce";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";
import { qPublish } from "@/lib/jobs";

export interface ScheduleTickInput {
  project_id?: string;
}

export interface ScheduleTickResult {
  ok: boolean;
  scheduled: number;
  skipped: boolean;
  reason?: string;
  project_id: string;
}

export async function scheduleTick(data?: ScheduleTickInput): Promise<ScheduleTickResult> {
  const project_id = data?.project_id || "proj_local";
  
  log("scheduleTick", "job started", { project_id });
  
  // ✅ DEBOUNCE CHECK
  const shouldRun = await shouldRunScheduleTick();
  
  if (!shouldRun) {
    log("scheduleTick", "skipped due to debounce", { project_id });
    return { 
      ok: true,
      scheduled: 0,
      skipped: true, 
      reason: "debounced",
      project_id 
    };
  }
  
  try {
    // ✅ QUERY SA PROJECT_ID FILTEROM
    const due = await q<any>(
      `SELECT id, scheduled_at, publish_mode, day
       FROM content_items
       WHERE project_id = $1
         AND publish_mode IN ('in_app_schedule', 'auto_publish')
         AND publish_status = 'scheduled'
         AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT 20`,
      [project_id]
    );
    
    log("scheduleTick", "found due items", {
      project_id,
      count: due.length
    });
    
    // ✅ OZNAČI KAO IZVRŠENO čak i ako nema itemova
    if (due.length === 0) {
      await markScheduleTickRun();
      
      log("scheduleTick", "no items to schedule", { project_id });
      
      return { 
        ok: true,
        scheduled: 0, 
        skipped: false,
        project_id 
      };
    }
    
    // ✅ PROCESS ITEMS SA ERROR HANDLING
    let scheduled = 0;
    let failed = 0;
    
    for (const item of due) {
      try {
        await qPublish.add("publish.instagram", {
          content_item_id: item.id,
          project_id
        });
        
        scheduled++;
        
        log("scheduleTick", "item queued for publishing", {
          item_id: item.id,
          scheduled_at: item.scheduled_at,
          publish_mode: item.publish_mode
        });
        
      } catch (error: any) {
        failed++;
        
        log("scheduleTick", "item queue failed", {
          item_id: item.id,
          error: error.message
        });
      }
    }
    
    // ✅ OZNAČI KAO IZVRŠENO
    await markScheduleTickRun();
    
    log("scheduleTick", "completed", {
      project_id,
      scheduled,
      failed,
      total: due.length
    });
    
    return { 
      ok: true,
      scheduled, 
      skipped: false,
      project_id 
    };
    
  } catch (error: any) {
    log("scheduleTick", "critical error", {
      project_id,
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
}