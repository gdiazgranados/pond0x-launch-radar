"use client"

import { useEffect, useState } from "react"
import { CalibrationLearningPanel } from "./CalibrationLearningPanel"

export function CalibrationLearningMount() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch(`/api/radar?t=${Date.now()}`, { cache: "no-store" })
        if (!res.ok) return
        const payload = await res.json()
        if (active) setData(payload?.latest || null)
      } catch {
        // Keep the calibration panel hidden if the API is temporarily unavailable.
      }
    }
    load()
    const timer = setInterval(load, 60_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  if (!data?.thresholdDriftReport) return null

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-6 lg:px-8 2xl:px-10">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <CalibrationLearningPanel data={data} />
      </div>
    </div>
  )
}
