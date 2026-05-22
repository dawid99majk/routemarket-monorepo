import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
const MapExplore = lazy(() => import("./pages/MapExplore"));
const GlobeLab = lazy(() => import("./pages/GlobeLab"));
const RouteDetail = lazy(() => import("./pages/RouteDetail"));
const CreateRoute = lazy(() => import("./pages/CreateRoute"));
const EditRoute = lazy(() => import("./pages/EditRoute"));
const MyRoutes = lazy(() => import("./pages/MyRoutes"));
const CreatorDashboard = lazy(() => import("./pages/CreatorDashboard"));
const CreatorAiStudio = lazy(() => import("./pages/CreatorAiStudio"));
const CreatorRoutes = lazy(() => import("./pages/CreatorRoutes"));
const CreatorEarnings = lazy(() => import("./pages/CreatorEarnings"));
const CreatorStats = lazy(() => import("./pages/CreatorStats"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const AuthError = lazy(() => import("./pages/AuthError"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth"));
const Contact = lazy(() => import("./pages/Contact"));
const Brand = lazy(() => import("./pages/Brand"));
const Messages = lazy(() => import("./pages/Messages"));
const AdminLayout = lazy(() => import("./components/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminRoutes = lazy(() => import("./pages/admin/AdminRoutes"));
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments"));
const AdminCreators = lazy(() => import("./pages/admin/AdminCreators"));
const AdminModeration = lazy(() => import("./pages/admin/AdminModeration"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminCampaigns = lazy(() => import("./pages/admin/AdminCampaigns"));
const AdminContentGenerator = lazy(() => import("./pages/admin/AdminContentGenerator"));
const AdminAtlas = lazy(() => import("./pages/admin/AdminAtlas"));
const BecomeCreator = lazy(() => import("./pages/BecomeCreator"));
const Favorites = lazy(() => import("./pages/Favorites"));
const GuideHub = lazy(() => import("./components/GuideHub"));
const NavigationLauncher = lazy(() => import("./components/NavigationLauncher"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Cookies = lazy(() => import("./pages/legal/Cookies"));
const Refunds = lazy(() => import("./pages/legal/Refunds"));
const Documents = lazy(() => import("./pages/legal/Documents"));
const AcceptableUse = lazy(() => import("./pages/legal/AcceptableUse"));
const Copyright = lazy(() => import("./pages/legal/Copyright"));
const CreatorAgreement = lazy(() => import("./pages/legal/CreatorAgreement"));
const DSACompliance = lazy(() => import("./pages/legal/DSACompliance"));

const queryClient = new QueryClient();

const ALL_AUTHENTICATED = [ROLES.USER, ROLES.CREATOR, ROLES.ADMIN];
const CREATOR_AND_ADMIN = [ROLES.CREATOR, ROLES.ADMIN];

const App = () => (
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
                <Route path="/map" element={<MapExplore />} />
                <Route path="/lab/globe" element={<GlobeLab />} />
                <Route path="/route/:id" element={<RouteDetail />} />
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
                <Route path="/legal/creator-agreement" element={<CreatorAgreement />} />
                <Route path="/legal/dsa-compliance" element={<DSACompliance />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/brand" element={<Brand />} />

                {/* Authenticated routes */}
                <Route path="/become-creator" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><BecomeCreator /></ProtectedRoute>} />
                <Route path="/my-routes" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><MyRoutes /></ProtectedRoute>} />
                <Route path="/my-purchases" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><MyRoutes /></ProtectedRoute>} />
                <Route path="/favorites" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><Favorites /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><UserProfile /></ProtectedRoute>} />
                <Route path="/payment-success" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><PaymentSuccess /></ProtectedRoute>} />
                <Route path="/messages" element={<ProtectedRoute allowedRoles={ALL_AUTHENTICATED}><Messages /></ProtectedRoute>} />

                {/* Creator routes */}
                <Route path="/create" element={<ProtectedRoute allowedRoles={CREATOR_AND_ADMIN}><CreateRoute /></ProtectedRoute>} />
                <Route path="/creator-ai-studio" element={<ProtectedRoute allowedRoles={CREATOR_AND_ADMIN}><CreatorAiStudio /></ProtectedRoute>} />
                <Route path="/edit-route/:id" element={<ProtectedRoute allowedRoles={CREATOR_AND_ADMIN}><EditRoute /></ProtectedRoute>} />
                <Route path="/creator-dashboard" element={<ProtectedRoute allowedRoles={CREATOR_AND_ADMIN}><CreatorDashboard /></ProtectedRoute>} />
                <Route path="/creator-routes" element={<ProtectedRoute allowedRoles={CREATOR_AND_ADMIN}><CreatorRoutes /></ProtectedRoute>} />
                <Route path="/creator-earnings" element={<ProtectedRoute allowedRoles={CREATOR_AND_ADMIN}><CreatorEarnings /></ProtectedRoute>} />
                <Route path="/creator-stats" element={<ProtectedRoute allowedRoles={CREATOR_AND_ADMIN}><CreatorStats /></ProtectedRoute>} />

                {/* Admin routes */}
                <Route path="/admin" element={<ProtectedAdminRoute><AdminLayout /></ProtectedAdminRoute>}>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="routes" element={<AdminRoutes />} />
                  <Route path="payments" element={<AdminPayments />} />
                  <Route path="creators" element={<AdminCreators />} />
                  <Route path="moderation" element={<AdminModeration />} />
                  <Route path="messages" element={<AdminMessages />} />
                  <Route path="campaigns" element={<AdminCampaigns />} />
                  <Route path="content-generator" element={<AdminContentGenerator />} />
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
);

export default App;
