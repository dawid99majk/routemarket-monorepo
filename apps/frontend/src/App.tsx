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
/**
 * Wdrożenie zmienia skróty w nazwach plików, a otwarta karta pamięta stare.
 * Wejście na trasę, która nie zdążyła się wczytać przed wdrożeniem, kończyło się
 * białą stroną: Suspense obsługuje oczekiwanie, nie błąd. Jedno przeładowanie
 * pobiera świeży manifest i naprawia sytuację — a znacznik w sessionStorage
 * pilnuje, żeby przy padniętej sieci nie zapętlić przeładowań.
 */
function leniwie<T extends { default: React.ComponentType<any> }>(zaladuj: () => Promise<T>) {
  return lazy(() =>
    zaladuj().catch((blad) => {
      const KLUCZ = 'rm_chunk_przeladowany';
      if (sessionStorage.getItem(KLUCZ)) {
        sessionStorage.removeItem(KLUCZ);
        throw blad;
      }
      sessionStorage.setItem(KLUCZ, '1');
      window.location.reload();
      // Przeładowanie jest asynchroniczne; obietnica, która nigdy się nie
      // rozstrzyga, trzyma Suspense do momentu wymiany dokumentu.
      return new Promise<T>(() => {});
    })
  );
}

const GlobeLab = leniwie(() => import("./pages/GlobeLab"));
const MyRoutes = leniwie(() => import("./pages/MyRoutes"));
const PlacePage = leniwie(() => import("./pages/PlacePage"));
const Start = leniwie(() => import('./pages/Start'));
const Discover = leniwie(() => import("./pages/Discover"));
const Collections = leniwie(() => import("./pages/Collections"));
const Zapisane = leniwie(() => import("./pages/Zapisane"));
const Tablice = leniwie(() => import("./pages/Tablice"));
const Marketing = leniwie(() => import("./pages/Marketing"));
const TablicaPubliczna = leniwie(() => import("./pages/TablicaPubliczna"));
const TripPlans = leniwie(() => import("./pages/TripPlans"));
const RouteBuilderV2 = leniwie(() => import("./pages/v2/RouteBuilderV2"));

function LegacyCreateRedirect() {
  const location = useLocation();
  return <Navigate to={`/route-builder-v2${location.search}`} replace />;
}
const UserProfile = leniwie(() => import("./pages/UserProfile"));
const AuthCallback = leniwie(() => import("./pages/AuthCallback"));
const AuthError = leniwie(() => import("./pages/AuthError"));
const NotFound = leniwie(() => import("./pages/NotFound"));
const Auth = leniwie(() => import("./pages/Auth"));
const Contact = leniwie(() => import("./pages/Contact"));
const Brand = leniwie(() => import("./pages/Brand"));
const AdminLayout = leniwie(() => import("./components/AdminLayout"));
const AdminDashboard = leniwie(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = leniwie(() => import("./pages/admin/AdminUsers"));
const AdminAtlas = leniwie(() => import("./pages/admin/AdminAtlas"));
const GuideHub = leniwie(() => import("./components/GuideHub"));
const NavigationLauncher = leniwie(() => import("./components/NavigationLauncher"));
const NowaWersja = leniwie(() => import("./components/NowaWersja"));
const ZgodaCookies = leniwie(() => import("./components/ZgodaCookies"));
const Terms = leniwie(() => import("./pages/legal/Terms"));
const Privacy = leniwie(() => import("./pages/legal/Privacy"));
const Cookies = leniwie(() => import("./pages/legal/Cookies"));
const Documents = leniwie(() => import("./pages/legal/Documents"));
const AcceptableUse = leniwie(() => import("./pages/legal/AcceptableUse"));
const Copyright = leniwie(() => import("./pages/legal/Copyright"));

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
                {/* Karta otwarta przed wdrożeniem nie pobiera już index.html — router
                    obsługuje nawigację po stronie przeglądarki, więc stary interfejs
                    potrafi wisieć godzinami mimo świeżego kodu na serwerze. */}
                <NowaWersja />
                <ZgodaCookies />
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
                  <Route path="/legal/documents" element={<Documents />} />
                  {/* Zwroty i osobna strona DSA opisywały marketplace, którego nie ma.
                      Adresy zostają jako przekierowania — mogą wisieć w wyszukiwarkach. */}
                  <Route path="/legal/refunds" element={<Navigate to="/legal/terms" replace />} />
                  <Route path="/legal/dsa-compliance" element={<Navigate to="/legal/acceptable-use" replace />} />
                  <Route path="/legal/creator-agreement" element={<Navigate to="/legal/terms" replace />} />
                  <Route path="/legal/acceptable-use" element={<AcceptableUse />} />
                  <Route path="/legal/copyright" element={<Copyright />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/brand" element={<Brand />} />

                  {/* Authenticated routes */}
                  <Route path="/zapisane" element={<ProtectedRoute><Zapisane /></ProtectedRoute>} />
                  {/* Publiczne tablice bez logowania — to jedyna droga, żeby
                      opublikowana tablica mogła kogokolwiek z zewnątrz zaprosić. */}
                  <Route path="/tablice" element={<Tablice />} />
                  <Route path="/marketing" element={<ProtectedAdminRoute><Marketing /></ProtectedAdminRoute>} />
                  {/* /tablica bez numeru to nie tablica, tylko galeria — dotad
                      konczylo sie 404 zamiast pokazac, po co sie tu weszlo. */}
                  <Route path="/tablica" element={<Navigate to="/tablice" replace />} />
                  <Route path="/tablica/:id" element={<TablicaPubliczna />} />
                  {/* Ulubione i kolekcje były osobnymi ekranami dla tej samej intencji.
                      Stare adresy zostają jako przekierowania — mogą wisieć w zakładkach
                      przeglądarki albo w wysłanych odnośnikach. */}
                  <Route path="/ulubione" element={<Navigate to="/zapisane" replace />} />
                  <Route path="/kolekcje" element={<Navigate to="/zapisane" replace />} />
                  <Route path="/kolekcje/:slug" element={<ProtectedRoute><Collections /></ProtectedRoute>} />
                  <Route path="/kolekcja/:slug" element={<ProtectedRoute><Collections /></ProtectedRoute>} />
                  <Route path="/start" element={<ProtectedRoute><Start /></ProtectedRoute>} />
                  <Route path="/odkrywaj" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
                  <Route path="/miejsce/:slug" element={<PlacePage />} />
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
