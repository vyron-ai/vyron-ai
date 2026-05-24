import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, Loader2, AlertCircle, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: authError } = await signIn(email, password);
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setLocation("/projects");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 relative overflow-hidden dark">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="glass-strong border border-border w-full max-w-md p-8 rounded-2xl relative z-10 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-2 mb-2">
          <Link href="/">
            <span className="text-2xl font-bold tracking-tight flex items-center cursor-pointer mb-4">
              VYRON<span className="text-primary ml-1 text-3xl leading-none">.</span>AI
            </span>
          </Link>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Sign in to your account to continue</p>
        </div>

        {/* Supabase setup banner */}
        {!isSupabaseConfigured && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-sm">
            <Settings2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>Setup required:</strong> Add{" "}
              <code className="text-xs bg-amber-500/20 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_URL</code>{" "}
              and{" "}
              <code className="text-xs bg-amber-500/20 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_ANON_KEY</code>{" "}
              to your Replit Secrets, then restart the app.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm" data-testid="alert-error">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background/50"
              autoComplete="email"
              disabled={loading}
              data-testid="input-email"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <span className="text-xs text-primary hover:underline cursor-pointer">Forgot password?</span>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background/50 pr-10"
                autoComplete="current-password"
                disabled={loading}
                data-testid="input-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 electric-glow mt-2"
            disabled={loading}
            data-testid="button-submit"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="relative flex items-center py-2">
          <div className="flex-grow border-t border-border" />
          <span className="flex-shrink-0 mx-4 text-muted-foreground text-xs uppercase tracking-wider">or</span>
          <div className="flex-grow border-t border-border" />
        </div>

        <div className="relative group">
          <Button
            type="button"
            variant="outline"
            className="w-full bg-transparent border-border text-muted-foreground cursor-not-allowed opacity-60"
            disabled
            aria-disabled="true"
          >
            <svg className="w-4 h-4 mr-2 opacity-70" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
            <span className="ml-auto text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Soon</span>
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href="/register">
            <span className="text-primary hover:underline cursor-pointer">Sign up</span>
          </Link>
        </p>
      </div>
    </div>
  );
}
