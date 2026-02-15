import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

export const BrandLogo = ({ size = "md", className, showText = true }: BrandLogoProps) => {
  const sizeMap = {
    sm: { icon: "h-6 w-6", text: "text-sm" },
    md: { icon: "h-8 w-8", text: "text-lg" },
    lg: { icon: "h-12 w-12", text: "text-2xl" },
  };

  const s = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("rounded-md bg-primary/10 border border-primary/15 flex items-center justify-center p-1", s.icon)}>
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
        <span className={cn("font-semibold tracking-tight text-foreground", s.text)}>
          TradeFlow
        </span>
      )}
    </div>
  );
};
