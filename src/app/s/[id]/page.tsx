import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser, requireUser } from "@/lib/auth";
import { getSet, NotFoundError, type QuestionView, type SetView } from "@/core/sets";

const TYPE_LABELS: Record<QuestionView["type"], string> = {
  flashcard: "Flashcard",
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  short_answer: "Short answer",
};

export async function generateMetadata({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const user = await getUser();
  const set = user ? await getSet(user.id, id).catch(() => null) : null;
  return { title: set ? `${set.title} · Klassdeck` : "Klassdeck" };
}

export default async function SetPage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/s/${id}`);

  let set: SetView;
  try {
    set = await getSet(user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-muted hover:text-accent">← My sets</Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{set.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {set.subject ? `${set.subject} · ` : ""}
        {set.questions.length} questions
        {set.source === "mcp" ? ` · saved by ${set.agentName ?? "your AI"}` : ""}
      </p>
      {set.description && <p className="mt-4 max-w-2xl">{set.description}</p>}

      <ol className="mt-8 space-y-4">
        {set.questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-medium">
                <span className="mr-2 text-muted">{i + 1}.</span>
                {q.prompt}
              </p>
              <span className="shrink-0 text-xs text-muted">{TYPE_LABELS[q.type]}</span>
            </div>
            <Answer q={q} />
            {q.explanation && <p className="mt-3 text-sm text-muted">{q.explanation}</p>}
            {q.sourceRef && <p className="mt-2 text-xs text-muted">Source: {q.sourceRef}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Answer({ q }: { q: QuestionView }) {
  const d = q.data as { answer?: string | boolean; choices?: string[]; correctIndex?: number };
  if (q.type === "multiple_choice" && d.choices) {
    return (
      <ul className="mt-3 space-y-1.5">
        {d.choices.map((c, i) => (
          <li
            key={i}
            className={`rounded-md px-3 py-1.5 text-sm ${
              i === d.correctIndex ? "bg-green-50 font-medium text-good" : "bg-background"
            }`}
          >
            {String.fromCharCode(65 + i)}. {c}
            {i === d.correctIndex && " ✓"}
          </li>
        ))}
      </ul>
    );
  }
  const answer = typeof d.answer === "boolean" ? (d.answer ? "True" : "False") : d.answer;
  return (
    <p className="mt-3 rounded-md bg-green-50 px-3 py-1.5 text-sm text-good">
      <span className="font-medium">Answer:</span> {answer}
    </p>
  );
}
