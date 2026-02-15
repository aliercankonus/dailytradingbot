import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogOut, Menu, LayoutDashboard, BarChart3, Coins, HeartPulse, Settings } from "lucide-react";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Analytics", to: "/performance", icon: BarChart3 },
  { label: "Markets", to: "/symbols", icon: Coins },
  { label: "System", to: "/health", icon: HeartPulse },
  { label: "Settings", to: "/settings", icon: Settings },
];

export const AppHeader = () => {
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const getInitials = (email: string) => email.substring(0, 2).toUpperCase();

  const navLinkClasses =
    "px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/60";
  const activeClasses = "text-foreground bg-secondary";

  return (
    <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Brand + Nav */}
          <div className="flex items-center gap-6">
            <BrandLogo size="sm" showText={!isMobile} />

            {/* Desktop nav */}
            {!isMobile && (
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={navLinkClasses}
                    activeClassName={activeClasses}
                  >
                    <item.icon className="h-4 w-4 mr-1.5" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>

          {/* Right: Status + Avatar + Mobile Menu */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-muted-foreground">Connected</span>
            </div>

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        {getInitials(user.email || "U")}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">Account</p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Mobile hamburger */}
            {isMobile && (
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64 bg-card border-border">
                  <div className="mt-6 flex flex-col gap-1">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === "/"}
                        className="px-4 py-3 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex items-center gap-2"
                        activeClassName="text-foreground bg-secondary"
                        onClick={() => setSheetOpen(false)}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </div>
      {/* Bottom glow divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </header>
  );
};
