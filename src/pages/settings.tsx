import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Trash, Download } from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("Profile");

  const tabs = ["Profile", "Plan & Billing", "Notifications", "API", "Danger Zone"];

  return (
    <AppLayout title="Settings">
      <div className="p-4 md:p-8 max-w-5xl w-full mx-auto flex flex-col md:flex-row gap-8">
        
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 flex flex-col gap-1 shrink-0 overflow-x-auto md:overflow-visible flex-row md:flex-col pb-2 md:pb-0">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium text-left whitespace-nowrap transition-colors ${
                activeTab === tab 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1">
          
          {activeTab === "Profile" && (
            <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-3xl font-bold">
                  AL
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium">Profile Picture</h3>
                  <Button variant="outline" size="sm" className="w-fit">Upload Photo</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue="Alex Doe" className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue="alex@example.com" className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input defaultValue="Acme Corp" className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input defaultValue="Content Manager" className="bg-background/50" />
                </div>
              </div>
              <Button className="w-fit electric-glow">Save Changes</Button>
            </div>
          )}

          {activeTab === "Plan & Billing" && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="glass rounded-xl border border-primary/30 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-primary/5">
                <div>
                  <h3 className="text-xl font-bold text-foreground">Pro Plan — $29/month</h3>
                  <p className="text-sm text-muted-foreground mt-1">Renews on Nov 14, 2023</p>
                </div>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 electric-glow">Upgrade to Business</Button>
              </div>

              <div className="glass rounded-xl border border-border p-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-8 bg-card rounded border border-border flex items-center justify-center font-bold text-xs">VISA</div>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">•••• •••• •••• 4242</span>
                    <span className="text-xs text-muted-foreground">Expires 12/24</span>
                  </div>
                </div>
                <Button variant="link" className="text-primary p-0">Update</Button>
              </div>

              <div className="glass rounded-xl border border-border overflow-hidden mt-4">
                <div className="p-4 border-b border-border bg-card/30">
                  <h3 className="font-bold text-sm">Billing History</h3>
                </div>
                <div className="divide-y divide-border/50">
                  {[
                    { date: "Oct 14, 2023", amount: "$29.00" },
                    { date: "Sep 14, 2023", amount: "$29.00" },
                    { date: "Aug 14, 2023", amount: "$29.00" },
                  ].map((inv, i) => (
                    <div key={i} className="flex justify-between items-center p-4 text-sm hover:bg-card/30">
                      <span className="text-muted-foreground w-24">{inv.date}</span>
                      <span className="font-medium">{inv.amount}</span>
                      <span className="text-green-400 bg-green-400/10 px-2 py-0.5 rounded text-xs border border-green-400/20">Paid</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "Notifications" && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="glass rounded-xl border border-border p-6 space-y-6">
                {[
                  { id: 'n1', label: "Email on job complete", desc: "Get notified when a video enhancement or subtitle generation finishes." },
                  { id: 'n2', label: "Email weekly digest", desc: "A summary of your content performance and processing stats." },
                  { id: 'n3', label: "Browser push notifications", desc: "Real-time alerts while you have the app open." },
                  { id: 'n4', label: "Marketing emails", desc: "Product updates, tips, and promotional offers." },
                ].map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <Label htmlFor={item.id} className="text-base cursor-pointer">{item.label}</Label>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors shrink-0 ${i < 2 ? 'bg-primary' : 'bg-muted'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${i < 2 ? 'translate-x-5' : 'translate-x-1'}`}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "API" && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="glass rounded-xl border border-border p-6 flex flex-col gap-6">
                <div>
                  <h3 className="font-bold mb-1">Your API Keys</h3>
                  <p className="text-sm text-muted-foreground">Use these keys to authenticate API requests.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-border rounded-lg bg-card/50">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">Production Key</span>
                    <span className="font-mono text-xs text-muted-foreground mt-1">vyr_sk_••••••••••••••••3f9a</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50">
                      <Trash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline">Generate New Key</Button>
                  <Button variant="link" className="text-primary">View API Docs</Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Danger Zone" && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="glass rounded-xl border border-red-500/30 bg-red-500/5 p-6 flex flex-col items-start gap-4">
                <div>
                  <h3 className="font-bold text-red-500 mb-1">Delete Account</h3>
                  <p className="text-sm text-muted-foreground">Permanently delete your account and all associated data. This action cannot be undone.</p>
                </div>
                <Button variant="outline" className="border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                  Delete My Account
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
