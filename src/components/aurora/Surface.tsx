import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Aurora material primitives — shared across every surface so Workspace,
 * Memory, Automations and Settings read as one adaptive environment.
 */

export function Panel({
  className,
  material = "paper",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { material?: "paper" | "glass" | "sunk" }) {
  return (
    <div
      className={cn(
        "rounded-[1.5rem] p-5 transition-all duration-300",
        material === "paper" && "surface-paper",
        material === "glass" && "surface-glass",
        material === "sunk" && "surface-sunk border border-border/40",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SurfaceHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="animate-rise-in flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
        )}
        <h1 className="mt-1 font-display text-[30px] leading-[1.1] tracking-tight sm:text-[36px]">
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  );
}

export interface SegmentItem {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function Segmented({
  items,
  value,
  onChange,
  className,
}: {
  items: SegmentItem[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "surface-glass inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-300",
              active
                ? "bg-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function AmbientBackdrop({ tone = "forest" }: { tone?: "forest" | "gold" | "sage" }) {
  const color = tone === "gold" ? "--gold" : tone === "sage" ? "--sage" : "--forest";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 transition-opacity duration-1000"
      style={{
        background: `radial-gradient(80% 100% at 50% -20%, hsl(var(${color}) / 0.18), transparent 70%)`,
      }}
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Panel material="sunk" className="animate-rise-in py-12 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/70" />
      <p className="mt-3 font-display text-lg">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Panel>
  );
}
