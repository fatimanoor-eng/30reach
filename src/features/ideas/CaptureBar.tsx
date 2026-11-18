import { ImageIcon, Link2, StickyNote, Upload } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useCapture } from "./capture-context";

function Action({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-control bg-bg pr-3 pl-2.5 text-small font-medium hover:bg-soft"
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * 14b capture box (tablet/desktop): dashed while idle; a solid yellow outline while files are
 * dragged over the page or a draft is open (14a). Screenshot = choose image files.
 */
export function CaptureBar({ active }: { active: boolean }) {
  const { addImages, addLink, addNote } = useCapture();
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section
      aria-label="Add to the idea board"
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-surface px-5 py-4 ${
        active ? "border-2 border-flash" : "border-[1.5px] border-dashed border-line-dash"
      }`}
    >
      <Upload size={22} aria-hidden="true" className="shrink-0" />
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-body font-medium">
          Paste a screenshot or link, drop files, or type a note
        </p>
        <p className="text-small text-muted">
          Tip: press Ctrl/Cmd + V anywhere in 30reach to save to the board.
        </p>
      </div>
      <div className="flex gap-2">
        <Action
          icon={<ImageIcon size={16} aria-hidden="true" />}
          onClick={() => fileInput.current?.click()}
        >
          Screenshot
        </Action>
        <Action icon={<Link2 size={16} aria-hidden="true" />} onClick={() => addLink()}>
          Link
        </Action>
        <Action icon={<StickyNote size={16} aria-hidden="true" />} onClick={() => addNote()}>
          Note
        </Action>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addImages([...(e.target.files ?? [])], "pick");
          e.target.value = "";
        }}
      />
    </section>
  );
}
