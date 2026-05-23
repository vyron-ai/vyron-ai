import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
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

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, user, navigate]);

  if (loading) return <Spinner />;
  if (!user) return <Spinner />;
  return <Component />;
}

function PublicOnlyRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      navigate("/projects");
    }
  }, [loading, user, navigate]);

  if (loading) return <Spinner />;
  if (user) return <Spinner />;
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
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
