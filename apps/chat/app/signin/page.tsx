import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
      Wrong email or password.
    </p>
  );
}

async function login(form: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirectTo: "/",
    });
  } catch (e) {
    if (e instanceof AuthError) redirect("/signin?error=1");
    throw e; // the success redirect is thrown too
  }
}

const field =
  "w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20";

export default function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form action={login} className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Chat</h1>
        <Suspense>
          <ErrorMessage searchParams={searchParams} />
        </Suspense>
        <input name="email" type="email" required autoComplete="username" placeholder="Email" className={field} />
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          className={field}
        />
        <button
          type="submit"
          className="w-full rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/80"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
