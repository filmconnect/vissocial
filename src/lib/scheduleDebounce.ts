// src/lib/scheduleDebounce.ts

import { config } from "./config";
import { log } from "./logger";
import Redis from "ioredis";

const redis = new Redis(config.redisUrl);

const DEBOUNCE_KEY = "schedule:tick:last_run";
const MIN_INTERVAL_MS = 4 * 60 * 1000; // 4 minute (malo manje od repeat interval-a 5min)

/**
 * Provjeri treba li izvršiti schedule.tick
 * 
 * @returns true ako treba izvršiti, false ako je prerano
 */
export async function shouldRunScheduleTick(): Promise<boolean> {
  try {
    const lastRun = await redis.get(DEBOUNCE_KEY);
    
    if (!lastRun) {
      // Nikad nije izvršeno, pokreni
      log("scheduleDebounce", "first run - no previous execution");
      return true;
    }
    
    const lastRunTime = parseInt(lastRun);
    const now = Date.now();
    const elapsed = now - lastRunTime;
    
    if (elapsed < MIN_INTERVAL_MS) {
      const nextRunIn = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
      
      log("scheduleDebounce", "skipped - too recent", {
        elapsed_seconds: Math.floor(elapsed / 1000),
        min_interval_seconds: Math.floor(MIN_INTERVAL_MS / 1000),
        next_run_in_seconds: nextRunIn
      });
      return false;
    }
    
    log("scheduleDebounce", "allowed to run", {
      elapsed_seconds: Math.floor(elapsed / 1000)
    });
    return true;
    
  } catch (error: any) {
    log("scheduleDebounce", "check failed", { error: error.message });
    // Fail-safe: dopusti izvršavanje ako Redis nije dostupan
    return true;
  }
}

/**
 * Označi da je schedule.tick izvršen
 */
export async function markScheduleTickRun(): Promise<void> {
  try {
    await redis.set(DEBOUNCE_KEY, Date.now().toString(), "EX", 60 * 60); // Expire 1h
    
    log("scheduleDebounce", "marked as run", {
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    log("scheduleDebounce", "mark failed", { error: error.message });
  }
}

/**
 * Reset debounce (za testiranje)
 */
export async function resetScheduleDebounce(): Promise<void> {
  try {
    await redis.del(DEBOUNCE_KEY);
    log("scheduleDebounce", "reset complete");
  } catch (error: any) {
    log("scheduleDebounce", "reset failed", { error: error.message });
  }
}