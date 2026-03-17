"use client";

import { useEffect, useState } from "react";

type RadarData = {
  id: string;
  added: number;
  changed: number;
  signals: string[];
  score: number;
  level: string;
  note: string;
  generatedAt: string;
};

export default function Page() {
  const [data, setData] = useState<RadarData | null>(null);

  useEffect(() => {
    fetch("/data/latest.json")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((err) => console.error("Error loading JSON:", err));
  }, []);

  const levelStyles: Record<string, string> = {
    LOW: "bg-zinc-800 text-zinc-100",
    MEDIUM: "bg-blue-900/60 text-blue-100",
    HIGH: "bg-amber-900/60 text-amber-100",
    "VERY HIGH": "bg-red-900/70 text-red-100",
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <h1 className="text-4xl font-bold mb-6">🚀 Pond0x Launch Radar</h1>
        <p>Cargando datos...</p>
      </div>
    );
  }

  const scoreWidth = `${Math.min(data.score, 100)}%`;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-bold mb-6">🚀 Pond0x Launch Radar</h1>

      <div className="mb-6 space-y-2">
        <p><strong>Snapshot:</strong> {data.id}</p>
        <p><strong>Score:</strong> {data.score}</p>
        <p><strong>Archivos nuevos:</strong> {data.added}</p>
        <p><strong>Archivos modificados:</strong> {data.changed}</p>
        <p>
          <span className={`inline-block px-3 py-1 mt-2 ${levelStyles[data.level] || "bg-zinc-700"}`}>
            {data.level}
          </span>
        </p>
      </div>

      <div className="w-full bg-zinc-800 h-4 rounded">
        <div
          className="bg-green-400 h-4 rounded"
          style={{ width: scoreWidth }}
        />
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-bold">Signals</h2>
        <ul className="mt-2 list-disc list-inside">
          {data.signals.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-bold">Lectura</h2>
        <p className="mt-2">{data.note}</p>
      </div>

      <div className="mt-6 text-sm text-zinc-400">
        Generado: {data.generatedAt}
      </div>
    </div>
  );
}