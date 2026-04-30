import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  screeningSessions,
  screeningResults,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { ScreeningResult as ScreeningResultType } from "../shared/types";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Screening History ────────────────────────────────────────────────────────

export async function saveScreeningSession(
  userId: number | null,
  results: ScreeningResultType[]
): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot save screening session: database not available"
    );
    return null;
  }

  try {
    const [session] = await db
      .insert(screeningSessions)
      .values({
        userId: userId,
        compoundCount: results.length,
      })
      .$returningId();

    const sessionId = session.id;

    for (const r of results) {
      await db.insert(screeningResults).values({
        sessionId,
        compoundName: r.compound.name,
        cid: r.compound.cid ?? null,
        smiles: r.compound.smiles ?? null,
        mw: r.compound.mw?.toString() ?? null,
        logP: r.compound.logP?.toString() ?? null,
        tpsa: r.compound.tpsa?.toString() ?? null,
        hbd: r.compound.hbd ?? null,
        hba: r.compound.hba ?? null,
        boiledEgg: r.bbb.boiledEgg ? "Yes" : "No",
        admetlabRulesPassed: r.bbb.admetlabRulesPassed,
        logPS: r.bbb.logPS?.toString() ?? null,
        kpuuBrain: r.bbb.kpuuBrain?.toString() ?? null,
        bbbPotential: r.bbb.bbbPotential,
        cypScore: r.cyp2e1.score,
        cypPotential: r.cyp2e1.potential,
        cypFeatures: r.cyp2e1.features.join("; "),
        resultJson: r,
      });
    }

    return sessionId;
  } catch (error) {
    console.error("[Database] Failed to save screening session:", error);
    return null;
  }
}

export async function getScreeningHistory(userId: number | null, limit = 20) {
  const db = await getDb();
  if (!db) return [];

  try {
    if (!userId) return [];
    return db
      .select()
      .from(screeningSessions)
      .where(eq(screeningSessions.userId, userId))
      .orderBy(desc(screeningSessions.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("[Database] Failed to get screening history:", error);
    return [];
  }
}

export async function getSessionResults(sessionId: number) {
  const db = await getDb();
  if (!db) return [];

  try {
    return db
      .select()
      .from(screeningResults)
      .where(eq(screeningResults.sessionId, sessionId));
  } catch (error) {
    console.error("[Database] Failed to get session results:", error);
    return [];
  }
}

export async function getSessionResultsForUser(
  sessionId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return [];

  try {
    // Ensure the session belongs to the current user
    const session = await db
      .select({ id: screeningSessions.id })
      .from(screeningSessions)
      .where(
        and(
          eq(screeningSessions.id, sessionId),
          eq(screeningSessions.userId, userId)
        )
      )
      .limit(1);

    if (session.length === 0) return [];

    return db
      .select()
      .from(screeningResults)
      .where(eq(screeningResults.sessionId, sessionId));
  } catch (error) {
    console.error("[Database] Failed to get session results (scoped):", error);
    return [];
  }
}
