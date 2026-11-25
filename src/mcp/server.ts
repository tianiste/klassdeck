import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { QuestionInput, QuestionList, SetInput, ValidQuestion } from "@/core/schema";
import {
  addQuestions,
  createSet,
  getSet,
  LimitError,
  listSets,
  NotFoundError,
  toQuestionOutput,
  updateQuestion,
} from "@/core/sets";
import { checkWriteLimit } from "@/core/write-limit";

export type McpCaller = {
  userId: string;
  /** Display name of the AI client (from its OAuth registration), e.g. "Claude". */
  agentName: string | null;
};

const INSTRUCTIONS = `Klassdeck stores the user's study material (quizzes and flashcards) so they can edit it, practice it with spaced repetition and share it with their class.

When to save:
- If the user asks you to save something to Klassdeck, save it right away with create_set; don't ask for confirmation again.
- If you made study material but the user didn't mention Klassdeck, offer to save it.

New set or existing set:
- Before create_set, call list_sets with a short topic word in \`query\` to see what the user already has.
- Use add_questions only when the user asked to extend a specific set, or when an existing set has the same topic and the same purpose (same test, grade or chapter) and the user agrees. Otherwise create a new set. If unsure, ask the user.

Quality:
- Every answer must be correct; Klassdeck stores exactly what you send and does not check facts.
- Add an explanation to every question, and a source_ref when the material came from the user's notes or textbook.
- Choose the question type by the answer: multiple_choice or true_false for facts with one clear answer, short_answer for a single word/number/name, flashcard for anything longer or open.

Fixing mistakes: call get_set to find the question's id, then update_question with the full corrected question.

After saving, give the user the link from the tool result.`;

const NAME = z.string();
const SetLink = { id: z.string().describe("Set id."), url: z.string().describe("Link to the set on Klassdeck.") };

const QuestionWithId = z.intersection(z.object({ id: z.string().describe("Question id, for update_question.") }), QuestionInput);

function json<T extends Record<string, unknown>>(value: T): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
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
      title: "Save a new study set",
      description:
        "Save a new set of study questions (a quiz or flashcards) to the user's Klassdeck. `title` and `questions` are required; `subject` and `description` are optional. Returns the set id and a link the user can open to edit and practice.",
      inputSchema: SetInput,
      outputSchema: z.object({
        ...SetLink,
        questionCount: z.number().int(),
        message: NAME.describe("Short confirmation to relay to the user."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (input) =>
      guarded(async () => {
        const limit = await checkWriteLimit(caller.userId);
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
      title: "Add questions to an existing set",
      description:
        "Append questions to the end of an existing set the user owns. Only use this when the user wants that specific set extended (see the server instructions); otherwise use create_set.",
      inputSchema: z.object({
        set_id: z.string().min(1).describe("Id of the set to extend, from create_set or list_sets."),
        questions: QuestionList,
      }),
      outputSchema: z.object({
        ...SetLink,
        added: z.number().int().describe("Questions added by this call."),
        questionCount: z.number().int().describe("Questions in the set now."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ set_id, questions }) =>
      guarded(async () => {
        const limit = await checkWriteLimit(caller.userId);
        if (limit) return fail(limit);
        return json(await addQuestions(caller.userId, set_id, questions));
      }),
  );

  server.registerTool(
    "update_question",
    {
      title: "Fix a question",
      description:
        "Replace one question in a set the user owns with a corrected version, e.g. to fix a wrong answer or a typo. Send the complete question (all fields for its type), not just the changed field; the type may change. Get question ids from get_set.",
      inputSchema: z.object({
        question_id: z.string().min(1).describe("Id of the question, from get_set."),
        question: ValidQuestion.describe("The full corrected question."),
      }),
      outputSchema: z.object({
        id: z.string().describe("Question id."),
        set_id: z.string(),
        url: z.string().describe("Link to the set on Klassdeck."),
        version: z.number().int().describe("Edit count of this question, starting at 1."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ question_id, question }) =>
      guarded(async () => {
        const limit = await checkWriteLimit(caller.userId);
        if (limit) return fail(limit);
        const r = await updateQuestion(caller.userId, question_id, question);
        return json({ id: r.id, set_id: r.setId, url: r.url, version: r.version });
      }),
  );

  server.registerTool(
    "list_sets",
    {
      title: "List study sets",
      description:
        "List the user's saved sets, most recently changed first. With no filters it returns the latest sets. Call it before create_set to avoid duplicates.",
      inputSchema: z.object({
        query: z
          .string()
          .max(200)
          .optional()
          .describe(
            "Optional. Case-insensitive substring searched in titles, subjects and descriptions. Use one short topic word (e.g. \"photosynthesis\"); sets may be in the user's language.",
          ),
        subject: z
          .string()
          .max(100)
          .optional()
          .describe(
            'Optional. Exact subject name, ignoring case (e.g. "Biology" matches "biology" but not "Biologija"). Prefer `query` when unsure how the user named the subject.',
          ),
        limit: z.number().int().min(1).max(100).optional().describe("Optional. Maximum sets to return; default 50."),
      }),
      outputSchema: z.object({
        sets: z.array(
          z.object({
            ...SetLink,
            title: z.string(),
            subject: z.string().nullable(),
            questionCount: z.number().int(),
            updatedAt: z.string().describe("ISO 8601 timestamp of the last change."),
          }),
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    (opts) =>
      guarded(async () => {
        const sets = await listSets(caller.userId, opts);
        return json({ sets: sets.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() })) });
      }),
  );

  server.registerTool(
    "get_set",
    {
      title: "Read a study set",
      description: "Read one set the user owns, with all questions, answers and question ids.",
      inputSchema: z.object({ set_id: z.string().min(1).describe("Id of the set, from create_set or list_sets.") }),
      outputSchema: z.object({
        ...SetLink,
        title: z.string(),
        subject: z.string().nullable(),
        description: z.string().nullable(),
        questions: z.array(QuestionWithId),
      }),
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
