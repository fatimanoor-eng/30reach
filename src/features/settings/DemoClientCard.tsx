import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useToast } from "../../components/toast-context";
import { clientPath } from "../../lib/client-path";
import { useClients } from "../../lib/useClient";
import { useResetDemo } from "../clients/clients-api";

/**
 * Settings: the Demo client (Slice 17f; no frame). Made-up brands and data for trying 30reach or showing
 * it to someone, dated from today. Pulls are off for it; Blip works. 0 credits.
 */
/** `here` = shown in the demo client's own settings: no "Open" link. */
export function DemoClientCard({ here = false }: { here?: boolean }) {
  const clients = useClients();
  const demo = clients.data?.find((c) => c.is_demo && !c.archived_at);
  const reset = useResetDemo();
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <Card title="Demo client">
      <p className="text-body-sm text-muted">
        Made-up wellness brands, posts, ideas and calendar cards, dated from today. Pulls are off
        for it; Blip works. Uses no credits.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {demo && !here && (
          <Link
            to={clientPath(demo.slug, "/overview")}
            className="inline-flex min-h-11 items-center text-small font-medium text-blue hover:underline md:min-h-8"
          >
            Open {demo.name}
          </Link>
        )}
        <Button
          variant={demo ? "secondary" : "primary"}
          disabled={reset.isPending}
          onClick={() =>
            reset.mutate(undefined, {
              onSuccess: (r) => {
                toast.show({
                  title: r.created ? "Demo client added" : "Demo data reset",
                  pose: "success",
                });
                navigate(clientPath(r.slug, "/overview"));
              },
              onError: () =>
                toast.show({
                  title: "Couldn’t set up the demo client",
                  detail: "Please try again.",
                  pose: "error",
                }),
            })
          }
        >
          {reset.isPending ? "Working…" : demo ? "Reset demo data" : "Add the demo client"}
        </Button>
      </div>
    </Card>
  );
}
