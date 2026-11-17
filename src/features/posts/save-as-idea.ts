import { useToast } from "../../components/toast-context";

/** "Save as idea" until the idea board exists (Slice 10). */
export function useSaveAsIdea() {
  const toast = useToast();
  return () =>
    toast.show({
      title: "Saving ideas arrives in Slice 10",
      detail: "For now, use Open post to see it on the platform.",
      pose: "idle",
    });
}
