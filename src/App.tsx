import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { WebSocketMonitorProvider } from "@/contexts/WebSocketMonitorContext";
import { RealtimePricesProvider } from "@/contexts/RealtimePricesContext";
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

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <BrandLogo size="lg" showText={false} className="logo-pulse" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WebSocketMonitorProvider>
            <RealtimePricesProvider>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                <Route path="/auth" element={<div className="animate-fade-in"><Auth /></div>} />
                <Route path="/" element={<ProtectedRoute><div className="animate-fade-in"><Index /></div></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><div className="animate-fade-in"><Settings /></div></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><div className="animate-fade-in"><Profile /></div></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><div className="animate-fade-in"><Notifications /></div></ProtectedRoute>} />
                <Route path="/symbols" element={<ProtectedRoute><div className="animate-fade-in"><Symbols /></div></ProtectedRoute>} />
                
                <Route path="/performance" element={<ProtectedRoute><div className="animate-fade-in"><Performance /></div></ProtectedRoute>} />
                <Route path="/health" element={<ProtectedRoute><div className="animate-fade-in"><Health /></div></ProtectedRoute>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<div className="animate-fade-in"><NotFound /></div>} />
                </Routes>
              </Suspense>
            </RealtimePricesProvider>
          </WebSocketMonitorProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;