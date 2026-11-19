import { useState } from "react";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SkeletonRows } from "../../components/Skeleton";
import { useAuth } from "../../lib/auth/auth-context";
import { formatShortDate } from "../../lib/format";
import { SelectChip, type ChipOption } from "../calendar/SelectChip";
import { TeamError, useSetAccess, useSetRole, useTeam } from "./settings-api";
import {
  lastSignInLabel,
  memberInitials,
  memberName,
  roleBlockedReason,
  roleChoices,
  teamErrorText,
  type Member,
  type RoleChoice,
} from "./settings-rules";

const CHOICE_LABEL: Record<RoleChoice, string> = {
  admin: "Admin",
  member: "Member",
  remove: "Remove access…",
};

/**
 * 13 Team: everyone who has signed in. Admins change roles with a select chip (Admin / Member /
 * Remove access…) and restore removed people; members see the role chips only. The database
 * enforces the same rules (set_member_role / set_member_access): never zero admins, never yourself.
 */
export function TeamCard({ isAdmin, now }: { isAdmin: boolean; now: number }) {
  const { user } = useAuth();
  const meId = user?.id ?? "";
  const team = useTeam();
  const setRole = useSetRole();
  const setAccess = useSetAccess();
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const all = team.data ?? [];
  const active = all.filter((m) => !m.disabled_at);
  const removed = all.filter((m) => m.disabled_at);

  function choose(m: Member, choice: RoleChoice) {
    setProblem(null);
    const blocked = roleBlockedReason(all, m, choice, meId);
    if (blocked) return setProblem(blocked);
    if (choice === "remove") return setRemoving(m);
    if (choice === m.role) return;
    setRole.mutate(
      { id: m.id, role: choice },
      { onError: (e) => setProblem(teamErrorText(e instanceof TeamError ? e.code : undefined)) },
    );
  }

  return (
    <Card title="Team">
      <p className="-mt-2 mb-3 text-small text-muted">
        Anyone with a @breakthirty.com Google account can sign in. Admins can change roles or remove
        access.
      </p>
      {team.isError ? (
        <p className="border-t border-line pt-3 text-small text-muted">
          The team didn’t load.{" "}
          <button
            type="button"
            onClick={() => void team.refetch()}
            className="min-h-11 text-blue hover:underline md:min-h-0"
          >
            Try again
          </button>
        </p>
      ) : team.isPending ? (
        <SkeletonRows count={3} />
      ) : (
        <ul>
          {active.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-t border-line py-3">
              <Avatar
                initials={memberInitials(m)}
                tone={m.id === meId ? "user" : "brand"}
                size="md"
              />
              <PersonText m={m} me={m.id === meId} line={lastSignInLabel(m.last_sign_in_at, now)} />
              {isAdmin ? (
                <SelectChip<RoleChoice>
                  label={`Role for ${memberName(m)}`}
                  value={m.role}
                  placeholder="Role"
                  align="right"
                  options={roleChoices(m, meId).map((c): ChipOption<RoleChoice> => ({
                    value: c,
                    label: CHOICE_LABEL[c],
                  }))}
                  onChange={(c) => choose(m, c)}
                />
              ) : (
                <Chip tone={m.role === "admin" ? "ink" : "neutral"}>
                  {m.role === "admin" ? "Admin" : "Member"}
                </Chip>
              )}
            </li>
          ))}
          {removed.length > 0 && (
            <li className="border-t border-line pt-4 pb-1">
              <p className="mono-label text-muted">Removed</p>
            </li>
          )}
          {removed.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-t border-line py-3">
              <Avatar initials={memberInitials(m)} size="md" className="opacity-50" />
              <PersonText
                m={m}
                me={false}
                muted
                line={`Removed ${formatShortDate(m.disabled_at) ?? ""}`.trim()}
              />
              {isAdmin && (
                <button
                  type="button"
                  disabled={setAccess.isPending}
                  onClick={() => {
                    setProblem(null);
                    setAccess.mutate(
                      { id: m.id, active: true },
                      {
                        onError: (e) =>
                          setProblem(teamErrorText(e instanceof TeamError ? e.code : undefined)),
                      },
                    );
                  }}
                  className="min-h-11 shrink-0 text-small font-medium text-blue hover:underline disabled:opacity-60 md:min-h-0"
                >
                  Restore access
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p role="alert" className="mt-1 text-small text-spark-text">
          {problem}
        </p>
      )}

      {removing && (
        <ConfirmDialog
          open
          onClose={() => !setAccess.isPending && setRemoving(null)}
          title={`Remove ${memberName(removing)}’s access?`}
          description="They can’t open 30reach until an admin restores it. Their ideas, comments and cards stay."
          confirmLabel={setAccess.isPending ? "Removing…" : "Remove access"}
          busy={setAccess.isPending}
          onConfirm={() =>
            setAccess.mutate(
              { id: removing.id, active: false },
              {
                onSuccess: () => setRemoving(null),
                onError: (e) => {
                  setRemoving(null);
                  setProblem(teamErrorText(e instanceof TeamError ? e.code : undefined));
                },
              },
            )
          }
        />
      )}
    </Card>
  );
}

function PersonText({
  m,
  me,
  line,
  muted = false,
}: {
  m: Member;
  me: boolean;
  line: string | null;
  muted?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${muted ? "text-muted" : ""}`}>
      <p className="truncate text-body-sm font-medium">
        {memberName(m)}
        {me && <span className="font-normal text-muted"> (you)</span>}
      </p>
      <p className="truncate font-mono text-small text-muted">{m.email}</p>
      {line && <p className="text-label text-muted">{line}</p>}
    </div>
  );
}
