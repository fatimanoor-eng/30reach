import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../lib/useClient";
import type { CalendarCard } from "./calendar-ui";

// `creator:profiles(full_name)` follows created_by → profiles (the team can read profiles). It's a
// many-to-one link, so PostgREST returns one object; without generated types supabase-js guesses an
// array, hence the `as unknown as` casts below.
const COLUMNS =
  "id, date, platform, format, title, hook, caption, visual_idea, status, origin, idea_id, updated_at, compliance_status, compliance_notes, creator:profiles(full_name)";

export type CardFields = Pick<
  CalendarCard,
  "date" | "platform" | "format" | "title" | "hook" | "caption" | "visual_idea" | "status"
>;

export const cardsKey = (clientId: string | undefined, from: string, to: string): QueryKey => [
  "calendar_cards",
  clientId,
  from,
  to,
];

/** The client's cards between two days (inclusive). RLS: the team has full access. */
export function useCalendarCards(from: string, to: string) {
  const client = useClient();
  const clientId = client.data?.id;
  return useQuery({
    queryKey: cardsKey(clientId, from, to),
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_cards")
        .select(COLUMNS)
        .eq("client_id", clientId!)
        .gte("date", from)
        .lte("date", to)
        .order("date")
        .order("title");
      if (error) throw error;
      return (data ?? []) as unknown as CalendarCard[];
    },
  });
}

/** One card by id (the drawer can open on a card outside the month on screen, e.g. a shared link). */
export function useCalendarCard(id: string | null) {
  return useQuery({
    queryKey: ["calendar_cards", "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_cards")
        .select(COLUMNS)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CalendarCard | null) ?? null;
    },
  });
}

/** Insert (id = null, origin 'manual') or update; returns the saved row. */
export async function saveCard(
  clientId: string,
  id: string | null,
  fields: CardFields,
): Promise<CalendarCard> {
  const query = id
    ? supabase.from("calendar_cards").update(fields).eq("id", id)
    : supabase.from("calendar_cards").insert({ client_id: clientId, origin: "manual", ...fields });
  const { data, error } = await query.select(COLUMNS).single();
  if (error) throw error;
  return data as unknown as CalendarCard;
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from("calendar_cards").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Drag a card to another day. The card moves on screen straight away and moves back if the save
 * fails (`onError` lets the page show a toast).
 */
export function useMoveCard(listKey: QueryKey, onError: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("calendar_cards").update({ date }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, date }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const before = queryClient.getQueryData<CalendarCard[]>(listKey);
      queryClient.setQueryData<CalendarCard[]>(listKey, (cards) =>
        cards?.map((c) => (c.id === id ? { ...c, date } : c)),
      );
      return { before };
    },
    onError: (_err, _vars, context) => {
      if (context?.before) queryClient.setQueryData(listKey, context.before);
      onError();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["calendar_cards"] }),
  });
}
