import { Logo } from "../components/Logo";

/** Slice 0 placeholder: proves tokens, fonts and the logo work at 390 / 768 / 1440. */
export function HelloPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16 md:px-6 xl:px-10">
      <h1 className="w-full max-w-72 text-ink md:max-w-96 xl:max-w-133">
        <Logo className="block h-auto w-full" />
      </h1>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="mono-label text-muted">Slice 0 · Project setup</p>
        <p className="max-w-128 text-body text-ink">
          Competitor research and content planning for Breakthirty.
        </p>
      </div>
    </main>
  );
}
