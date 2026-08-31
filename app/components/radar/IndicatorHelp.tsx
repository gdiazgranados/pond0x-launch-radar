import Link from "next/link"
import { indicatorGuideLinks } from "../../guide/links"

export function IndicatorHelp({ label, topic }: { label: string; topic?: string }) {
  const id = topic || indicatorGuideLinks[label]
  if (!id) return null
  return <Link href={"/guide#" + id} aria-label={"Cómo interpretar " + label} title={"Guía: " + label} className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 text-xs normal-case tracking-normal text-cyan-300 hover:bg-cyan-500/15 focus-visible:outline-2 focus-visible:outline-cyan-400">ⓘ</Link>
}
