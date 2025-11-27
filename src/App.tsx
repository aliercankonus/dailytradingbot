import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { WebSocketMonitorProvider } from "@/contexts/WebSocketMonitorContext";
import { RealtimePricesProvider } from "@/contexts/RealtimePricesContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Strategies from "./pages/Strategies";
import StrategyBuilder from "./pages/StrategyBuilder";
import Symbols from "./pages/Symbols";
import Performance from "./pages/Performance";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WebSocketMonitorProvider>
            <RealtimePricesProvider>
              <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/symbols" element={<ProtectedRoute><Symbols /></ProtectedRoute>} />
              <Route path="/strategies" element={<ProtectedRoute><Strategies /></ProtectedRoute>} />
              <Route path="/strategies/new" element={<ProtectedRoute><StrategyBuilder /></ProtectedRoute>} />
              <Route path="/strategies/edit/:id" element={<ProtectedRoute><StrategyBuilder /></ProtectedRoute>} />
              <Route path="/performance" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
              </Routes>
            </RealtimePricesProvider>
          </WebSocketMonitorProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
