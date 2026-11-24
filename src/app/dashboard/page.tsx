import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listSets } from "@/core/sets";
import { mcpResource } from "@/lib/auth-options";
import { ConnectCard } from "@/components/connect-card";

export const metadata = { title: "My sets · Klassdeck" };

export default async function Dashboard() {
  const user = await requireUser("/dashboard");
  const sets = await listSets(user.id);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">My sets</h1>

      {sets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <p className="font-medium">No sets yet</p>
          <p className="mt-1 text-sm text-muted">
            Connect your AI below, then ask it: “Make me a 10-question quiz on photosynthesis and
            save it to Klassdeck.”
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {sets.map((s) => (
            <li key={s.id}>
              <Link href={`/s/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-background">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-muted">
                    {s.subject ? `${s.subject} · ` : ""}
                    {s.questionCount} {s.questionCount === 1 ? "question" : "questions"}
                  </p>
                </div>
                <time className="text-sm text-muted" dateTime={s.updatedAt.toISOString()}>
                  {s.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ConnectCard mcpUrl={mcpResource} />
    </div>
  );
}
