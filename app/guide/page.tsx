import type { Metadata } from "next"
import { Guide } from "./Guide"

export const metadata: Metadata = {
  title: "Guía de indicadores / Q&A | Pond0x Radar",
  description: "Fórmulas, fuentes, ejemplos y límites de los indicadores de Pond0x Radar.",
}
export default function GuidePage() { return <Guide /> }
