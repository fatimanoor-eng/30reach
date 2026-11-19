import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { BlipSuccess } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { FRESH_SIGN_IN_KEY, useAuth } from "../../lib/auth/auth-context";
import { isDomainRejection, parseRejectedEmail, readUrlError } from "../../lib/auth/domain";
import { AuthLayout } from "./AuthLayout";

function isFresh(): boolean {
  try {
    return sessionStorage.getItem(FRESH_SIGN_IN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * /welcome — where Google sends people back.
 * Hook rejection → 02. Other errors → 01 with a message. Fresh team sign-in → 01b. Otherwise → Overview.
 */
export function WelcomePage() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [urlError] = useState(() => readUrlError(window.location.href));
  const [fresh] = useState(isFresh);

  if (urlError) {
    return isDomainRejection(urlError) ? (
      <Navigate to="/wrong-account" replace state={{ email: parseRejectedEmail(urlError) }} />
    ) : (
      <Navigate to="/sign-in" replace state={{ error: `Sign-in didn't finish: ${urlError}` }} />
    );
  }
  if (status === "loading") return <AuthLayout busy />;
  if (status === "signedOut") return <Navigate to="/sign-in" replace />;
  if (status === "wrongAccount") return <Navigate to="/wrong-account" replace />;
  if (status === "removed") return <Navigate to="/access-removed" replace />;
  if (!fresh) return <Navigate to="/overview" replace />;

  function open() {
    try {
      sessionStorage.removeItem(FRESH_SIGN_IN_KEY);
    } catch {
      /* ignore */
    }
    navigate("/overview", { replace: true });
  }

  return (
    <AuthLayout>
      <BlipSuccess className="mx-auto h-auto w-28" />
      <h1 className="mt-6 text-heading md:text-heading-lg">
        Welcome in{user?.firstName ? `, ${user.firstName}` : ""}!
      </h1>
      <p className="mx-auto mt-3 max-w-100 text-body text-muted">
        You’re signed in as {user?.email}. Blip is ready when you are.
      </p>
      <Button fullWidth className="mt-8" onClick={open}>
        Open 30reach
      </Button>
    </AuthLayout>
  );
}
