// A card's picture: its page in a small frame, as the channel will see it.
import { useMemo } from "react";
import { igCardHtml, type IgCard, type IgDesign } from "@/lib/ig-cards";
import { channelLabel, type IgSettings } from "@/lib/ig-words";

const site = () => (typeof window === "undefined" ? "" : window.location.origin);

export function CardPreview({
  card,
  design,
  n,
  total,
  date,
  settings,
  width = 270,
}: {
  card: IgCard;
  design: IgDesign;
  n: number;
  total: number;
  date: string;
  settings: Pick<IgSettings, "channel" | "watermark">;
  width?: number;
}) {
  const html = useMemo(
    () =>
      igCardHtml(card, {
        design,
        n,
        total,
        date,
        channel: channelLabel(settings.channel),
        assetBase: site(),
        watermark: settings.watermark,
      }),
    [card, design, n, total, date, settings.channel, settings.watermark],
  );
  const scale = width / 1080;
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg border border-border bg-muted shadow-sm"
      style={{ width, height: 1920 * scale }}
    >
      <iframe
        title={`Card ${n}: ${card.word}`}
        srcDoc={html}
        sandbox="allow-scripts"
        className="pointer-events-none origin-top-left border-0"
        style={{ width: 1080, height: 1920, transform: `scale(${scale})` }}
      />
    </div>
  );
}
