import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();
  const [, setLocation] = useLocation();

  const getStrength = (pass: string) => {
    if (pass.length === 0) return 0;
    if (pass.length < 4) return 1;
    if (pass.length < 8) return 2;
    if (pass.length < 12) return 3;
    return 4;
  };

  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
  const strength = getStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: authError } = await signUp(email, password, fullName);
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setSuccess(true);
      setTimeout(() => setLocation("/projects"), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 relative overflow-hidden dark">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none"></div>

      <div className="glass-strong border border-border w-full max-w-md p-8 rounded-2xl relative z-10 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-2 mb-2">
          <Link href="/">
            <span className="text-2xl font-bold tracking-tight flex items-center cursor-pointer mb-4">
              VYRON<span className="text-primary ml-1 text-3xl leading-none">.</span>AI
            </span>
          </Link>
          <h1 className="text-2xl font-bold">Create Account</h1>
          <p className="text-muted-foreground text-sm">Sign up to get started with VYRON AI</p>
        </div>

        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm" data-testid="alert-error">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-green-500/40 bg-green-500/10 text-green-400 text-sm" data-testid="alert-success">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Account created! Redirecting you to your dashboard...</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Alex Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bg-background/50"
              autoComplete="name"
              disabled={loading || success}
              data-testid="input-name"
            />
          </div>

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
              disabled={loading || success}
              data-testid="input-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background/50"
              autoComplete="new-password"
              disabled={loading || success}
              data-testid="input-password"
            />

            <div className="flex gap-1 mt-2 h-1 w-full" data-testid="password-strength">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`flex-1 rounded-full transition-all duration-300 ${
                    strength >= level
                      ? strength === 1
                        ? "bg-red-500"
                        : strength === 2
                        ? "bg-orange-500"
                        : strength === 3
                        ? "bg-yellow-500"
                        : "bg-green-500"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            {password.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Password strength:{" "}
                <span className={strength <= 1 ? "text-red-400" : strength === 2 ? "text-orange-400" : strength === 3 ? "text-yellow-400" : "text-green-400"}>
                  {strengthLabels[strength]}
                </span>
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 electric-glow mt-4"
            disabled={loading || success}
            data-testid="button-submit"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-2">
          Already have an account?{" "}
          <Link href="/login">
            <span className="text-primary hover:underline cursor-pointer">Sign in</span>
          </Link>
        </p>
      </div>
    </div>
  );
}
