import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Screening sessions table
export const screeningSessions = mysqlTable("screening_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  compoundCount: int("compoundCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScreeningSession = typeof screeningSessions.$inferSelect;
export type InsertScreeningSession = typeof screeningSessions.$inferInsert;

// Screening results table
export const screeningResults = mysqlTable("screening_results", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  compoundName: varchar("compoundName", { length: 200 }).notNull(),
  cid: int("cid"),
  smiles: text("smiles"),
  mw: text("mw"),
  logP: text("logP"),
  tpsa: text("tpsa"),
  hbd: int("hbd"),
  hba: int("hba"),
  boiledEgg: varchar("boiledEgg", { length: 10 }),
  admetlabRulesPassed: int("admetlabRulesPassed"),
  logPS: text("logPS"),
  kpuuBrain: text("kpuuBrain"),
  bbbPotential: varchar("bbbPotential", { length: 20 }),
  cypScore: int("cypScore"),
  cypPotential: varchar("cypPotential", { length: 20 }),
  cypFeatures: text("cypFeatures"),
  resultJson: json("resultJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScreeningResult = typeof screeningResults.$inferSelect;
export type InsertScreeningResult = typeof screeningResults.$inferInsert;
