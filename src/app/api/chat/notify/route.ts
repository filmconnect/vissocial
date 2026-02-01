import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { chip, ChatChip } from "@/ui/ChatChip";

const PROJECT_ID = "proj_local";

// ============================================================
// JOB COMPLETION WEBHOOK
// Called by worker when jobs complete
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { job_type, project_id, status, result } = body;

    log("api:notify", "job notification received", { job_type, project_id, status });

    if (project_id !== PROJECT_ID) {
      return NextResponse.json({ ok: true, skipped: "different project" });
    }

    // Find active chat session for this project
    const [session] = await q<any>(
      `SELECT id FROM chat_sessions 
       WHERE project_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [PROJECT_ID]
    );

    if (!session) {
      log("api:notify", "no active session found");
      return NextResponse.json({ ok: true, skipped: "no session" });
    }

    const session_id = session.id;
    let notification: { text: string; chips: ChatChip[] } | null = null;

    // ============================================================
    // HANDLE DIFFERENT JOB COMPLETIONS
    // ============================================================

    switch (job_type) {
      case "instagram.ingest":
        if (status === "succeeded") {
          const mediaCount = result?.media_count || 0;
          notification = {
            text: `✅ Instagram sync završen!\n\nPovučeno ${mediaCount} medija. Pokrećem AI analizu slika...`,
            chips: [
              chip.suggestion("Status"),
              chip.navigation("Pogledaj Profile", "/profile"),
            ],
          };
        } else if (status === "failed") {
          notification = {
            text: `❌ Instagram sync nije uspio.\n\nProvjeri postavke u Settings i pokušaj ponovno.`,
            chips: [
              chip.navigation("Otvori Settings", "/settings"),
            ],
          };
        }
        break;

      case "analyze.instagram":
        if (status === "succeeded") {
          // Check how many products were detected
          const [products] = await q<any>(
            `SELECT COUNT(*) as count FROM detected_products 
             WHERE project_id = $1 AND status = 'pending'`,
            [PROJECT_ID]
          );
          
          const productCount = parseInt(products?.count || 0);
          
          if (productCount > 0) {
            notification = {
              text: `🔍 Analiza slike završena!\n\nDetektirano ${productCount} novih proizvoda za potvrdu.`,
              chips: [
                chip.suggestion("Prikaži proizvode"),
                chip.suggestion("Potvrdi sve"),
              ],
            };
          }
        }
        break;

      case "analyze.complete":
        // All analyses complete
        const [pending] = await q<any>(
          `SELECT COUNT(*) as count FROM detected_products 
           WHERE project_id = $1 AND status = 'pending'`,
          [PROJECT_ID]
        );
        
        const pendingCount = parseInt(pending?.count || 0);
        
        notification = {
          text: pendingCount > 0
            ? `🎉 Analiza svih slika završena!\n\nImaš ${pendingCount} proizvoda za potvrdu. Potvrdi ih da bih mogao izgraditi tvoj brand profil.`
            : `🎉 Analiza završena! Brand profil je spreman.\n\nMožeš generirati content plan.`,
          chips: pendingCount > 0
            ? [
                chip.suggestion("Prikaži proizvode"),
                chip.suggestion("Potvrdi sve"),
              ]
            : [
                chip.suggestion("Generiraj plan"),
                chip.navigation("Pogledaj Profile", "/profile"),
              ],
        };
        break;

      case "brand.rebuild":
        if (status === "succeeded") {
          notification = {
            text: `✨ Brand profil ažuriran!\n\nSpreman sam generirati personalizirani content plan.`,
            chips: [
              chip.suggestion("Generiraj plan"),
              chip.navigation("Pogledaj Profile", "/profile"),
            ],
          };
        }
        break;

      case "plan.generate":
        if (status === "succeeded") {
          const postCount = result?.posts_created || 0;
          notification = {
            text: `📅 Plan generiran!\n\nKreirano ${postCount} postova. Pogledaj ih u Calendaru.`,
            chips: [
              chip.navigation("Otvori Calendar", "/calendar"),
              chip.suggestion("Export"),
            ],
          };
        } else if (status === "failed") {
          notification = {
            text: `❌ Generiranje plana nije uspjelo.\n\nPokušaj ponovno ili provjeri postavke.`,
            chips: [
              chip.suggestion("Generiraj plan"),
              chip.suggestion("Status"),
            ],
          };
        }
        break;

      case "export.pack":
        if (status === "succeeded") {
          notification = {
            text: `📦 Export spreman!\n\nPreuzmi ga na Export stranici.`,
            chips: [
              chip.navigation("Otvori Export", "/export"),
            ],
          };
        }
        break;
    }

    // ============================================================
    // SAVE NOTIFICATION MESSAGE TO CHAT
    // ============================================================

    if (notification) {
      const msgId = "msg_" + uuid();
      await q(
        `INSERT INTO chat_messages(id, session_id, role, text, meta)
         VALUES ($1, $2, 'assistant', $3, $4)`,
        [msgId, session_id, notification.text, JSON.stringify({ chips: notification.chips, system_notification: true })]
      );

      log("api:notify", "notification saved to chat", { session_id, msgId, job_type });
    }

    return NextResponse.json({ ok: true, notification_sent: !!notification });
  } catch (error) {
    log("api:notify", "error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// GET UNREAD NOTIFICATIONS COUNT
// ============================================================

export async function GET(req: Request) {
  const url = new URL(req.url);
  const session_id = url.searchParams.get("session_id");
  const since = url.searchParams.get("since"); // ISO timestamp

  if (!session_id) {
    return NextResponse.json(
      { error: "session_id required" },
      { status: 400 }
    );
  }

  try {
    let query = `
      SELECT COUNT(*) as count 
      FROM chat_messages 
      WHERE session_id = $1 
        AND role = 'assistant'
        AND meta->>'system_notification' = 'true'
    `;
    const params: any[] = [session_id];

    if (since) {
      query += ` AND created_at > $2`;
      params.push(since);
    }

    const [result] = await q<any>(query, params);

    return NextResponse.json({
      unread: parseInt(result?.count || 0),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
