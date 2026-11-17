import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { RequireTeam } from "../features/auth/RequireTeam";
import { SignInPage } from "../features/auth/SignInPage";
import { WelcomePage } from "../features/auth/WelcomePage";
import { WrongAccountPage } from "../features/auth/WrongAccountPage";
import { MorePage } from "../features/more/MorePage";
import { NotFoundPage } from "../features/NotFoundPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import { PlaceholderPage } from "../features/PlaceholderPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { SocialPage } from "../features/social/SocialPage";
import { AppShell } from "./AppShell";

/**
 * Dev-only routes. `import.meta.env.DEV` is replaced with `false` in production builds, so this
 * array is empty there and the gallery's dynamic import is dropped from the bundle entirely.
 */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: "dev/components",
        // Lazy route: render nothing for the split second while the gallery chunk loads.
        HydrateFallback: () => null,
        lazy: () =>
          import("../features/dev/ComponentsGallery").then((m) => ({
            Component: m.ComponentsGallery,
          })),
      },
      {
        // Slice 5 test mode: one brand × one platform, 2-page cap (real Firecrawl credits).
        path: "dev/test-pull",
        HydrateFallback: () => null,
        lazy: () =>
          import("../features/dev/TestPullPage").then((m) => ({ Component: m.TestPullPage })),
      },
    ]
  : [];

/** Everything inside the app shell — only for signed-in @breakthirty.com accounts. */
const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "instagram", element: <SocialPage key="instagram" platform="instagram" /> },
      { path: "tiktok", element: <SocialPage key="tiktok" platform="tiktok" /> },
      {
        path: "competitors",
        element: (
          <PlaceholderPage
            title="Competitors"
            slice={8}
            text="Add, edit and remove the brands 30reach tracks. Handles are checked on save."
          />
        ),
      },
      {
        path: "calendar",
        element: (
          <PlaceholderPage
            title="Calendar"
            slice={9}
            text="Plan posts around holidays, health months and marketing dates. Planning only, nothing is posted."
          />
        ),
      },
      {
        path: "ideas",
        element: (
          <PlaceholderPage
            title="Idea board"
            slice={10}
            text="Save screenshots, links, notes and competitor posts, then plan them onto the calendar."
          />
        ),
      },
      { path: "settings", element: <SettingsPage /> },
      { path: "more", element: <MorePage /> },
      ...devRoutes,
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const routes: RouteObject[] = [
  // Public: sign-in flow (01 / M01, 01b, 02)
  { path: "sign-in", element: <SignInPage /> },
  { path: "welcome", element: <WelcomePage /> },
  { path: "wrong-account", element: <WrongAccountPage /> },
  // Protected
  { element: <RequireTeam />, children: appRoutes },
];

export const router = createBrowserRouter(routes);
