import { useId, useState } from "react";
import { Button } from "../../components/Button";
import type { ContentRule } from "../../lib/client-rules";

/** Add / edit one content rule (Client settings 16, Add client Review 15d): Rule + Why, Save / Cancel. */
export function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ContentRule;
  onSave: (rule: string, why: string) => void;
  onCancel: () => void;
}) {
  const [rule, setRule] = useState(initial?.rule ?? "");
  const [why, setWhy] = useState(initial?.why ?? "");
  const ruleId = useId();
  const whyId = useId();
  const field =
    "[field-sizing:content] min-h-11 w-full resize-none rounded-control border border-line bg-surface px-3 py-2.5 text-body-sm outline-none focus:border-ink";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (rule.trim()) onSave(rule.trim().slice(0, 200), why.trim().slice(0, 300));
      }}
    >
      <div>
        <label htmlFor={ruleId} className="mb-2 block mono-label text-muted">
          Rule
        </label>
        <textarea
          id={ruleId}
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          rows={1}
          maxLength={200}
          placeholder="e.g. No prices in captions"
          className={field}
          autoFocus
        />
      </div>
      <div>
        <label htmlFor={whyId} className="mb-2 block mono-label text-muted">
          Why · optional
        </label>
        <textarea
          id={whyId}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          rows={1}
          maxLength={300}
          className={field}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!rule.trim()}>
          {initial ? "Save rule" : "Add rule"}
        </Button>
      </div>
    </form>
  );
}
