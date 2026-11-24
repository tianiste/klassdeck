import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { getUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Klassdeck",
  description: "Your AI makes the study material. Klassdeck keeps it, fixes it and shares it with your class.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
            <Link href={user ? "/dashboard" : "/"} className="text-lg font-semibold tracking-tight">
              Klass<span className="text-accent">deck</span>
            </Link>
            {user ? (
              <div className="flex items-center gap-4 text-sm">
                <Link href="/dashboard" className="hover:text-accent">My sets</Link>
                <span className="text-muted">{user.name}</span>
                <SignOutButton />
              </div>
            ) : (
              <Link href="/login" className="text-sm font-medium hover:text-accent">Log in</Link>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">{children}</main>
      </body>
    </html>
  );
}
