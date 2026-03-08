import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { WebSocketMonitorProvider } from "@/contexts/WebSocketMonitorContext";
import { RealtimePricesProvider } from "@/contexts/RealtimePricesContext";
import { RiskParametersProvider } from "@/contexts/RiskParametersContext";
import { SymbolsProvider } from "@/contexts/SymbolsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { BrandLogo } from "@/components/BrandLogo";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy load heavy pages
const Index = lazy(() => import("./pages/Index"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Symbols = lazy(() => import("./pages/Symbols"));
const Performance = lazy(() => import("./pages/Performance"));
const Health = lazy(() => import("./pages/Health"));
const Backtest = lazy(() => import("./pages/Backtest"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <BrandLogo size="lg" showText={false} className="logo-pulse" />
  </div>
);

const AnimatedRoutes = () => {
  const location = useLocation();

  // Prefetch secondary pages after initial render
  useEffect(() => {
    const timer = setTimeout(() => {
      import("./pages/Performance");
      import("./pages/Health");
      import("./pages/Settings");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div key={location.pathname} className="animate-fast-fade">
      <Suspense fallback={<PageFallback />}>
        <Routes location={location}>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/symbols" element={<ProtectedRoute><Symbols /></ProtectedRoute>} />
          <Route path="/performance" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
          <Route path="/health" element={<ProtectedRoute><Health /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WebSocketMonitorProvider>
            <RealtimePricesProvider>
              <RiskParametersProvider>
                <SymbolsProvider>
                  <AnimatedRoutes />
                </SymbolsProvider>
              </RiskParametersProvider>
            </RealtimePricesProvider>
          </WebSocketMonitorProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;