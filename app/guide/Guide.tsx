"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { indicators, methodologyRevision } from "./indicators"

const groups = [...new Set(indicators.map(item => item.group))]
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export function Guide() {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState("Todos")
  const [linkedId, setLinkedId] = useState("")
  useEffect(() => {
    const followHash = () => {
      const id = window.location.hash.slice(1)
      if (!indicators.some(item => item.id === id)) return
      setQuery("")
      setGroup("Todos")
      setLinkedId(id)
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }))
    }
    followHash()
    window.addEventListener("hashchange", followHash)
    return () => window.removeEventListener("hashchange", followHash)
  }, [])
  const filtered = indicators.filter(item =>
    (group === "Todos" || item.group === group) &&
    normalize([item.title, ...item.labels, item.meaning, item.calculation, item.limits].join(" ")).includes(normalize(query.trim()))
  )
  return <main className="min-h-screen bg-[#020406] px-4 py-8 text-slate-200 sm:px-8">
    <div className="mx-auto max-w-5xl">
      <nav aria-label="Radar navigation" className="mb-6 flex gap-3">
        <Link href="/" className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:border-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-400">Dashboard</Link>
        <Link href="/guide" aria-current="page" className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">Guía / Q&amp;A</Link>
      </nav>
      <header className="rounded-3xl border border-cyan-500/20 bg-[#071019] p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Pond0x Signal Terminal · Metodología</p>
        <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Guía de indicadores</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">Qué mide cada indicador, cómo se calcula y qué no demuestra. Busca el nombre que ves en el dashboard; los nombres se conservan en inglés y las explicaciones están en español.</p>
        <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-amber-200">Actividad ≠ disponibilidad de claims ≠ lanzamiento. Un score de 144 son puntos; no 144%. Los porcentajes heurísticos no son probabilidades validadas. Telegram permanece en modo observación.</p>
        <p className="mt-4 text-xs text-slate-400">Metodología revisada: 31 de agosto de 2026 (UTC) · Código base <a className="text-cyan-300 underline" href={"https://github.com/gdiazgranados/pond0x-launch-radar/tree/" + methodologyRevision}>{methodologyRevision.slice(0, 7)}</a>. Los enlaces fijan esta versión; no implican actualización automática de la guía.</p>
      </header>
      <section aria-label="Buscar indicadores" className="my-6 rounded-2xl border border-white/10 bg-[#06080b] p-5">
        <label htmlFor="indicator-search" className="mb-2 block text-sm font-medium">Buscar indicador o pregunta</label>
        <input id="indicator-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ej.: Score, rewards, confianza, Telegram…" className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white outline-none focus:border-cyan-400" />
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Categorías">
          {["Todos", ...groups].map(name => <button key={name} type="button" aria-pressed={group === name} onClick={() => setGroup(name)} className={"rounded-full border px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-cyan-400 " + (group === name ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" : "border-white/15 text-slate-300")}>{name}</button>)}
        </div>
        <p className="mt-3 text-xs text-slate-400" role="status">{filtered.length} de {indicators.length} preguntas · Cada pregunta agrupa indicadores relacionados.</p>
      </section>
      {filtered.length === 0 && <div className="rounded-xl border border-white/10 p-6"><p>No encontramos ese término.</p><button type="button" className="mt-3 text-cyan-300 underline" onClick={() => { setQuery(""); setGroup("Todos") }}>Restablecer filtros</button></div>}
      {groups.map(name => {
        const items = filtered.filter(item => item.group === name)
        return items.length ? <section key={name} aria-label={name} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-cyan-200">{name}</h2>
          <div className="space-y-3">{items.map(item => <details key={item.id + (linkedId === item.id ? "-linked" : "")} id={item.id} open={linkedId === item.id || undefined} className="scroll-mt-6 rounded-2xl border border-white/10 bg-[#06080b] p-5">
            <summary className="cursor-pointer text-base font-medium text-white focus-visible:outline-2 focus-visible:outline-cyan-400">{item.title}</summary>
            <p className="mt-3 text-xs leading-5 text-cyan-300">{item.labels.join(" · ")}</p>
            <dl className="mt-4 space-y-4 text-sm leading-6">{[
              ["Qué mide", item.meaning], ["Cómo se calcula / fuente", item.calculation],
              ["Ejemplo", item.example], ["Qué no demuestra", item.limits], ["Relación con Telegram", item.role],
            ].map(([label, value]) => <div key={label}><dt className="font-semibold text-slate-200">{label}</dt><dd className="mt-1 text-slate-400">{value}</dd></div>)}</dl>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <a href={"#" + item.id} aria-label={"Enlace directo: " + item.title} className="text-cyan-300 underline">Enlace a esta pregunta</a>
              {item.sources.map(source => <a key={source} href={"https://github.com/gdiazgranados/pond0x-launch-radar/blob/" + methodologyRevision + "/" + source} className="break-all text-slate-400 underline hover:text-cyan-300">{source}</a>)}
            </div>
          </details>)}</div>
        </section> : null
      })}
      <footer className="border-t border-white/10 py-6 text-xs leading-6 text-slate-400">Los ceros solo describen la ventana y cobertura disponibles. Un dato ausente no equivale a cero. Esta página documenta el sistema; no modifica scores, umbrales ni entregas.</footer>
    </div>
  </main>
}
