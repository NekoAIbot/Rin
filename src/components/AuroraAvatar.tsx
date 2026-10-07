
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AuroraAvatarProps {
  isActive?: boolean;
  isListening?: boolean;
  isThinking?: boolean;
  size?: "sm" | "md" | "lg";
}

export function AuroraAvatar({ 
  isActive = false, 
  isListening = false,
  isThinking = false,
  size = "md" 
}: AuroraAvatarProps) {
  const [pulseColors, setPulseColors] = useState<string[]>([
    "bg-aurora-blue", 
    "bg-aurora-purple",
    "bg-aurora-pink"
  ]);

  // Rotate colors for visual effect
  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        setPulseColors(prev => {
          const newColors = [...prev];
          const firstColor = newColors.shift();
          if (firstColor) newColors.push(firstColor);
          return newColors;
        });
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isActive]);

  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  return (
    <div 
      className={cn(
        "relative rounded-full flex items-center justify-center transition-all duration-500",
        sizeClasses[size],
        isActive ? "animate-breathe" : "",
        "bg-gradient-aurora bg-300% animate-gradient-shift"
      )}
    >
      <div className="absolute inset-0.5 rounded-full bg-background dark:bg-card flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          {/* Aurora visual representation */}
          <div className={cn(
            "absolute w-6 h-6 rounded-full bg-gradient-aurora opacity-40",
            isActive ? "animate-pulse" : ""
          )} />
          
          <svg 
            viewBox="0 0 24 24" 
            className={cn(
              "w-8 h-8 z-10 fill-none stroke-current transition-opacity duration-300",
              isActive ? "opacity-100" : "opacity-70"
            )}
          >
            <circle cx="12" cy="12" r="5" strokeWidth="1.5" className="stroke-aurora-blue" />
            <path 
              d="M12 7V17M7 12H17" 
              strokeWidth="1.5" 
              strokeLinecap="round"
              className={cn(
                "stroke-aurora-pink transition-opacity",
                isThinking ? "opacity-100 animate-pulse" : "opacity-0"
              )}
            />
            <path 
              d="M9 9L15 15M9 15L15 9" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              className={cn(
                "stroke-aurora-purple transition-opacity",
                isListening ? "opacity-100" : "opacity-0"
              )}
            />
          </svg>
        </div>
      </div>
      
      {/* Status indicators */}
      {isActive && (
        <div className="absolute -bottom-1 flex space-x-1">
          {pulseColors.map((color, i) => (
            <div 
              key={i} 
              className={cn(
                "pulse-circle", 
                color, 
                i === 0 ? "animate-pulse" : i === 1 ? "animate-pulse delay-300" : "animate-pulse delay-600"
              )} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
