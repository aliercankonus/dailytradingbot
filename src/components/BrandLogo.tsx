import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

export const BrandLogo = ({ size = "md", className, showText = true }: BrandLogoProps) => {
  const sizeMap = {
    sm: { icon: "h-7 w-7", text: "text-base" },
    md: { icon: "h-9 w-9", text: "text-xl" },
    lg: { icon: "h-14 w-14", text: "text-3xl" },
  };

  const s = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center p-1.5", s.icon)}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
          <path
            d="M3 18L9 10L14 14L21 5"
            stroke="hsl(var(--primary))"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M17 5H21V9"
            stroke="hsl(var(--primary))"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn("font-bold tracking-tight text-foreground", s.text)}>
          TradeFlow
        </span>
      )}
    </div>
  );
};
