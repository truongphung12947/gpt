import { auth, signOut } from "@/auth";

/** Signed-in user and sign-out, pinned to the top-right corner. */
export async function UserMenu() {
  const session = await auth();
  if (!session?.user) return null;
  return (
    <form
      className="fixed right-3 top-2 z-50 flex items-center gap-2 text-xs text-muted-foreground"
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <span className="hidden max-w-48 truncate sm:inline">{session.user.email ?? session.user.name}</span>
      <button type="submit" className="rounded-full border px-2.5 py-1 hover:bg-muted">
        Sign out
      </button>
    </form>
  );
}
