import type { ReactNode } from "react";
import { Logo } from "../../components/Logo";
import { BrandGlow } from "./BrandGlow";

/**
 * Sign-in layout (Figma 01 / 01b / 02, M01).
 * Tablet/desktop: black brand panel left, form right (50/50). Mobile: brand panel on top, form below.
 * The panel's dot grid (Figma "Dot grid": 2 px dots every 32 px, first at 16 px) is a CSS background.
 */
export function AuthLayout({ children, busy = false }: { children?: ReactNode; busy?: boolean }) {
  return (
    <div className="min-h-dvh bg-bg md:grid md:grid-cols-2">
      <section
        aria-label="30reach"
        className="on-dark relative flex h-107.5 flex-col overflow-hidden bg-black px-6 pt-8 pb-4 text-white md:sticky md:top-0 md:h-dvh md:px-10 md:pt-12 md:pb-10 xl:px-14 xl:pt-14 xl:pb-12"
        style={{
          backgroundImage:
            "radial-gradient(circle at 17px 17px, rgb(255 255 255 / 0.16) 1px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      >
        <BrandGlow />
        <Logo className="relative h-6.5 w-auto self-start text-white xl:h-8.5" />
        <div className="relative mt-auto">
          <div aria-hidden="true" className="h-1.5 w-12 rounded-sm bg-flash" />
          <p className="mt-6 text-hero-sm md:mt-8 xl:text-hero">
            See what the competition posts. Plan what our clients post next.
          </p>
          <p className="mt-10 hidden mono-label text-sidebar-text md:block xl:mt-12">
            30reach · Internal tool · Breakthirty
          </p>
        </div>
      </section>

      <main
        id="main"
        aria-busy={busy || undefined}
        className="flex justify-center px-6 pt-10 pb-12 md:items-center md:px-10"
      >
        <div className="w-full max-w-100 text-center">{children}</div>
      </main>
    </div>
  );
}
