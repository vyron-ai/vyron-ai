import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Video, Subtitles, Layers, 
  LineChart, ArrowUpRight, Clock, CheckCircle2, CircleDashed
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

export default function Dashboard() {
  return (
    <AppLayout title="Dashboard">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-8">
        
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Welcome back, Alex</h1>
          <p className="text-muted-foreground">Here's what's happening with your media today.</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Videos Processed" value="247" trend="+12%" positive />
          <StatCard title="Hours Saved" value="1,840" trend="+8%" positive />
          <StatCard title="Content Pieces" value="89" trend="+24%" positive />
          <StatCard title="Workflows Active" value="12" trend="0%" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Projects */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Recent Projects</h2>
              <Link href="/projects">
                <span className="text-sm text-primary p-0 h-auto font-medium flex items-center hover:underline cursor-pointer">View all <ArrowUpRight className="w-4 h-4 ml-1" /></span>
              </Link>
            </div>
            <div className="glass rounded-xl border border-border overflow-hidden">
              <div className="divide-y divide-border/50">
                <ProjectRow name="Q3 Launch Teaser" status="completed" date="2h ago" progress={100} />
                <ProjectRow name="Onboarding Tutorial Series" status="processing" date="Processing..." progress={65} />
                <ProjectRow name="CEO Interview Raw" status="queued" date="Queued" progress={0} />
                <ProjectRow name="Social Media Shorts Vol. 2" status="completed" date="Yesterday" progress={100} />
              </div>
            </div>
          </div>

          {/* Quick Access */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold">AI Tools Quick Access</h2>
            <div className="grid grid-cols-2 gap-4">
              <Link href="/upload"><ToolCard icon={<Video />} title="Enhance Video" color="text-blue-400" /></Link>
              <Link href="/subtitles"><ToolCard icon={<Subtitles />} title="Subtitles" color="text-indigo-400" /></Link>
              <Link href="/content"><ToolCard icon={<Layers />} title="Content Planner" color="text-purple-400" /></Link>
              <Link href="/strategy"><ToolCard icon={<LineChart />} title="Strategy AI" color="text-pink-400" /></Link>
            </div>
          </div>
        </div>

        {/* Performance Chart Area */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Content Performance</h2>
          <div className="glass rounded-xl border border-border p-6 h-64 flex flex-col">
            <div className="flex justify-between text-sm text-muted-foreground mb-4">
              <span>Views Across Platforms</span>
              <span>Last 7 Days</span>
            </div>
            <div className="flex-1 flex items-end justify-between gap-2 md:gap-4 mt-auto">
              {[40, 70, 45, 90, 65, 85, 100].map((height, i) => (
                <div key={i} className="w-full flex flex-col items-center gap-2 group">
                  <div className="w-full relative bg-card rounded-t-sm overflow-hidden flex items-end justify-center" style={{ height: '100%' }}>
                    <div 
                      className="w-full bg-primary/80 group-hover:bg-primary transition-all rounded-t-sm" 
                      style={{ height: `${height}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-muted-foreground">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, trend, positive = false }: { title: string, value: string, trend: string, positive?: boolean }) {
  return (
    <div className="glass rounded-xl border border-border p-5">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold">{value}</span>
        <span className={`text-xs font-medium px-2 py-1 rounded bg-background ${positive ? 'text-green-400' : 'text-muted-foreground'}`}>
          {trend}
        </span>
      </div>
    </div>
  );
}

function ProjectRow({ name, status, date, progress }: { name: string, status: 'completed' | 'processing' | 'queued', date: string, progress: number }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'processing': return <div className="w-5 h-5 text-primary animate-spin"><CircleDashed className="w-full h-full" /></div>;
      case 'queued': return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-card/50 transition-colors cursor-pointer">
      {getStatusIcon()}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm truncate">{name}</h4>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-muted-foreground w-16">{date}</span>
          <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${status === 'completed' ? 'bg-green-400' : 'bg-primary animate-pulse'}`} 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolCard({ icon, title, color }: { icon: React.ReactNode, title: string, color: string }) {
  return (
    <button className="glass rounded-xl border border-border p-4 flex flex-col items-center justify-center gap-3 hover:bg-card/80 hover:border-primary/50 transition-all text-center group">
      <div className={`w-10 h-10 rounded-full bg-background flex items-center justify-center border border-border group-hover:electric-glow transition-all ${color}`}>
        {icon}
      </div>
      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">{title}</span>
    </button>
  );
}