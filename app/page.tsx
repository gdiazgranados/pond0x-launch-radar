export default function Page() {
  const snapshots = [
    {
      id: "2026-03-17_090000",
      added: 2,
      changed: 5,
      signals: ["reward", "claim", "verify", "connect x"],
      score: 72,
      level: "HIGH",
      note: "Nuevos bundles y señales de rewards.",
    },
    {
      id: "2026-03-17_120000",
      added: 1,
      changed: 7,
      signals: ["reward", "claim", "verify", "connect x", "account"],
      score: 86,
      level: "VERY HIGH",
      note: "Activación progresiva del portal.",
    },
  ];

  const latest = snapshots[snapshots.length - 1];

  const levelStyles: any = {
    LOW: "bg-zinc-800 text-zinc-100",
    MEDIUM: "bg-blue-900/60 text-blue-100",
    HIGH: "bg-amber-900/60 text-amber-100",
    "VERY HIGH": "bg-red-900/70 text-red-100",
  };

  const scoreWidth = `${Math.min(latest.score, 100)}%`;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-bold mb-6">
        🚀 Pond0x Launch Radar
      </h1>

      <div className="mb-6">
        <p>Snapshot: {latest.id}</p>
        <p>Score: {latest.score}</p>
        <p className={`inline-block px-3 py-1 mt-2 ${levelStyles[latest.level]}`}>
          {latest.level}
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
        <ul className="mt-2">
          {latest.signals.map((s) => (
            <li key={s}>• {s}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}