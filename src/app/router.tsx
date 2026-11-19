import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { RequireTeam } from "../features/auth/RequireTeam";
import { SignInPage } from "../features/auth/SignInPage";
import { WelcomePage } from "../features/auth/WelcomePage";
import { WrongAccountPage } from "../features/auth/WrongAccountPage";
import { MorePage } from "../features/more/MorePage";
import { AccessRemovedPage } from "../features/auth/AccessRemovedPage";
import { NotFoundPage } from "../features/NotFoundPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { CalendarPage } from "../features/calendar/CalendarPage";
import { IdeasPage } from "../features/ideas/IdeasPage";
import { CompetitorsPage } from "../features/competitors/CompetitorsPage";
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
        element: <CompetitorsPage />,
      },
      { path: "calendar", element: <CalendarPage /> },
      { path: "ideas", element: <IdeasPage /> },
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
  { path: "access-removed", element: <AccessRemovedPage /> },
  // Protected
  { element: <RequireTeam />, children: appRoutes },
];

export const router = createBrowserRouter(routes);
