import { z } from "zod";

/**
 * The one question format shared by the MCP tools, the web app and (later)
 * paste-import. Every way content enters Klassdeck is validated here. The
 * descriptions are what AI clients read, so keep them precise.
 */

const text = (max: number) => z.string().trim().min(1).max(max);

const common = {
  prompt: text(2000).describe("The question, or the front of a flashcard."),
  explanation: text(4000)
    .optional()
    .describe(
      "Optional but strongly recommended: one or two sentences on why the answer is correct. Shown together with the answer when the student checks it.",
    ),
  source_ref: text(300)
    .optional()
    .describe(
      'Optional. Where the content comes from, e.g. "Lecture 3, slide 12" or "Textbook p. 45". Include it when the question is based on the user\'s notes or textbook.',
    ),
};

export const QuestionInput = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("flashcard"),
        ...common,
        answer: text(4000).describe("The back of the card. Can be a sentence or a short paragraph."),
      })
      .describe(
        "Front/back card for open recall (definitions, explanations, 'why' questions). The student thinks of the answer, flips the card and rates how well they knew it.",
      ),
    z
      .object({
        type: z.literal("multiple_choice"),
        ...common,
        choices: z.array(text(500)).min(2).max(6).describe("2–6 answer options, exactly one of them correct."),
        correct_index: z
          .number()
          .int()
          .min(0)
          .max(5)
          .describe("0-based position of the correct option in `choices`; must be less than the number of choices."),
      })
      .describe("One correct option among 2–6. Graded automatically."),
    z
      .object({
        type: z.literal("true_false"),
        ...common,
        answer: z.boolean().describe("true if the statement in `prompt` is true."),
      })
      .describe("A statement the student marks true or false. Graded automatically."),
    z
      .object({
        type: z.literal("short_answer"),
        ...common,
        answer: text(1000).describe(
          'The expected answer: keep it to a word, number, name or short phrase (e.g. "8", "Chlorophyll"). The student types an answer and then compares it with this one.',
        ),
      })
      .describe(
        "The student types a short answer. Use only when the answer is short and unambiguous; use a flashcard for longer or open answers.",
      ),
  ])
  .describe("One question. `type` decides which other fields are required.");
export type QuestionInput = z.infer<typeof QuestionInput>;

export const MAX_QUESTIONS_PER_CALL = 200;
export const MAX_QUESTIONS_PER_SET = 2000;

function checkCorrectIndex(q: QuestionInput, ctx: z.RefinementCtx, path: (string | number)[]) {
  if (q.type === "multiple_choice" && q.correct_index >= q.choices.length) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "correct_index"],
      message: `correct_index ${q.correct_index} is out of range for ${q.choices.length} choices`,
    });
  }
}

export const ValidQuestion = QuestionInput.superRefine((q, ctx) => checkCorrectIndex(q, ctx, []));

export const QuestionList = z
  .array(QuestionInput)
  .min(1)
  .max(MAX_QUESTIONS_PER_CALL)
  .superRefine((qs, ctx) => qs.forEach((q, i) => checkCorrectIndex(q, ctx, [i])))
  .describe(`1–${MAX_QUESTIONS_PER_CALL} questions, in the order they should appear.`);

export const SetInput = z.object({
  title: text(200).describe('Short title, e.g. "Photosynthesis – chapter 4 quiz".'),
  subject: text(100)
    .optional()
    .describe(
      'Optional. The school subject in the user\'s language, e.g. "Biology" or "Biologija". Used to group sets and to filter list_sets.',
    ),
  description: text(2000)
    .optional()
    .describe("Optional. One or two sentences on what the set covers and who it is for (e.g. the test or grade)."),
  questions: QuestionList,
});
export type SetInput = z.infer<typeof SetInput>;

/** Stored per-type answer data (questions.data column). */
export type QuestionData =
  | { answer: string }
  | { choices: string[]; correctIndex: number }
  | { answer: boolean };

export function toStoredQuestion(q: QuestionInput): {
  type: QuestionInput["type"];
  prompt: string;
  data: QuestionData;
  explanation: string | null;
  sourceRef: string | null;
} {
  const base = {
    type: q.type,
    prompt: q.prompt,
    explanation: q.explanation ?? null,
    sourceRef: q.source_ref ?? null,
  };
  switch (q.type) {
    case "multiple_choice":
      return { ...base, data: { choices: q.choices, correctIndex: q.correct_index } };
    case "true_false":
      return { ...base, data: { answer: q.answer } };
    default:
      return { ...base, data: { answer: q.answer } };
  }
}
