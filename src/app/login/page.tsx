import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · Klassdeck" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm py-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
