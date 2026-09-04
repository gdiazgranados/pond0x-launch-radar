import styles from "./ecosystem-navigation.module.css";

type Destination = "radar" | "clear" | "graph" | "miner" | "qa";

const destinations: { id: Destination; label: string; path: string; site: "radar" | "graph" }[] = [
  { id: "radar", label: "Radar", path: "/", site: "radar" },
  { id: "clear", label: "Clear Intelligence", path: "/clear", site: "radar" },
  { id: "graph", label: "Blockchain Graph", path: "/graph", site: "graph" },
  { id: "miner", label: "Live Miner", path: "/observatory", site: "graph" },
  { id: "qa", label: "Indicators Q&A", path: "/qa", site: "radar" },
];

const origins = {
  radar: "https://pond0x-launch-radar.vercel.app",
  graph: "https://pond0x-blockchain-graph-three.vercel.app",
};

export default function EcosystemNavigation({
  current,
  site,
}: {
  current: Destination;
  site: "radar" | "graph";
}) {
  return (
    <nav className={styles.navigation} aria-label="Pond0x tools">
      {destinations.map((destination) => (
        <a
          key={destination.id}
          href={destination.site === site ? destination.path : origins[destination.site] + destination.path}
          aria-current={destination.id === current ? "page" : undefined}
          className={styles.link}
        >
          {destination.label}
        </a>
      ))}
    </nav>
  );
}
