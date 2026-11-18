import { ClipboardPaste, ImageIcon, Link2, StickyNote } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { useToast } from "../../components/toast-context";
import { useCapture } from "./capture-context";
import { looksLikeUrl, normaliseUrl } from "./idea-rules";

function Option({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-13 w-full items-center gap-3 rounded-control px-3 text-left text-body font-medium hover:bg-bg"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-bg">
          {icon}
        </span>
        {children}
      </button>
    </li>
  );
}

/**
 * M09 "+" sheet: Paste screenshot · Choose from photos · Add link · Write a note.
 * On phones the photo picker replaces drag and drop.
 */
export function AddIdeaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addImages, addLink, addNote } = useCapture();
  const toast = useToast();
  const photos = useRef<HTMLInputElement>(null);

  /** Reads the clipboard (the browser may ask first). An image wins; a link is next. */
  async function pasteFromClipboard() {
    onClose();
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (type) {
            const blob = await item.getType(type);
            addImages([new File([blob], "clipboard", { type })], "paste");
            return;
          }
        }
      }
      const text = (await navigator.clipboard?.readText?.())?.trim() ?? "";
      if (looksLikeUrl(text)) {
        addLink(normaliseUrl(text) ?? text, true);
        return;
      }
      toast.show({
        title: "No screenshot on the clipboard",
        detail: "Copy a screenshot first, or choose one from your photos.",
        pose: "idle",
      });
    } catch {
      toast.show({
        title: "Couldn't read the clipboard",
        detail: "Allow clipboard access, or choose the screenshot from your photos.",
        pose: "error",
      });
    }
  }

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Add an idea">
        <ul className="-mx-2 flex flex-col gap-1">
          <Option
            icon={<ClipboardPaste size={18} aria-hidden="true" />}
            onClick={pasteFromClipboard}
          >
            Paste screenshot
          </Option>
          <Option
            icon={<ImageIcon size={18} aria-hidden="true" />}
            onClick={() => {
              photos.current?.click(); // must run inside the tap, before the sheet closes
              onClose();
            }}
          >
            Choose from photos
          </Option>
          <Option
            icon={<Link2 size={18} aria-hidden="true" />}
            onClick={() => {
              onClose();
              addLink();
            }}
          >
            Add link
          </Option>
          <Option
            icon={<StickyNote size={18} aria-hidden="true" />}
            onClick={() => {
              onClose();
              addNote();
            }}
          >
            Write a note
          </Option>
        </ul>
      </BottomSheet>
      <input
        ref={photos}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addImages([...(e.target.files ?? [])], "pick");
          e.target.value = "";
        }}
      />
    </>
  );
}
