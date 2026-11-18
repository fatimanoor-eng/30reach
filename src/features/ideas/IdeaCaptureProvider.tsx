import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useToast } from "../../components/toast-context";
import { isTyping } from "../../lib/is-typing";
import { CaptureContext, MAX_DRAFTS, type CaptureApi, type Draft } from "./capture-context";
import { compressImage, ImageCompressionError } from "./compress-image";
import { looksLikeUrl, normaliseUrl } from "./idea-rules";
import { flushImageDeletesOnExit, sweepImageDeletes } from "./pending-image-deletes";

const IDEAS_PATH = "/ideas";

/**
 * Capture for the idea board (14a). Holds the unsaved drafts so they survive moving between pages,
 * and listens for Ctrl/Cmd+V anywhere in the app:
 * • an image → a screenshot draft (compressed straight away)
 * • a link → a link draft
 * • other text → a note draft, only on the idea board (elsewhere a paste of plain text does nothing)
 * Ignored while typing in a field or while a dialog/sheet is open. Pasting outside the board opens it.
 */
export function IdeaCaptureProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const room = MAX_DRAFTS - drafts.length;
  const openBoard = useCallback(() => {
    if (pathname !== IDEAS_PATH) navigate(IDEAS_PATH);
  }, [pathname, navigate]);

  const prepend = useCallback((items: Draft[]) => {
    if (!items.length) return;
    setDrafts((d) => [...items, ...d]);
    setFocusKey(items[0].key);
  }, []);

  const tooMany = useCallback(
    () =>
      toast.show({
        title: `Up to ${MAX_DRAFTS} unsaved ideas at a time`,
        detail: "Save or discard some first.",
        pose: "error",
      }),
    [toast],
  );

  const addImages = useCallback<CaptureApi["addImages"]>(
    (files, how) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (!images.length) {
        if (files.length) toast.show({ title: "Only images can be added", pose: "error" });
        return;
      }
      const fit = images.slice(0, Math.max(0, room));
      if (fit.length < images.length) tooMany();
      const items: Draft[] = fit.map(() => ({
        key: crypto.randomUUID(),
        kind: "screenshot",
        label: how === "paste" ? "JUST PASTED" : "NEW SCREENSHOT",
        status: "compressing",
        link: "",
        note: "",
        tags: [],
      }));
      prepend(items);
      openBoard();
      if (how === "paste" && items.length)
        toast.show({ title: "Screenshot pasted from clipboard. Add a note and save." });

      items.forEach((item, i) => {
        compressImage(fit[i])
          .then(({ blob: image, width, height }) => {
            const previewUrl = URL.createObjectURL(image);
            setDrafts((d) => {
              if (!d.some((x) => x.key === item.key)) {
                URL.revokeObjectURL(previewUrl); // discarded while compressing
                return d;
              }
              return d.map((x) =>
                x.key === item.key
                  ? {
                      ...x,
                      status: "ready",
                      image,
                      imageWidth: width,
                      imageHeight: height,
                      previewUrl,
                    }
                  : x,
              );
            });
          })
          .catch((err: unknown) => {
            const message =
              err instanceof ImageCompressionError ? err.message : "Couldn't read that image.";
            setDrafts((d) =>
              d.map((x) => (x.key === item.key ? { ...x, status: "error", error: message } : x)),
            );
          });
      });
    },
    [room, prepend, openBoard, toast, tooMany],
  );

  const addLink = useCallback<CaptureApi["addLink"]>(
    (url = "", pasted = false) => {
      if (room <= 0) return tooMany();
      prepend([
        {
          key: crypto.randomUUID(),
          kind: "link",
          label: pasted ? "JUST PASTED" : "NEW LINK",
          status: "ready",
          link: url,
          note: "",
          tags: [],
        },
      ]);
      openBoard();
    },
    [room, prepend, openBoard, tooMany],
  );

  const addNote = useCallback<CaptureApi["addNote"]>(
    (text = "", pasted = false) => {
      if (room <= 0) return tooMany();
      prepend([
        {
          key: crypto.randomUUID(),
          kind: "note",
          label: pasted ? "JUST PASTED" : "NEW NOTE",
          status: "ready",
          link: "",
          note: text,
          tags: [],
        },
      ]);
      openBoard();
    },
    [room, prepend, openBoard, tooMany],
  );

  const update = useCallback<CaptureApi["update"]>((key, patch) => {
    setDrafts((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }, []);

  const remove = useCallback<CaptureApi["remove"]>((key) => {
    setDrafts((d) => {
      const gone = d.find((x) => x.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return d.filter((x) => x.key !== key);
    });
  }, []);

  // Ctrl/Cmd+V anywhere in the app.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]"))
        return;
      const data = e.clipboardData;
      if (!data) return;
      const files = [...data.files].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        addImages(files, "paste");
        return;
      }
      const text = data.getData("text/plain").trim();
      if (!text) return;
      if (looksLikeUrl(text)) {
        e.preventDefault();
        addLink(normaliseUrl(text) ?? text, true);
        toast.show({ title: "Link pasted. Add a note and save." });
      } else if (pathname === IDEAS_PATH) {
        e.preventDefault();
        addNote(text, true);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addImages, addLink, addNote, pathname, toast]);

  // Images of deleted ideas wait for their Undo toast to go (pending-image-deletes.ts): finish any
  // left from an earlier visit, and send this tab's pending ones if the page closes meanwhile.
  useEffect(() => {
    void sweepImageDeletes();
    window.addEventListener("pagehide", flushImageDeletesOnExit);
    return () => window.removeEventListener("pagehide", flushImageDeletesOnExit);
  }, []);

  // Free the preview images if the whole app unmounts (sign out).
  useEffect(
    () => () => draftsRef.current.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl)),
    [],
  );

  const api = useMemo<CaptureApi>(
    () => ({ drafts, focusKey, addImages, addLink, addNote, update, remove }),
    [drafts, focusKey, addImages, addLink, addNote, update, remove],
  );
  return <CaptureContext value={api}>{children}</CaptureContext>;
}
