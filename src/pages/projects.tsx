import { Link } from "wouter";

const demoProjects = [
  {
    id: 1,
    title: "VYRON Cinematic Demo",
    description: "Genera subtítulos IA y exporta motion graphics.",
    videoUrl: "",
  },
];

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Video Projects</h1>
          <p className="text-muted-foreground mt-2">
            Selecciona un video para generar subtítulos cinematográficos.
          </p>
        </div>

        <div className="grid gap-4">
          {demoProjects.map((project) => (
            <div
              key={project.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-xl"
            >
              <h2 className="text-xl font-bold">{project.title}</h2>

              <p className="text-muted-foreground mt-1">
                {project.description}
              </p>

              <div className="mt-5 flex gap-3">
                <Link href="/upload">
                  <button className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
                    Subir video
                  </button>
                </Link>

                <Link href="/subtitles">
                  <button className="rounded-xl border border-border px-5 py-3 font-bold">
                    Ir a subtítulos
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
