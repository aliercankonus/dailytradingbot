import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";
import { useNavigate } from "react-router-dom";
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
import { LogOut, Menu, LayoutDashboard, BarChart3, Coins, HeartPulse, Settings, User, Bell } from "lucide-react";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link } from "react-router-dom";
import { useRiskParameters } from "@/hooks/useRiskParameters";
import { SystemStatusStrip } from "@/components/SystemStatusStrip";

const navItems = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Analytics", to: "/performance", icon: BarChart3 },
  { label: "Markets", to: "/symbols", icon: Coins },
  { label: "System", to: "/health", icon: HeartPulse },
];

export const AppHeader = () => {
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const getInitials = (email: string) => email.substring(0, 2).toUpperCase();

  const navLinkClasses =
    "px-3 py-2 text-[13px] font-medium transition-colors text-muted-foreground hover:text-foreground flex items-center gap-1.5 relative";
  const activeClasses = "text-foreground font-semibold";

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
      {/* System Status Strip */}
      <SystemStatusStrip />
      
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Brand + Nav */}
          <div className="flex items-center gap-5">
            <Link to="/" className="flex items-center shrink-0 hover:opacity-80 transition-opacity">
              <BrandLogo size="sm" showText />
            </Link>

            {/* Desktop nav — flat underline style */}
            {!isMobile && (
              <nav className="flex items-center">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={navLinkClasses}
                    activeClassName={activeClasses}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2">
            {user && (
              <div className="flex items-center gap-2">
                {!isMobile && (
                  <span className="text-xs text-muted-foreground">
                    {user.email?.split('@')[0] || 'Trader'}
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-7 w-7 rounded-full p-0">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-secondary text-muted-foreground text-[10px] font-semibold">
                          {getInitials(user.email || "U")}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-52" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-xs font-medium leading-none">Account</p>
                        <p className="text-[10px] leading-none text-muted-foreground">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer text-xs">
                      <User className="mr-2 h-3.5 w-3.5" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/notifications')} className="cursor-pointer text-xs">
                      <Bell className="mr-2 h-3.5 w-3.5" />
                      <span>Notifications</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer text-xs">
                      <Settings className="mr-2 h-3.5 w-3.5" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="cursor-pointer text-xs">
                      <LogOut className="mr-2 h-3.5 w-3.5" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {isMobile && (
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-56 bg-card border-border">
                  <div className="mt-6 flex flex-col gap-0.5">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === "/"}
                        className="px-3 py-2.5 text-sm font-medium transition-all text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex items-center gap-2.5"
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
    </header>
  );
};
