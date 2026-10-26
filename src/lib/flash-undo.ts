// Undo after an action on cards: a message with an Undo button that puts
// the cards back as they were (their text and marks), and deleted cards
// back from the bin.
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { restoreFlashStates, restoreFlashTrash } from "@/lib/flash-studio.functions";
import type { FlashCard } from "@/lib/flash-studio";

const stateOf = (c: FlashCard) => ({
  id: c.id,
  front: c.front,
  back: c.back,
  ex: c.ex,
  own: c.own,
  verified: c.verified,
  error: c.error,
  error_type: c.error_type,
  note: c.note,
  ai: c.ai,
  removed: c.removed,
});

export function useUndo(topicId: string, onCards: (c: FlashCard[]) => void, onChanged: () => void) {
  const statesFn = useServerFn(restoreFlashStates);
  const trashFn = useServerFn(restoreFlashTrash);
  // `before`: the cards as they were; `deleted`: ids now in the bin.
  return (message: string, undo: { before?: FlashCard[]; deleted?: string[] }) =>
    toast.success(message, {
      duration: 15_000,
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            if (undo.deleted?.length)
              await trashFn({ data: { topic_id: topicId, ids: undo.deleted } });
            if (undo.before?.length) {
              const r = await statesFn({
                data: { topic_id: topicId, states: undo.before.map(stateOf) },
              });
              onCards(r.cards);
            }
            onChanged();
            toast.success("Undone");
          } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : "Couldn't undo");
          }
        },
      },
    });
}
