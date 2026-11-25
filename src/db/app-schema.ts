import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const setVisibility = pgEnum("set_visibility", ["private", "class", "link"]);
export const setSource = pgEnum("set_source", ["mcp", "web", "import"]);
export const questionType = pgEnum("question_type", [
  "flashcard",
  "multiple_choice",
  "true_false",
  "short_answer",
]);

export const sets = pgTable(
  "sets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject"),
    description: text("description"),
    visibility: setVisibility("visibility").notNull().default("private"),
    source: setSource("source").notNull().default("web"),
    /** Name of the AI client that created the set, e.g. "Claude". */
    agentName: text("agent_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("sets_owner_idx").on(t.ownerId)],
);

export const questions = pgTable(
  "questions",
  {
    id: text("id").primaryKey(),
    setId: text("set_id")
      .notNull()
      .references(() => sets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: questionType("type").notNull(),
    prompt: text("prompt").notNull(),
    /**
     * Type-specific answer data:
     * - flashcard / short_answer: { answer: string }
     * - multiple_choice: { choices: string[], correctIndex: number }
     * - true_false: { answer: boolean }
     */
    data: jsonb("data").notNull(),
    explanation: text("explanation"),
    sourceRef: text("source_ref"),
    verifiedBy: text("verified_by").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("questions_set_idx").on(t.setId, t.position)],
);

export const setsRelations = relations(sets, ({ many, one }) => ({
  questions: many(questions),
  owner: one(user, { fields: [sets.ownerId], references: [user.id] }),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  set: one(sets, { fields: [questions.setId], references: [sets.id] }),
}));

/**
 * MCP write rate limit: one counter per user per clock hour. Shared by every server
 * instance (Workers isolates don't share memory). Rows older than two hours are pruned.
 */
export const mcpWriteLimit = pgTable(
  "mcp_write_limit",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.windowStart] })],
);
