import { Suspense } from "react";
import { signIn } from "@/auth";

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error === "AccessDenied"
        ? "Not authorized. Your account is not on the list of people allowed to use this app."
        : "Sign-in failed. Please try again."}
    </p>
  );
}

export default function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Chat</h1>
        <Suspense>
          <ErrorMessage searchParams={searchParams} />
        </Suspense>
        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/80"
          >
            Sign in with Microsoft
          </button>
        </form>
      </div>
    </main>
  );
}
