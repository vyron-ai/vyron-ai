import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import ProjectsPage from "@/pages/projects";
import UploadPage from "@/pages/upload";
import SubtitlesPage from "@/pages/subtitles";
import SettingsPage from "@/pages/settings";
import StoragePage from "@/pages/storage";

const queryClient = new QueryClient();

const Spinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center dark">
    <Loader2 className="w-8 h-8 text-primary animate-spin" />
  </div>
);

/**
 * Protected route — requires auth.
 * While loading: show spinner.
 * After loading: if no user, redirect to /login.
 * If user: render the component.
 * Key: never re-mount the component once rendered (no intermediate Spinner when user exists).
 */
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Redirect to={`/login`} />;
  return <Component />;
}

/**
 * Public-only route — redirects logged-in users away.
 * While loading: show spinner.
 * After loading: if user exists, redirect to /projects.
 * If no user: render the component.
 * Key: once the component mounts (no user), never unmount it due to auth state changes
 *      until a deliberate navigation happens. This keeps form inputs stable.
 */
function PublicOnlyRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;
  if (user) return <Redirect to="/projects" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login">
        <PublicOnlyRoute component={LoginPage} />
      </Route>
      <Route path="/register">
        <PublicOnlyRoute component={RegisterPage} />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/projects">
        <ProtectedRoute component={ProjectsPage} />
      </Route>
      <Route path="/upload">
        <ProtectedRoute component={UploadPage} />
      </Route>
      <Route path="/subtitles">
        <ProtectedRoute component={SubtitlesPage} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>
      <Route path="/storage">
        <ProtectedRoute component={StoragePage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base="">
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
