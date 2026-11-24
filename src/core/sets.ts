import { and, asc, count, desc, eq, ilike, max, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { questions, sets } from "@/db/schema";
import {
  MAX_QUESTIONS_PER_SET,
  type QuestionData,
  type QuestionInput,
  type SetInput,
  toStoredQuestion,
} from "./schema";
import { baseUrl } from "@/lib/auth-options";

/**
 * Business logic for sets. Web pages and MCP tools both call these functions,
 * so behaviour is identical however content arrives. Every function takes the
 * acting user's id and enforces access itself.
 */

export class NotFoundError extends Error {}
export class LimitError extends Error {}

export const setUrl = (id: string) => `${baseUrl}/s/${id}`;

export type SetSummary = {
  id: string;
  title: string;
  subject: string | null;
  questionCount: number;
  updatedAt: Date;
  url: string;
};

export type QuestionView = {
  id: string;
  position: number;
  type: QuestionInput["type"];
  prompt: string;
  data: QuestionData;
  explanation: string | null;
  sourceRef: string | null;
};

export type SetView = {
  id: string;
  title: string;
  subject: string | null;
  description: string | null;
  source: "mcp" | "web" | "import";
  agentName: string | null;
  createdAt: Date;
  updatedAt: Date;
  url: string;
  questions: QuestionView[];
};

export async function createSet(
  userId: string,
  input: SetInput,
  origin: { source: "mcp" | "web" | "import"; agentName?: string | null },
): Promise<{ id: string; url: string; questionCount: number }> {
  const id = nanoid(10);
  await db.transaction(async (tx) => {
    await tx.insert(sets).values({
      id,
      ownerId: userId,
      title: input.title,
      subject: input.subject ?? null,
      description: input.description ?? null,
      source: origin.source,
      agentName: origin.agentName ?? null,
    });
    await tx.insert(questions).values(
      input.questions.map((q, i) => ({
        id: nanoid(12),
        setId: id,
        position: i,
        ...toStoredQuestion(q),
      })),
    );
  });
  return { id, url: setUrl(id), questionCount: input.questions.length };
}

export async function addQuestions(
  userId: string,
  setId: string,
  input: QuestionInput[],
): Promise<{ id: string; url: string; added: number; questionCount: number }> {
  return db.transaction(async (tx) => {
    const [set] = await tx
      .select({ id: sets.id })
      .from(sets)
      .where(and(eq(sets.id, setId), eq(sets.ownerId, userId)));
    if (!set) throw new NotFoundError(`Set ${setId} not found`);

    const [stats] = await tx
      .select({ n: count(), last: max(questions.position) })
      .from(questions)
      .where(eq(questions.setId, setId));
    const existing = Number(stats?.n ?? 0);
    if (existing + input.length > MAX_QUESTIONS_PER_SET) {
      throw new LimitError(
        `A set can hold at most ${MAX_QUESTIONS_PER_SET} questions (it has ${existing}).`,
      );
    }
    const start = stats?.last == null ? 0 : Number(stats.last) + 1;
    await tx.insert(questions).values(
      input.map((q, i) => ({ id: nanoid(12), setId, position: start + i, ...toStoredQuestion(q) })),
    );
    await tx.update(sets).set({ updatedAt: new Date() }).where(eq(sets.id, setId));
    return { id: setId, url: setUrl(setId), added: input.length, questionCount: existing + input.length };
  });
}

export async function listSets(
  userId: string,
  opts: { query?: string; subject?: string; limit?: number } = {},
): Promise<SetSummary[]> {
  const filters = [eq(sets.ownerId, userId)];
  if (opts.query) {
    const like = `%${opts.query.replace(/[%_\\]/g, "\\$&")}%`;
    filters.push(or(ilike(sets.title, like), ilike(sets.subject, like), ilike(sets.description, like))!);
  }
  if (opts.subject) filters.push(ilike(sets.subject, opts.subject.replace(/[%_\\]/g, "\\$&")));

  const rows = await db
    .select({
      id: sets.id,
      title: sets.title,
      subject: sets.subject,
      updatedAt: sets.updatedAt,
      questionCount: count(questions.id),
    })
    .from(sets)
    .leftJoin(questions, eq(questions.setId, sets.id))
    .where(and(...filters))
    .groupBy(sets.id)
    .orderBy(desc(sets.updatedAt))
    .limit(Math.min(opts.limit ?? 50, 100));

  return rows.map((r) => ({ ...r, questionCount: Number(r.questionCount), url: setUrl(r.id) }));
}

export async function getSet(userId: string, setId: string): Promise<SetView> {
  const set = await db.query.sets.findFirst({
    where: and(eq(sets.id, setId), eq(sets.ownerId, userId)),
    with: { questions: { orderBy: [asc(questions.position)] } },
  });
  if (!set) throw new NotFoundError(`Set ${setId} not found`);
  return {
    id: set.id,
    title: set.title,
    subject: set.subject,
    description: set.description,
    source: set.source,
    agentName: set.agentName,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
    url: setUrl(set.id),
    questions: set.questions.map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      prompt: q.prompt,
      data: q.data as QuestionData,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
    })),
  };
}

/** Converts a stored question back to the public QuestionInput shape (for MCP output). */
export function toQuestionOutput(q: QuestionView) {
  const base = {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    ...(q.explanation ? { explanation: q.explanation } : {}),
    ...(q.sourceRef ? { source_ref: q.sourceRef } : {}),
  };
  const d = q.data as Record<string, unknown>;
  if (q.type === "multiple_choice") return { ...base, choices: d.choices, correct_index: d.correctIndex };
  return { ...base, answer: d.answer };
}
