import { X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Chip } from "../../components/Chip";
import { addTag, MAX_TAG_LENGTH, MAX_TAGS } from "./idea-rules";

/**
 * Tags on a draft (14a): the tags as chips (click one to remove it) and "+ tag", which turns into a
 * small field. Enter or comma adds, Esc cancels, leaving the field adds what was typed.
 */
export function TagEditor({
  tags,
  onChange,
  leading,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Shown before the chips, e.g. the platform icon. */
  leading?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  const commit = () => {
    if (text.trim()) onChange(addTag(tags, text));
    setText("");
  };

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setText("");
      setEditing(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5" role="group" aria-label="Tags">
      {leading}
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onChange(tags.filter((t) => t !== tag))}
          aria-label={`Remove tag ${tag}`}
          className="group inline-flex min-h-11 items-center md:min-h-7"
        >
          <Chip className="gap-1 group-hover:bg-line">
            {tag}
            <X size={10} aria-hidden="true" className="text-muted" />
          </Chip>
        </button>
      ))}
      {tags.length < MAX_TAGS &&
        (editing ? (
          <input
            autoFocus
            value={text}
            maxLength={MAX_TAG_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              commit();
              setEditing(false);
            }}
            aria-label="New tag"
            placeholder="tag"
            className="my-2.5 h-6 w-28 rounded-full border border-ink bg-surface px-2 font-mono text-label outline-none md:my-0.5"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            // Same width as the field it turns into, so closing the field never moves the
            // buttons below (a click on Save would otherwise land on empty space).
            className="inline-flex min-h-11 w-28 items-center md:min-h-7"
          >
            <span className="inline-flex h-5.5 items-center rounded-full bg-surface px-2 font-mono text-label text-muted hover:text-ink">
              + tag
            </span>
          </button>
        ))}
    </div>
  );
}
