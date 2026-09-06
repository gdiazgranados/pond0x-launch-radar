const test = require("node:test")
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")

function source(path) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

test("radar API uses stable upstream URLs and shared CDN caching", () => {
  const route = source("app/api/radar/route.ts")

  assert.equal(route.includes("?t=${Date.now()}"), false)
  assert.equal(route.includes('cache: "no-store"'), false)
  assert.match(route, /next: \{ revalidate: 60 \}/)
  assert.match(
    route,
    /s-maxage=60, stale-while-revalidate=300/
  )
})

test("radar API excludes unused heavy historical artifacts", () => {
  const route = source("app/api/radar/route.ts")
  const excluded = [
    "historical-replay.json",
    "route-api-intelligence.json",
    "calibration-report.json",
    "ground-truth-events.json",
    "historical-evidence-archive.json",
    "pre-event-signature-intelligence.json",
  ]

  for (const file of excluded) {
    assert.equal(route.includes(file), false, file)
  }
})

test("radar API bounds recipients and avoids duplicate response fields", () => {
  const route = source("app/api/radar/route.ts")
  const responseLine = route
    .split("\n")
    .find((line) =>
      line.includes("return NextResponse.json({ evidenceLedger")
    )

  assert.match(route, /\.slice\(0, 10\)/)
  assert.ok(responseLine)
  assert.equal(
    responseLine.includes(
      "chainBaseline, rewardRecipients, systemHealth"
    ),
    false
  )
  assert.equal(
    responseLine.includes(
      "telegramHealth, distributorIntelligence, miningIntelligence"
    ),
    false
  )
})

test("the browser performs one cacheable radar poll", () => {
  const hook = source("app/hooks/useRadarData.ts")
  const page = source("app/page.tsx")

  assert.equal(hook.includes("/api/radar?ts="), false)
  assert.equal(hook.includes('cache: "no-store"'), false)
  assert.equal(hook.includes('"Cache-Control": "no-cache"'), false)
  assert.equal(page.includes("useSentinelData"), false)
  assert.match(page, /sentinelEvents\[0\] \?\? null/)
})
