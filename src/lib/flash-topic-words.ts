// A topic's word list from the server (see flash-words), read again when
// the topic's cards change.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { flashTopicWords } from "@/lib/flash-studio.functions";
import type { FlashTopic } from "@/lib/flash-studio";

export function useTopicWords(topic: FlashTopic) {
  const wordsFn = useServerFn(flashTopicWords);
  return useQuery({
    // Read again when the topic's cards change.
    queryKey: ["flashTopicWords", topic.id, topic.updated_at],
    queryFn: () => wordsFn({ data: { topic_id: topic.id } }),
    staleTime: 60_000,
    retry: false,
  });
}
