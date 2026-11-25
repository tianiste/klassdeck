import { Suspense } from "react";
import { connection } from "next/server";
import { emailPasswordEnabled, googleCredentials } from "@/lib/auth-options";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · Klassdeck" };

export default async function LoginPage() {
  // Whether Google is configured is known only at request time (Worker secrets).
  await connection();
  return (
    <div className="mx-auto max-w-sm py-6">
      <Suspense>
        <LoginForm google={googleCredentials() !== null} emailPassword={emailPasswordEnabled()} />
      </Suspense>
    </div>
  );
}
