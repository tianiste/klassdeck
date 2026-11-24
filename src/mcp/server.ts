import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { QuestionList, SetInput } from "@/core/schema";
import {
  addQuestions,
  createSet,
  getSet,
  LimitError,
  listSets,
  NotFoundError,
  toQuestionOutput,
} from "@/core/sets";
import { checkWriteLimit } from "./rate-limit";

export type McpCaller = {
  userId: string;
  /** Display name of the AI client (from its OAuth registration), e.g. "Claude". */
  agentName: string | null;
};

const INSTRUCTIONS = `Klassdeck stores study material (quizzes and flashcards) for the user so they can edit, practice and share it with their class.
- When the user asks you to make a quiz, flashcards or practice questions, offer to save them with create_set.
- Before creating a new set on a topic, call list_sets to check whether a matching set exists; if so, use add_questions instead.
- Include an explanation for each question and a source_ref when the material came from the user's notes or textbook.
- After saving, give the user the link that the tool returns.`;

function json(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof LimitError) return fail(err.message);
    console.error("[mcp] tool failed", err);
    return fail("Something went wrong on Klassdeck's side. Please try again.");
  }
}

/** Builds a fresh MCP server bound to one authenticated user. */
export function createKlassdeckServer(caller: McpCaller): McpServer {
  const server = new McpServer(
    { name: "klassdeck", title: "Klassdeck", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "create_set",
    {
      title: "Save a study set",
      description:
        "Save a new set of study questions (quiz or flashcards) to the user's Klassdeck. Returns the set id and a link the user can open to edit and practice.",
      inputSchema: SetInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (input) =>
      guarded(async () => {
        const limit = checkWriteLimit(caller.userId);
        if (limit) return fail(limit);
        const created = await createSet(caller.userId, input, {
          source: "mcp",
          agentName: caller.agentName,
        });
        return json({ ...created, message: `Saved ${created.questionCount} questions: ${created.url}` });
      }),
  );

  server.registerTool(
    "add_questions",
    {
      title: "Add questions to a set",
      description: "Append questions to an existing set the user owns.",
      inputSchema: z.object({
        set_id: z.string().min(1).describe("Id returned by create_set or list_sets."),
        questions: QuestionList,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ set_id, questions }) =>
      guarded(async () => {
        const limit = checkWriteLimit(caller.userId);
        if (limit) return fail(limit);
        return json(await addQuestions(caller.userId, set_id, questions));
      }),
  );

  server.registerTool(
    "list_sets",
    {
      title: "List study sets",
      description:
        "List the user's saved sets, newest first. Optionally filter by a search query or subject. Use this before creating a set to avoid duplicates.",
      inputSchema: z.object({
        query: z.string().max(200).optional().describe("Text to search in titles, subjects and descriptions."),
        subject: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    (opts) => guarded(async () => json({ sets: await listSets(caller.userId, opts) })),
  );

  server.registerTool(
    "get_set",
    {
      title: "Read a study set",
      description: "Read one set with all of its questions and answers.",
      inputSchema: z.object({ set_id: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    ({ set_id }) =>
      guarded(async () => {
        const set = await getSet(caller.userId, set_id);
        return json({
          id: set.id,
          title: set.title,
          subject: set.subject,
          description: set.description,
          url: set.url,
          questions: set.questions.map(toQuestionOutput),
        });
      }),
  );

  return server;
}
