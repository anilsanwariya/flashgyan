// A card's picture: its page in a small frame, as the channel will see it.
import { useEffect, useMemo, useRef, useState } from "react";
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
  /** Pixels, or "fill" for the width of its box (a grid cell on a phone). */
  width?: number | "fill";
}) {
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(170);
  useEffect(() => {
    const el = box.current;
    if (width !== "fill" || !el) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width || 170));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
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
  const fill = width === "fill";
  const scale = (fill ? boxWidth : width) / 1080;
  return (
    <div
      ref={box}
      className={`overflow-hidden rounded-lg border border-border bg-muted shadow-sm ${fill ? "w-full" : "shrink-0"}`}
      style={fill ? { aspectRatio: "9 / 16" } : { width, height: 1920 * scale }}
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
