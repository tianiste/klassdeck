import { z } from "zod";

/**
 * The one question format shared by the MCP tools, the web app and (later)
 * paste-import. Every way content enters Klassdeck is validated here.
 */

const text = (max: number) => z.string().trim().min(1).max(max);

const common = {
  prompt: text(2000).describe("The question or the front of the card."),
  explanation: text(4000)
    .optional()
    .describe("Why the answer is correct. Strongly recommended: shown after a wrong answer."),
  source_ref: text(300)
    .optional()
    .describe('Where this comes from, e.g. "Lecture 3, slide 12" or "Textbook p. 45".'),
};

export const QuestionInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("flashcard"),
    ...common,
    answer: text(4000).describe("The back of the card."),
  }),
  z.object({
    type: z.literal("multiple_choice"),
    ...common,
    choices: z.array(text(500)).min(2).max(6).describe("2–6 answer options."),
    correct_index: z.number().int().min(0).describe("0-based index of the correct option in `choices`."),
  }),
  z.object({
    type: z.literal("true_false"),
    ...common,
    answer: z.boolean(),
  }),
  z.object({
    type: z.literal("short_answer"),
    ...common,
    answer: text(1000).describe("The expected answer."),
  }),
]);
export type QuestionInput = z.infer<typeof QuestionInput>;

export const MAX_QUESTIONS_PER_CALL = 200;
export const MAX_QUESTIONS_PER_SET = 2000;

export const QuestionList = z
  .array(QuestionInput)
  .min(1)
  .max(MAX_QUESTIONS_PER_CALL)
  .superRefine((qs, ctx) => {
    qs.forEach((q, i) => {
      if (q.type === "multiple_choice" && q.correct_index >= q.choices.length) {
        ctx.addIssue({
          code: "custom",
          path: [i, "correct_index"],
          message: `correct_index ${q.correct_index} is out of range for ${q.choices.length} choices`,
        });
      }
    });
  });

export const SetInput = z.object({
  title: text(200).describe('Short title, e.g. "Photosynthesis – chapter 4 quiz".'),
  subject: text(100).optional().describe('School subject, e.g. "Biology".'),
  description: text(2000).optional(),
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
