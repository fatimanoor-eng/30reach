import { Link } from "react-router";
import { PageHeader } from "../app/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Card>
        <EmptyState
          label="404"
          title="Nothing here"
          text="This page doesn't exist."
          actions={
            <Link
              to="/overview"
              className="inline-flex min-h-11 items-center rounded-control bg-ink px-4 text-body-sm font-medium text-white md:min-h-10"
            >
              Go to Overview
            </Link>
          }
        />
      </Card>
    </>
  );
}
