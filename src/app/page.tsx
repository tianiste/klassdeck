import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export default async function Home() {
  if (await getUser()) redirect("/dashboard");

  return (
    <div className="py-10">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Your AI makes the quiz. <span className="text-accent">Klassdeck keeps it.</span>
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        Connect Claude or ChatGPT and every quiz and flashcard set it makes is saved in one place,
        where you can fix it, practice it and share it with your class. Free, because you bring
        your own AI.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login?mode=signup" className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90">
          Create an account
        </Link>
        <Link href="/login" className="rounded-lg border border-line bg-surface px-5 py-2.5 font-medium hover:border-accent">
          Log in
        </Link>
      </div>
    </div>
  );
}
