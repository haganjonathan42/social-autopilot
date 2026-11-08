import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next =
    params.next && params.next.startsWith("/") ? params.next : "/dashboard";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">social-autopilot</h1>
        <p className="mt-1 mb-5 text-sm" style={{ color: "var(--muted)" }}>
          Sign in to review and publish drafts.
        </p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
