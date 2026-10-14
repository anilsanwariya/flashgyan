// Background answer jobs have a shorter deadline than the edge worker lifetime.
// Aborting prevents a late model response from sending a second reply.
export async function runTelegramAnswerJob(options: {
  process: (signal: AbortSignal) => Promise<void>;
  onFailure: (timedOut: boolean) => Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Telegram answer deadline exceeded"));
    }, options.timeoutMs ?? 75_000);
  });
  try {
    await Promise.race([options.process(controller.signal), deadline]);
  } catch {
    const timedOut = controller.signal.aborted;
    controller.abort();
    await options.onFailure(timedOut);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}