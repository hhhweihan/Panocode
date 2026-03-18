"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseGithubUrl } from "@/lib/github";
import { ArrowRight, Github } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const handleAnalyze = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a GitHub repository URL");
      return;
    }
    const parsed = parseGithubUrl(trimmed);
    if (!parsed) {
      setError("Invalid GitHub URL. Try: https://github.com/owner/repo");
      return;
    }
    setError("");
    router.push(`/analyze?url=${encodeURIComponent(trimmed)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAnalyze();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError("");
  };

  const examples = ["vercel/next.js", "facebook/react", "microsoft/vscode"];

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, #0d2038 0%, #0a0e1a 60%)",
      }}
    >
      {/* Grid decoration */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text) 1px, transparent 1px), linear-gradient(90deg, var(--text) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl w-full">
        {/* Logo */}
        <div
          className="mb-8 flex items-center justify-center w-20 h-20 rounded-2xl border"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <polyline
              points="13 27 7 20 13 13"
              stroke="#58a6ff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="27 13 33 20 27 27"
              stroke="#58a6ff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="22"
              y1="10"
              x2="18"
              y2="30"
              stroke="#79c0ff"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.6"
            />
          </svg>
        </div>

        {/* Title */}
        <h1
          className="text-6xl font-bold mb-3"
          style={{ letterSpacing: "-0.03em" }}
        >
          <span style={{ color: "#e6edf3" }}>Pano</span>
          <span style={{ color: "#58a6ff" }}>code</span>
        </h1>

        <p className="text-lg mb-12" style={{ color: "var(--muted)" }}>
          Explore any GitHub repository — visualize structure, browse files
        </p>

        {/* Input */}
        <div className="w-full">
          <div
            className="flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors"
            style={{
              background: "var(--panel)",
              borderColor: error ? "var(--error)" : "var(--border)",
            }}
          >
            <Github
              size={18}
              style={{ color: "var(--muted)", flexShrink: 0 }}
            />
            <input
              type="text"
              value={url}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="https://github.com/owner/repository"
              className="flex-1 bg-transparent outline-none text-base"
              style={{ color: "var(--text)" }}
              autoFocus
            />
            <button
              onClick={handleAnalyze}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
              style={{ background: "var(--accent)", color: "#0a0e1a" }}
            >
              Analyze
              <ArrowRight size={15} />
            </button>
          </div>

          {error && (
            <p className="mt-2 text-sm text-left" style={{ color: "var(--error)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Examples */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Try:
          </span>
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setUrl(`https://github.com/${ex}`);
                setError("");
              }}
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{ color: "var(--muted)", borderColor: "var(--border)" }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
