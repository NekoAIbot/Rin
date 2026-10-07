
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import ApiKeys from "./pages/ApiKeys";
import ApiAnalytics from "./pages/ApiAnalytics";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import Landing from "./pages/Landing";
import Demo from "./pages/Demo";
import Privacy from "./pages/Privacy";
import Security from "./pages/Security";
import AdminMetrics from "./pages/AdminMetrics";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="h-screen flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/" element={<Landing />} />
                <Route path="/demo" element={<Demo />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/security" element={<Security />} />
                <Route path="/admin/metrics" element={
                  <ProtectedRoute><AdminMetrics /></ProtectedRoute>
                } />
                <Route path="/app" element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } />
                {/* Legacy surfaces now live inside the five primary areas of /app */}
                {["/settings", "/chat", "/weather", "/search", "/code", "/web",
                  "/multimodal", "/personas", "/reports", "/workspace", "/memory",
                  "/automations", "/dashboard", "/index", "/home"].map((path) => (
                  <Route key={path} path={path} element={<Navigate to="/app" replace />} />
                ))}

                <Route path="/profile" element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                } />
                <Route path="/api-keys" element={
                  <ProtectedRoute>
                    <ApiKeys />
                  </ProtectedRoute>
                } />
                <Route path="/api-analytics" element={
                  <ProtectedRoute>
                    <ApiAnalytics />
                  </ProtectedRoute>
                } />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/billing" element={
                  <ProtectedRoute>
                    <Billing />
                  </ProtectedRoute>
                } />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
