// Small drawings of each cover layout, for the pickers: the shape of the
// page at a glance (colour blocks, photo frames, lines of text), not the
// real cover. The live preview shows the real one.
import type { ReactNode } from "react";

// Colours: the accent (currentColor), photos, white panels, text lines.
const PH = "#94a3b8";
const BG = "#475569";
const LINE = "#cbd5e1";
const W = "#fff";

const lines = (x: number, y: number, w: number, n: number, gap = 2.2) =>
  Array.from({ length: n }, (_, i) => (
    <rect
      key={i}
      x={x}
      y={y + i * gap}
      width={i === n - 1 ? w * 0.6 : w}
      height={0.9}
      rx={0.4}
      fill={LINE}
    />
  ));

const SKETCHES: Record<string, ReactNode> = {
  // ---------- daily ----------
  "daily-classic": (
    <>
      <rect x={3} y={4} width={24} height={11} rx={2} fill="currentColor" />
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <rect
            key={`${r}${c}`}
            x={3 + c * 12.5}
            y={17 + r * 5}
            width={11.5}
            height={4}
            rx={0.8}
            fill={W}
            stroke={LINE}
            strokeWidth={0.4}
          />
        )),
      )}
      {lines(3, 28, 24, 3)}
      <rect x={3} y={35} width={24} height={2.4} rx={0.8} fill={LINE} />
      <rect x={3} y={38.6} width={24} height={2} rx={0.8} fill="currentColor" opacity={0.7} />
    </>
  ),
  "daily-band": (
    <>
      <rect x={0} y={0} width={10} height={42} fill="currentColor" />
      <rect x={2} y={8} width={6} height={1.4} rx={0.5} fill={W} />
      <rect x={2} y={10.5} width={5} height={1.4} rx={0.5} fill={W} />
      {lines(12, 5, 15, 6, 2.6)}
      {lines(12, 23, 15, 5, 2.4)}
      <rect x={12} y={37} width={15} height={2.4} rx={0.8} fill={LINE} />
    </>
  ),
  "daily-lead": (
    <>
      <rect x={3} y={4} width={24} height={6} rx={1.5} fill="currentColor" />
      <rect x={3} y={12} width={24} height={9} rx={1} fill="#f1f5f9" />
      <rect x={3} y={12} width={1.2} height={9} fill="currentColor" />
      {lines(6, 14, 19, 3)}
      {[0, 1, 2].map((c) => (
        <rect
          key={c}
          x={3 + c * 8.2}
          y={23}
          width={7.4}
          height={4}
          rx={0.8}
          fill={W}
          stroke={LINE}
          strokeWidth={0.4}
        />
      ))}
      {lines(3, 30, 24, 3)}
      <rect x={3} y={37.5} width={24} height={2.2} rx={0.8} fill={LINE} />
    </>
  ),
  "daily-split": (
    <>
      <rect x={0} y={4} width={30} height={15} fill="currentColor" />
      <rect x={3} y={8} width={14} height={2} rx={0.6} fill={W} />
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <rect
            key={`${r}${c}`}
            x={3 + c * 12.5}
            y={21 + r * 5}
            width={11.5}
            height={4}
            rx={0.8}
            fill={W}
            stroke={LINE}
            strokeWidth={0.4}
          />
        )),
      )}
      {lines(3, 32, 24, 2)}
      <rect x={3} y={37.5} width={24} height={2.2} rx={0.8} fill={LINE} />
    </>
  ),
  "daily-light": (
    <>
      <rect x={3} y={4} width={24} height={0.9} fill="currentColor" />
      <rect x={3} y={7} width={18} height={2.4} rx={0.6} fill="currentColor" opacity={0.85} />
      <rect
        x={3}
        y={11}
        width={8}
        height={1.8}
        rx={0.9}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.4}
      />
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <g key={`${r}${c}`}>
            <rect
              x={3 + c * 12.5}
              y={16 + r * 5}
              width={11.5}
              height={4}
              rx={0.8}
              fill={W}
              stroke={LINE}
              strokeWidth={0.4}
            />
            <rect x={3 + c * 12.5} y={16 + r * 5} width={0.6} height={4} fill="currentColor" />
          </g>
        )),
      )}
      {lines(3, 27, 24, 3)}
      <rect
        x={3}
        y={35}
        width={24}
        height={2.4}
        rx={0.8}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.4}
      />
    </>
  ),
  // ---------- monthly ----------
  "monthly-classic": (
    <>
      <rect x={0} y={0} width={30} height={42} fill={BG} />
      <rect x={3} y={4} width={24} height={11} rx={2} fill="currentColor" />
      <rect x={3} y={17} width={24} height={19} rx={1.5} fill={W} />
      {lines(5, 19, 20, 6, 2.6)}
      <rect x={3} y={38} width={24} height={2} rx={0.8} fill="currentColor" opacity={0.7} />
    </>
  ),
  "monthly-story": (
    <>
      <rect x={0} y={0} width={30} height={42} fill={PH} />
      <rect x={0} y={26} width={30} height={16} fill="#1e293b" opacity={0.75} />
      <rect x={4} y={3} width={22} height={3.2} rx={0.6} fill={W} />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={2}
          y={10 + i * 4}
          width={9}
          height={2.6}
          rx={0.4}
          fill="#1e293b"
          opacity={0.8}
        />
      ))}
      <rect x={3} y={28} width={7} height={1.6} rx={0.4} fill="#f59e0b" />
      <rect x={3} y={31} width={24} height={2} rx={0.5} fill={W} />
      <rect x={3} y={34} width={18} height={2} rx={0.5} fill={W} />
    </>
  ),
  "monthly-mosaic": (
    <>
      <rect x={3} y={3} width={24} height={7} rx={1.5} fill="currentColor" />
      {[0, 1].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}${c}`}
            x={3 + c * 8.2}
            y={12 + r * 7.5}
            width={7.4}
            height={6.8}
            rx={0.6}
            fill={PH}
            stroke={W}
            strokeWidth={0.6}
          />
        )),
      )}
      <rect x={3} y={28} width={24} height={10} rx={1.5} fill={W} stroke={LINE} strokeWidth={0.4} />
      {lines(5, 30, 20, 3)}
    </>
  ),
  "monthly-polaroid": (
    <>
      <rect x={0} y={0} width={30} height={42} fill={BG} />
      <rect x={3} y={3} width={18} height={2.6} rx={0.6} fill={W} />
      <g transform="rotate(-8 8 18)">
        <rect x={2} y={11} width={11} height={13} fill={W} />
        <rect x={3} y={12} width={9} height={8.5} fill={PH} />
      </g>
      <g transform="rotate(5 16 16)">
        <rect x={10} y={9} width={11} height={13} fill={W} />
        <rect x={11} y={10} width={9} height={8.5} fill="#cbd5e1" />
      </g>
      <g transform="rotate(-3 23 19)">
        <rect x={18} y={13} width={11} height={13} fill={W} />
        <rect x={19} y={14} width={9} height={8.5} fill={PH} />
      </g>
      <rect x={3} y={30} width={24} height={9} rx={1.5} fill={W} />
      {lines(5, 32, 20, 3)}
    </>
  ),
  "monthly-month": (
    <>
      <rect x={0} y={0} width={30} height={42} fill="currentColor" />
      <rect x={3} y={5} width={10} height={1.4} rx={0.4} fill={W} opacity={0.8} />
      <rect x={3} y={8} width={24} height={6} rx={0.6} fill={W} />
      <rect
        x={3}
        y={15.5}
        width={12}
        height={3.5}
        rx={0.6}
        fill="none"
        stroke={W}
        strokeWidth={0.5}
      />
      <rect x={3} y={21} width={7} height={1.6} rx={0.4} fill="#f59e0b" />
      <rect x={3} y={24} width={20} height={1.6} rx={0.4} fill={W} opacity={0.85} />
      <rect x={3} y={28} width={24} height={11} rx={1.5} fill={W} />
      {lines(5, 30, 20, 4)}
    </>
  ),
  "monthly-journal": (
    <>
      <rect x={0} y={0} width={30} height={42} fill="#fbf8f1" />
      <rect x={1.5} y={1.5} width={27} height={39} fill="none" stroke="#b45309" strokeWidth={0.5} />
      <rect
        x={2.3}
        y={2.3}
        width={25.4}
        height={37.4}
        fill="none"
        stroke="#b45309"
        strokeWidth={0.3}
      />
      <rect x={6} y={5} width={18} height={2.4} rx={0.5} fill="currentColor" />
      <rect x={9} y={8.4} width={12} height={0.9} rx={0.4} fill="#b45309" />
      <rect x={6} y={11} width={18} height={12} fill={W} stroke="currentColor" strokeWidth={0.6} />
      <rect x={7.2} y={12.2} width={15.6} height={9.6} fill={PH} />
      <rect x={6} y={25} width={18} height={1.8} rx={0.5} fill="#1c1917" />
      <rect x={8} y={27.5} width={14} height={1.8} rx={0.5} fill="#1c1917" />
      {lines(5, 31.5, 9, 3)}
      {lines(16, 31.5, 9, 3)}
    </>
  ),
  "monthly-sidebar": (
    <>
      <rect x={0} y={0} width={11} height={42} fill="currentColor" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={2} y={5 + i * 3.4} width={7} height={1} rx={0.4} fill={W} opacity={0.85} />
      ))}
      <rect x={13} y={4} width={14} height={2.4} rx={0.5} fill="currentColor" opacity={0.85} />
      <rect x={13} y={9} width={14} height={20} rx={1} fill={PH} />
      <rect x={13} y={31} width={14} height={1.8} rx={0.5} fill="#1f2937" />
      <rect x={13} y={35} width={14} height={2.4} rx={0.8} fill={LINE} />
    </>
  ),
  "monthly-faces": (
    <>
      <rect x={3} y={3} width={24} height={7} rx={1.5} fill="currentColor" />
      {[0, 1].map((r) =>
        [0, 1, 2].map((c) => (
          <g key={`${r}${c}`}>
            <circle
              cx={7 + c * 8}
              cy={15.5 + r * 8}
              r={3.2}
              fill={PH}
              stroke="#f59e0b"
              strokeWidth={0.6}
            />
            <rect x={5 + c * 8} y={19.5 + r * 8} width={4} height={0.8} rx={0.3} fill={LINE} />
          </g>
        )),
      )}
      <rect x={3} y={30} width={24} height={9} rx={1.5} fill={W} stroke={LINE} strokeWidth={0.4} />
      {lines(5, 32, 20, 3)}
    </>
  ),
  "monthly-rajasthan": (
    <>
      <rect x={3} y={3} width={16} height={2.6} rx={0.6} fill="currentColor" />
      <rect x={3} y={8} width={24} height={13} rx={1} fill={PH} />
      <rect x={3} y={23} width={24} height={11} rx={1.5} fill="currentColor" opacity={0.85} />
      {Array.from({ length: 4 }, (_, i) => (
        <g key={i}>
          <circle cx={5.5} cy={26 + i * 2.2} r={0.5} fill={W} />
          <rect x={7} y={25.6 + i * 2.2} width={17} height={0.9} rx={0.4} fill={W} opacity={0.85} />
        </g>
      ))}
      <rect x={3} y={36} width={24} height={2.6} rx={0.8} fill={LINE} />
    </>
  ),
  "monthly-exam": (
    <>
      <rect x={0} y={0} width={30} height={42} fill="currentColor" />
      <rect x={3} y={3} width={20} height={3} rx={0.6} fill={W} />
      <rect x={-2} y={9} width={34} height={3} fill="#f59e0b" transform="rotate(-3 15 10)" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={5.5} cy={17 + i * 5.2} r={2.3} fill="#f59e0b" />
      ))}
      <rect x={10} y={14.5} width={17} height={7} rx={0.6} fill={PH} stroke={W} strokeWidth={0.6} />
      <rect
        x={10}
        y={22.5}
        width={8}
        height={6}
        rx={0.6}
        fill="#cbd5e1"
        stroke={W}
        strokeWidth={0.6}
      />
      <rect x={19} y={22.5} width={8} height={6} rx={0.6} fill={PH} stroke={W} strokeWidth={0.6} />
      <rect x={3} y={31} width={24} height={8} rx={1.5} fill={W} />
      {lines(5, 33, 20, 2)}
    </>
  ),
};

export function CoverSketch({
  kind,
  id,
  className = "",
}: {
  kind: "daily" | "monthly";
  id: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 30 42"
      aria-hidden="true"
      className={`rounded-sm border border-border bg-white text-primary ${className}`}
    >
      {SKETCHES[`${kind}-${id}`] ?? SKETCHES[`${kind}-classic`]}
    </svg>
  );
}

// A grid of layouts drawn small, the chosen one outlined; its description
// shows below.
export function SketchPicker<T extends string>({
  kind,
  label,
  options,
  value,
  onChange,
}: {
  kind: "daily" | "monthly";
  label: string;
  options: readonly { id: T; name: string; hint: string }[];
  value: string;
  onChange: (id: T) => void;
}) {
  const chosen = options.find((o) => o.id === value);
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            title={o.hint}
            onClick={() => onChange(o.id)}
            className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors ${value === o.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
          >
            <CoverSketch kind={kind} id={o.id} className="h-16 w-auto" />
            <span className="text-xs font-medium leading-tight">{o.name}</span>
          </button>
        ))}
      </div>
      {chosen && <p className="text-xs text-muted-foreground">{chosen.hint}</p>}
    </div>
  );
}
