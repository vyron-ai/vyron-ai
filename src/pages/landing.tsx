// @ts-nocheck
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Play,
  Video,
  Subtitles,
  Layers,
  Sparkles,
  Workflow,
  LineChart,
  Check,
  ArrowRight,
  Menu,
  X,
  UploadCloud,
} from "lucide-react";
import { useState } from "react";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";

const fadeUpVariant = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/30 dark">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-2xl font-bold tracking-tight flex items-center"
            >
              VYRON
              <span className="text-primary ml-1 text-3xl leading-none">.</span>
              AI
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </a>
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
          </div>

          <div className="hidden md:flex items-center">
            <Button
              className="animate-pulse-blue electric-glow bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-early-access"
            >
              Get Early Access
            </Button>
          </div>

          <div className="md:hidden flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass-strong border-t border-border absolute w-full top-20 flex flex-col p-4 gap-4 animate-in slide-in-from-top-2">
            <a
              href="#features"
              className="text-sm font-medium p-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium p-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </a>
            <Link
              href="/dashboard"
              className="text-sm font-medium p-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Button className="w-full electric-glow mt-2">
              Get Early Access
            </Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden flex flex-col items-center justify-center min-h-[90vh]">
        {/* Animated Background */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[20%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] mix-blend-screen animate-float"></div>
          <div
            className="absolute bottom-[20%] right-[10%] w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px] mix-blend-screen animate-float"
            style={{ animationDelay: "1.5s" }}
          ></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-4xl mx-auto flex flex-col items-center gap-6"
          >
            <motion.div
              variants={fadeUpVariant}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border border-primary/30 text-primary text-sm font-medium mb-4"
            >
              <Sparkles className="w-4 h-4" />
              <span>Now in early access</span>
            </motion.div>

            <motion.h1
              variants={fadeUpVariant}
              className="text-5xl md:text-7xl font-extrabold tracking-tight"
            >
              Elevate Your Video.
              <br className="hidden md:block" />{" "}
              <span className="text-gradient">Scale Your Content.</span>
            </motion.h1>

            <motion.p
              variants={fadeUpVariant}
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mt-4"
            >
              VYRON AI helps businesses and creators enhance real video quality,
              generate accurate subtitles, and automate their content pipeline —
              without replacing your footage with AI-generated scenes.
            </motion.p>

            <motion.div
              variants={fadeUpVariant}
              className="flex flex-col sm:flex-row gap-4 mt-8 w-full sm:w-auto"
            >
              <Button
                size="lg"
                className="h-14 px-8 text-base electric-glow animate-pulse-blue bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Start Free Trial
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-8 text-base border-border hover:bg-card"
              >
                <Play className="w-4 h-4 mr-2" />
                Watch Demo
              </Button>
            </motion.div>

            <motion.div
              variants={fadeUpVariant}
              className="mt-16 pt-8 border-t border-border/50 w-full"
            >
              <p className="text-sm text-muted-foreground mb-6 uppercase tracking-widest font-semibold">
                Built for creators and business teams
              </p>
              <div className="flex flex-wrap justify-center gap-6 opacity-50">
                <span className="text-xs font-semibold font-mono tracking-widest uppercase px-4 py-2 rounded-full border border-border">
                  Video Agencies
                </span>
                <span className="text-xs font-semibold font-mono tracking-widest uppercase px-4 py-2 rounded-full border border-border">
                  Marketing Teams
                </span>
                <span className="text-xs font-semibold font-mono tracking-widest uppercase px-4 py-2 rounded-full border border-border">
                  Indie Creators
                </span>
                <span className="text-xs font-semibold font-mono tracking-widest uppercase px-4 py-2 rounded-full border border-border">
                  Startups
                </span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Upload & Compare Section */}
      <AnimatedSection className="py-24 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                AI Video Enhancement
              </h2>
              <p className="text-muted-foreground text-lg mb-4">
                Upload your footage and let VYRON AI improve its clarity, color
                grading, and sharpness — while keeping your original scene
                exactly as it is.
              </p>
              <div className="flex items-start gap-3 mb-8 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0"></div>
                <p className="text-sm text-muted-foreground">
                  <span className="text-foreground font-medium">
                    Enhancement policy:
                  </span>{" "}
                  VYRON AI processes your real footage only. It does not
                  generate new scenes, add objects, or replace environments.
                  What you shot is what gets enhanced.
                </p>
              </div>

              <div className="glass-strong p-8 rounded-xl border border-primary/20 border-dashed relative overflow-hidden group">
                <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors"></div>
                <div className="flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                    <UploadCloud className="w-8 h-8 text-primary animate-float" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      Drop your video here
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Up to 4K resolution supported
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-8">
                {["Upload", "Analyze", "Enhance", "Export"].map((step, i) => (
                  <div key={step} className="flex flex-col items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i === 2 ? "bg-primary text-primary-foreground electric-glow" : "bg-card border border-border text-muted-foreground"}`}
                    >
                      {i + 1}
                    </div>
                    <span
                      className={`text-xs font-medium ${i === 2 ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative aspect-video rounded-xl overflow-hidden glass border border-border">
              <div className="absolute inset-0 flex">
                <div className="w-1/2 h-full bg-black/80 relative">
                  <div
                    className="absolute inset-0 opacity-30 flex items-center justify-center"
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
                    }}
                  ></div>
                  <span className="absolute top-4 left-4 px-2 py-1 rounded bg-black/60 text-xs font-mono text-white/70 backdrop-blur-md">
                    ORIGINAL
                  </span>
                </div>
                <div className="w-1/2 h-full bg-gradient-to-br from-slate-800 to-indigo-900 relative border-l border-primary/50">
                  <div className="absolute inset-0 bg-primary/10 mix-blend-overlay"></div>
                  <span className="absolute top-4 right-4 px-2 py-1 rounded bg-primary/20 text-primary border border-primary/30 text-xs font-mono backdrop-blur-md">
                    ENHANCED
                  </span>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-1 bg-primary/50 absolute top-1/2 -translate-y-1/2 blur-sm"></div>
                  </div>
                </div>
              </div>
              <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-primary -translate-x-1/2 flex items-center justify-center z-10 electric-glow">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-background">
                  <div className="w-1 h-3 bg-background rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Features Grid */}
      <AnimatedSection id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything Your Content Workflow Needs
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              A focused set of AI tools built around real production needs —
              from raw footage to published content.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Video className="w-6 h-6" />}
              title="Video Enhancement"
              description="Improve sharpness, reduce noise, and apply color correction to your existing footage. No scene replacement or AI-generated content added."
            />
            <FeatureCard
              icon={<Subtitles className="w-6 h-6" />}
              title="Automatic Subtitles"
              description="Transcribe and sync subtitles across multiple languages. Review and edit before exporting to keep accuracy where it matters."
            />
            <FeatureCard
              icon={<Layers className="w-6 h-6" />}
              title="Content Creation"
              description="Generate video scripts, social captions, and repurposed short clips from your existing long-form content."
            />
            <FeatureCard
              icon={<LineChart className="w-6 h-6" />}
              title="Content Strategy"
              description="Plan content calendars, identify relevant topics, and map publishing schedules based on your niche and goals."
            />
            <FeatureCard
              icon={<Workflow className="w-6 h-6" />}
              title="Workflow Automation"
              description="Connect your tools, automate repetitive steps, and schedule publishing across platforms from a single workspace."
            />
            <FeatureCard
              icon={<Sparkles className="w-6 h-6" />}
              title="Performance Insights"
              description="Track content performance across channels, understand what works, and inform future production decisions with real data."
            />
          </div>
        </div>
      </AnimatedSection>

      {/* Strategy Generator Section */}
      <AnimatedSection className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 relative z-10">
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4">
              A Smarter Way to Plan
              <br />
              and Execute <span className="text-primary">Content</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mt-4">
              Define your niche, platforms, and goals. VYRON AI generates a
              structured content plan you can refine and act on.
            </p>
          </div>

          <div className="glass-strong rounded-2xl border border-border p-1 md:p-8 flex flex-col lg:flex-row gap-8 relative z-10">
            <div className="w-full lg:w-1/3 space-y-6 p-4 md:p-0">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                    Niche / Industry
                  </label>
                  <div className="h-10 rounded-md bg-background border border-border flex items-center px-3 text-sm text-foreground/80">
                    SaaS Tech Startups
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                    Platforms
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs border border-primary/30">
                      YouTube
                    </span>
                    <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs border border-primary/30">
                      LinkedIn
                    </span>
                    <span className="px-3 py-1 rounded-full bg-card border border-border text-xs">
                      TikTok
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                    Primary Goal
                  </label>
                  <div className="h-10 rounded-md bg-background border border-border flex items-center px-3 text-sm text-foreground/80">
                    Lead Generation
                  </div>
                </div>
              </div>
              <Button className="w-full electric-glow">
                Generate Strategy
              </Button>
            </div>

            <div className="w-full lg:w-2/3 bg-background rounded-xl border border-border p-6 font-mono text-sm relative">
              <div className="absolute top-0 right-0 p-4">
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                  <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                  <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
                </div>
              </div>
              <div className="text-primary mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> STRATEGY_GENERATED_SUCCESS
              </div>
              <div className="space-y-4 text-muted-foreground">
                <div>
                  <span className="text-foreground font-bold">
                    WEEK_1_FOCUS:
                  </span>{" "}
                  "The Architecture of Scale"
                  <ul className="mt-2 pl-4 border-l border-border/50 space-y-2">
                    <li>
                      <span className="text-blue-400">[YT_LONG]</span> How We
                      Rebuilt Our Infrastructure for 10M Users
                    </li>
                    <li>
                      <span className="text-indigo-400">[LI_POST]</span> The
                      hidden cost of technical debt (Framework)
                    </li>
                    <li>
                      <span className="text-blue-400">[YT_SHORT]</span> 3
                      Microservices mistakes to avoid
                    </li>
                  </ul>
                </div>
                <div>
                  <span className="text-foreground font-bold">
                    WEEK_2_FOCUS:
                  </span>{" "}
                  "Engineering Culture"
                  <ul className="mt-2 pl-4 border-l border-border/50 space-y-2">
                    <li>
                      <span className="text-blue-400">[YT_LONG]</span> Inside
                      Our Engineering Onboarding Process
                    </li>
                    <li>
                      <span className="text-indigo-400">[LI_CAROUSEL]</span> 5
                      Books every senior dev must read
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Dashboard Preview */}
      <AnimatedSection className="py-24 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              One Dashboard. Every Tool.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Manage your projects, track progress, and access every AI tool
              from a single workspace.
            </p>
          </div>

          <div className="glass rounded-2xl border border-border overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 w-full h-12 bg-background/50 border-b border-border flex items-center px-4 gap-2">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
              </div>
            </div>

            <div className="flex pt-12 h-[600px]">
              {/* Sidebar */}
              <div className="w-64 border-r border-border bg-sidebar/50 p-4 hidden md:flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    V
                  </div>
                  <span className="font-bold tracking-tight">VYRON.AI</span>
                </div>
                {[
                  "Dashboard",
                  "Projects",
                  "Video AI",
                  "Subtitles",
                  "Strategy",
                  "Analytics",
                ].map((item, i) => (
                  <div
                    key={item}
                    className={`px-3 py-2 rounded-lg text-sm ${i === 0 ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground"}`}
                  >
                    {item}
                  </div>
                ))}
              </div>

              {/* Main Area */}
              <div className="flex-1 p-6 overflow-hidden bg-background/30 flex flex-col gap-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Videos Processed", value: "247" },
                    { label: "Hours Saved", value: "1,840" },
                    { label: "Content Pieces", value: "89" },
                    { label: "Active Workflows", value: "12" },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="glass border border-border p-4 rounded-xl"
                    >
                      <div className="text-xs text-muted-foreground mb-1">
                        {stat.label}
                      </div>
                      <div className="text-2xl font-bold">{stat.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                  <div className="lg:col-span-2 glass border border-border rounded-xl p-4 flex flex-col">
                    <h3 className="text-sm font-semibold mb-4">Performance</h3>
                    <div className="flex-1 flex items-end gap-2 mt-auto">
                      {[30, 45, 60, 40, 80, 55, 95, 70, 85, 60, 100, 75].map(
                        (h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-card border border-border rounded-t-sm flex items-end overflow-hidden"
                            style={{ height: "100%" }}
                          >
                            <div
                              className="w-full bg-primary/80 transition-all"
                              style={{ height: `${h}%` }}
                            ></div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="glass border border-border rounded-xl p-4 flex flex-col gap-3">
                    <h3 className="text-sm font-semibold mb-2">
                      Recent Projects
                    </h3>
                    {[
                      {
                        name: "Q3 Launch",
                        status: "completed",
                        color: "bg-green-400",
                      },
                      {
                        name: "Tutorial Series",
                        status: "processing",
                        color: "bg-primary animate-pulse",
                      },
                      {
                        name: "Interview Raw",
                        status: "queued",
                        color: "bg-muted-foreground",
                      },
                    ].map((p, i) => (
                      <div
                        key={i}
                        className="bg-card/50 border border-border rounded-lg p-3 flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium truncate">{p.name}</span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {p.status}
                          </span>
                        </div>
                        <div className="h-1 bg-background rounded-full overflow-hidden">
                          <div
                            className={`h-full ${p.color}`}
                            style={{
                              width:
                                p.status === "completed"
                                  ? "100%"
                                  : p.status === "processing"
                                    ? "65%"
                                    : "0%",
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Pricing */}
      <AnimatedSection id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-muted-foreground text-lg">
              Start free. Upgrade when you need more.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              title="Free"
              price="$0"
              description="Get started with core tools at no cost. No credit card required."
              features={[
                "3 videos per month",
                "Auto subtitles (up to 10 min)",
                "Basic video enhancement",
                "1080p exports",
                "Community support",
              ]}
            />
            <PricingCard
              title="Pro"
              price="$29"
              description="For creators and small teams who publish consistently."
              features={[
                "25 videos per month",
                "Subtitles in 30+ languages",
                "Full video enhancement suite",
                "Content strategy generator",
                "Email support",
              ]}
              isPopular
            />
            <PricingCard
              title="Business"
              price="$99"
              description="For agencies and teams with higher volume and custom needs."
              features={[
                "Unlimited videos",
                "All Pro features",
                "Workflow automation",
                "API access",
                "Priority support & onboarding",
              ]}
            />
          </div>
        </div>
      </AnimatedSection>

      {/* Footer */}
      <footer className="bg-card/50 border-t border-border pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2">
              <Link
                href="/"
                className="text-2xl font-bold tracking-tight flex items-center mb-4"
              >
                VYRON
                <span className="text-primary ml-1 text-3xl leading-none">
                  .
                </span>
                AI
              </Link>
              <p className="text-muted-foreground text-sm max-w-xs">
                AI-powered video enhancement and content automation for
                businesses and creators who care about quality.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    API
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Changelog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Legal
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/50 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} VYRON AI. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-primary transition-colors">
                Twitter
              </a>
              <a href="#" className="hover:text-primary transition-colors">
                LinkedIn
              </a>
              <a href="#" className="hover:text-primary transition-colors">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AnimatedSection({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const { ref, isIntersecting } = useIntersectionObserver();
  return (
    <motion.section
      id={id}
      ref={ref}
      initial="hidden"
      animate={isIntersecting ? "visible" : "hidden"}
      variants={fadeUpVariant}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass p-6 rounded-xl border border-border hover:border-primary/50 transition-all group cursor-pointer relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="w-12 h-12 rounded-lg bg-card border border-border flex items-center justify-center text-primary mb-4 group-hover:electric-glow transition-all">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm mb-4">{description}</p>
      <div className="flex items-center text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
        Learn more <ArrowRight className="w-4 h-4 ml-1" />
      </div>
    </div>
  );
}

function PricingCard({
  title,
  price,
  description,
  features,
  isPopular = false,
}: {
  title: string;
  price: string;
  description: string;
  features: string[];
  isPopular?: boolean;
}) {
  return (
    <div
      className={`glass-strong rounded-2xl p-8 relative flex flex-col ${isPopular ? "border-primary electric-glow scale-105 z-10" : "border-border mt-4 mb-4"}`}
    >
      {isPopular && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full uppercase tracking-wider">
          MOST POPULAR
        </div>
      )}
      <div className="mb-8">
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-4xl font-extrabold">{price}</span>
          {price !== "Custom" && (
            <span className="text-muted-foreground">/mo</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <ul className="space-y-4 mb-8 flex-grow">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <Check className="w-5 h-5 text-primary shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        className={`w-full ${isPopular ? "electric-glow bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card text-foreground hover:bg-card/80 border border-border"}`}
      >
        {price === "Custom" ? "Contact Sales" : "Get Started"}
      </Button>
    </div>
  );
}
