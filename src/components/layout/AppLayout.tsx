import { Link, useLocation } from "wouter";
import { useState, ReactNode } from "react";
import {
  LayoutDashboard, FolderKanban, Video, Subtitles, Layers,
  BarChart3, Workflow, Settings, Bell, Search, Menu, HardDrive,
  LogOut, Loader2, FlaskConical, ScrollText, CalendarDays,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { user, isDemoMode, signOut } = useAuth();

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
  };

  const initials = (() => {
    const name: string = user?.user_metadata?.full_name ?? user?.email ?? "";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || "VY";
  })();

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Account";

  const navItems = [
    { icon: <LayoutDashboard size={18} />, label: "Dashboard", href: "/dashboard" },
    { icon: <FolderKanban size={18} />, label: "Projects", href: "/projects" },
  ];

  const aiTools = [
    { icon: <Video size={18} />, label: "Video AI", href: "/upload" },
    { icon: <Subtitles size={18} />, label: "Subtitles", href: "/subtitles" },
    { icon: <ScrollText size={18} />, label: "Script Engine", href: "/script-engine" },
    { icon: <CalendarDays size={18} />, label: "Content Planner", href: "/content-planner" },
    { icon: <Layers size={18} />, label: "Content", href: "/content" },
    { icon: <BarChart3 size={18} />, label: "Content Strategy", href: "/content-strategy" },
  ];

  const systemTools = [
    { icon: <HardDrive size={18} />, label: "Storage", href: "/storage" },
    { icon: <Workflow size={18} />, label: "Workflows", href: "/workflows" },
    { icon: <Settings size={18} />, label: "Settings", href: "/settings" },
  ];

  const SidebarItem = ({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) => {
    const active = location === href;
    return (
      <Link href={href} onClick={() => setIsOpen(false)}>
        <span
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            active
              ? "bg-primary/20 text-primary border-l-2 border-primary"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground border-l-2 border-transparent"
          }`}
          data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
        >
          {icon}
          {label}
        </span>
      </Link>
    );
  };

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center px-6 border-b border-border gap-3">
        <Link href="/">
          <span className="text-xl font-bold tracking-tight flex items-center cursor-pointer">
            VYRON<span className="text-primary ml-1 text-2xl leading-none">.</span>AI
          </span>
        </Link>
        {isDemoMode && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 border border-primary/40 text-primary text-[10px] font-bold uppercase tracking-wider shrink-0">
            <FlaskConical className="w-2.5 h-2.5" />
            Demo
          </span>
        )}
      </div>

      <div className="flex-1 py-6 px-4 space-y-6 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => <SidebarItem key={item.label} {...item} />)}
        </div>

        <div>
          <div className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Tools</div>
          <div className="space-y-1">
            {aiTools.map((item) => <SidebarItem key={item.label} {...item} />)}
          </div>
        </div>

        <div>
          <div className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">System</div>
          <div className="space-y-1">
            {systemTools.map((item) => <SidebarItem key={item.label} {...item} />)}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-border space-y-2">
        <div className="flex items-center gap-3 glass p-3 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{isDemoMode ? "Demo session" : (user?.email ?? "")}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          data-testid="button-sign-out"
        >
          {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
          {signingOut ? "Exiting..." : isDemoMode ? "Exit Demo" : "Sign out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden dark">
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className="hidden md:flex w-64 border-r border-border bg-sidebar flex-shrink-0 flex-col h-screen sticky top-0">
        <SidebarContent />
      </aside>

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-border transform transition-transform duration-200 ease-in-out md:hidden flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="h-16 glass border-b border-border flex items-center justify-between px-4 md:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsOpen(true)}
              data-testid="button-menu-toggle"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold hidden sm:block">{title}</h1>
          </div>

          <div className="flex items-center gap-4 flex-1 justify-end md:justify-start md:ml-8">
            <div className="relative w-full max-w-sm hidden md:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search..."
                className="pl-9 bg-background/50 border-border h-9 focus-visible:ring-primary/50 text-sm w-full"
                data-testid="input-global-search"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Demo mode badge in header */}
            {isDemoMode && (
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-semibold">
                <FlaskConical className="w-3 h-3" />
                Demo Mode
              </span>
            )}
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full electric-glow" />
            </Button>
            <div
              className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm border border-primary/30 cursor-pointer"
              data-testid="button-profile"
            >
              {initials}
            </div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
