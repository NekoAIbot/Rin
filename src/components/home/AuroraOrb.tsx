import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface AuroraOrbProps {
  state?: OrbState;
  size?: number;
  className?: string;
}

/**
 * Aurora's signature presence mark. A glass sphere with a forest glow,
 * soft breathing pulse and orbiting particles. Purely presentational.
 */
export function AuroraOrb({ state = "idle", size = 56, className }: AuroraOrbProps) {
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* outer glow */}
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-xl opacity-60",
          state === "listening" && "opacity-90",
        )}
        style={{
          background:
            "radial-gradient(circle at 35% 30%, hsl(var(--accent) / 0.7), hsl(var(--primary) / 0.55) 60%, transparent 72%)",
        }}
      />
      {/* sphere */}
      <div
        className={cn(
          "absolute inset-0 rounded-full border border-foreground/10 backdrop-blur-md",
          state === "idle" && "animate-orb-breathe",
          state === "listening" && "animate-orb-listen",
          state === "thinking" && "animate-orb-think",
          state === "speaking" && "animate-orb-listen",
        )}
        style={{
          background:
            "radial-gradient(circle at 32% 26%, hsl(var(--ivory) / 0.85), hsl(var(--sage) / 0.55) 42%, hsl(var(--forest) / 0.9) 100%)",
          boxShadow:
            "inset 0 1px 6px hsl(var(--ivory) / 0.6), inset 0 -8px 18px hsl(var(--forest) / 0.5), var(--shadow-lift)",
        }}
      />
      {/* specular highlight */}
      <div
        className="absolute rounded-full bg-white/70 blur-[2px]"
        style={{ width: size * 0.16, height: size * 0.11, left: size * 0.26, top: size * 0.2 }}
      />
      {/* orbiting particles */}
      <div className="absolute inset-0 animate-orb-orbit">
        <span className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 rounded-full bg-accent/90" />
        <span className="absolute bottom-[8%] left-[14%] h-[3px] w-[3px] rounded-full bg-primary/70" />
      </div>
    </div>
  );
}
