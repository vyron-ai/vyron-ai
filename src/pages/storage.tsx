import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

type StorageFile = {
  name: string;
  path: string;
  size: number;
  updated_at: string | null;
  publicUrl: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export default function StoragePage() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const totalSize = useMemo(
    () => files.reduce((total, file) => total + file.size, 0),
    [files],
  );

  async function loadFiles() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("You must be logged in to view storage.");
        setFiles([]);
        return;
      }

      const { data, error } = await supabase.storage
        .from("videos")
        .list(user.id, {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });

      if (error) throw error;

      const realFiles: StorageFile[] = (data || [])
        .filter((item) => item.name && item.metadata)
        .map((item) => {
          const path = `${user.id}/${item.name}`;
          const { data: publicData } = supabase.storage
            .from("videos")
            .getPublicUrl(path);

          return {
            name: item.name,
            path,
            size: item.metadata?.size || 0,
            updated_at: item.updated_at || item.created_at || null,
            publicUrl: publicData.publicUrl,
          };
        });

      setFiles(realFiles);
    } catch (err: any) {
      setError(err.message || "Could not load storage files.");
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    alert("URL copied");
  }

  async function deleteFile(path: string) {
    const confirmDelete = confirm("Delete this file permanently?");
    if (!confirmDelete) return;

    const { error } = await supabase.storage.from("videos").remove([path]);

    if (error) {
      alert(error.message);
      return;
    }

    await loadFiles();
  }

  useEffect(() => {
    loadFiles();
  }, []);

  return (
    <div className="min-h-screen bg-[#050816] text-white px-5 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Cloud Storage</h1>
          <p className="text-slate-400 mt-2">
            Real uploaded video files stored in Supabase.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-slate-400 text-sm">Total Files</p>
            <h2 className="text-3xl font-bold mt-2">{files.length}</h2>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-slate-400 text-sm">Storage Used</p>
            <h2 className="text-3xl font-bold mt-2">
              {formatBytes(totalSize)}
            </h2>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-slate-400 text-sm">Bucket</p>
            <h2 className="text-3xl font-bold mt-2">videos</h2>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Uploaded Files</h2>
            <button
              onClick={loadFiles}
              className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 transition"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div className="p-8 text-slate-400">Loading storage files...</div>
          )}

          {error && !loading && <div className="p-8 text-red-400">{error}</div>}

          {!loading && !error && files.length === 0 && (
            <div className="p-8 text-slate-400">
              No uploaded videos found yet.
            </div>
          )}

          {!loading && !error && files.length > 0 && (
            <div className="divide-y divide-white/10">
              {files.map((file) => (
                <div
                  key={file.path}
                  className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div>
                    <h3 className="font-semibold break-all">{file.name}</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      {formatBytes(file.size)} •{" "}
                      {file.updated_at
                        ? new Date(file.updated_at).toLocaleString()
                        : "Unknown date"}
                    </p>
                    <p className="text-xs text-blue-400 mt-2 break-all">
                      {file.publicUrl}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={file.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 transition text-sm"
                    >
                      Open
                    </a>

                    <button
                      onClick={() => copyUrl(file.publicUrl)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition text-sm"
                    >
                      Copy URL
                    </button>

                    <button
                      onClick={() => deleteFile(file.path)}
                      className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 transition text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
