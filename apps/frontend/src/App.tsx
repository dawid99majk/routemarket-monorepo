import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import { ROLES } from "./lib/auth";
import Index from "./pages/Index";
import { useGaPageview } from "./hooks/use-ga-pageview";

const GaTracker = () => {
  useGaPageview();
  return null;
};

// Lazy-loaded pages
const GlobeLab = lazy(() => import("./pages/GlobeLab"));
const MyRoutes = lazy(() => import("./pages/MyRoutes"));
const PlacePage = lazy(() => import("./pages/PlacePage"));
const Start = lazy(() => import('./pages/Start'));
const Discover = lazy(() => import("./pages/Discover"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Collections = lazy(() => import("./pages/Collections"));
const TripPlans = lazy(() => import("./pages/TripPlans"));
const RouteBuilderV2 = lazy(() => import("./pages/v2/RouteBuilderV2"));

function LegacyCreateRedirect() {
  const location = useLocation();
  return <Navigate to={`/route-builder-v2${location.search}`} replace />;
}
const UserProfile = lazy(() => import("./pages/UserProfile"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const AuthError = lazy(() => import("./pages/AuthError"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth"));
const Contact = lazy(() => import("./pages/Contact"));
const Brand = lazy(() => import("./pages/Brand"));
const AdminLayout = lazy(() => import("./components/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminAtlas = lazy(() => import("./pages/admin/AdminAtlas"));
const GuideHub = lazy(() => import("./components/GuideHub"));
const NavigationLauncher = lazy(() => import("./components/NavigationLauncher"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Cookies = lazy(() => import("./pages/legal/Cookies"));
const Refunds = lazy(() => import("./pages/legal/Refunds"));
const Documents = lazy(() => import("./pages/legal/Documents"));
const AcceptableUse = lazy(() => import("./pages/legal/AcceptableUse"));
const Copyright = lazy(() => import("./pages/legal/Copyright"));
const DSACompliance = lazy(() => import("./pages/legal/DSACompliance"));

const queryClient = new QueryClient();

const ALL_AUTHENTICATED = [ROLES.USER, ROLES.CREATOR, ROLES.ADMIN];
const CREATOR_AND_ADMIN = [ROLES.CREATOR, ROLES.ADMIN];

import { ErrorBoundary } from '@/components/ErrorBoundary';

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <GaTracker />
              <Suspense fallback={null}>
                <GuideHub />
                <NavigationLauncher />
              </Suspense>
              <Suspense fallback={null}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Index />} />
                  <Route path="/lab/globe" element={<GlobeLab />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/auth/error" element={<AuthError />} />
                  <Route path="/legal/terms" element={<Terms />} />
                  <Route path="/legal/privacy" element={<Privacy />} />
                  <Route path="/legal/cookies" element={<Cookies />} />
                  <Route path="/legal/refunds" element={<Refunds />} />
                  <Route path="/legal/documents" element={<Documents />} />
                  <Route path="/legal/acceptable-use" element={<AcceptableUse />} />
                  <Route path="/legal/copyright" element={<Copyright />} />
                  <Route path="/legal/dsa-compliance" element={<DSACompliance />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/brand" element={<Brand />} />

                  {/* Authenticated routes */}
                  <Route path="/kolekcje" element={<ProtectedRoute><Collections /></ProtectedRoute>} />
                  <Route path="/kolekcja/:slug" element={<ProtectedRoute><Collections /></ProtectedRoute>} />
                  <Route path="/start" element={<ProtectedRoute><Start /></ProtectedRoute>} />
                  <Route path="/odkrywaj" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
                  <Route path="/ulubione" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
                  <Route path="/miejsce/:slug" element={<ProtectedRoute><PlacePage /></ProtectedRoute>} />
                  <Route path="/my-routes" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><MyRoutes /></ProtectedRoute>} />
                  <Route path="/plany" element={<ProtectedRoute><TripPlans /></ProtectedRoute>} />
                  <Route path="/plany/:id" element={<ProtectedRoute><TripPlans /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><UserProfile /></ProtectedRoute>} />

                  {/* Creator routes */}
                  {/* Stary kreator formularzowy zastąpiony wywiadem w /route-builder-v2.
                      Przekierowanie zachowuje działanie starych linków, w tym ?projectId=. */}
                  <Route path="/create" element={<LegacyCreateRedirect />} />
                  <Route path="/route-builder-v2" element={<ProtectedRoute><RouteBuilderV2 /></ProtectedRoute>} />

                  {/* Admin routes */}
                  <Route path="/admin" element={<ProtectedAdminRoute><AdminLayout /></ProtectedAdminRoute>}>
                    <Route index element={<Navigate to="/admin/dashboard" replace />} />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="atlas" element={<AdminAtlas />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
