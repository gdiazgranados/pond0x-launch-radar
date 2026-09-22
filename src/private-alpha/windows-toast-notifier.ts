import { execFile } from "node:child_process"

import type {
  MaxAttentionDecisionTicket,
} from "./max-attention-decision-ticket"

const MAX_TOASTS_PER_CYCLE = 3
const MAX_LINE_LENGTH = 180

type ToastExecutor = (input: {
  executable: string
  args: ReadonlyArray<string>
  env: NodeJS.ProcessEnv
}) => Promise<void>

export type WindowsToastResult = {
  status: "SENT" | "SKIPPED_EMPTY" | "SKIPPED_UNSUPPORTED"
  sentCount: number
}

function compact(value: string | null, fallback: string) {
  const normalized = value?.replace(/\s+/g, " ").trim() || fallback
  return normalized.slice(0, MAX_LINE_LENGTH)
}

function encodedPowerShell(script: string) {
  return Buffer.from(script, "utf16le").toString("base64")
}

const TOAST_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:PONDOX_TOAST_PAYLOAD))",
  "$payload = $json | ConvertFrom-Json",
  "$title = [Security.SecurityElement]::Escape([string]$payload.title)",
  "$line1 = [Security.SecurityElement]::Escape([string]$payload.line1)",
  "$line2 = [Security.SecurityElement]::Escape([string]$payload.line2)",
  "$xmlText = \"<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$line1</text><text>$line2</text></binding></visual></toast>\"",
  "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
  "[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
  "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
  "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
  "$xml.LoadXml($xmlText)",
  "$toast = New-Object Windows.UI.Notifications.ToastNotification $xml",
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Pond0x.LaunchRadar').Show($toast)",
].join("; ")

const defaultExecutor: ToastExecutor = input =>
  new Promise((resolve, reject) => {
    execFile(
      input.executable,
      [...input.args],
      {
        env: input.env,
        windowsHide: true,
        timeout: 10_000,
      },
      error => error ? reject(error) : resolve()
    )
  })

function payload(ticket: MaxAttentionDecisionTicket) {
  const symbol = compact(ticket.identity.symbol, "Unknown token")
  const trigger = ticket.trigger === "NEW" ? "NEW" : "REAPPEARED"
  const route = ticket.route.status === "ROUTE_AVAILABLE"
    ? compact(ticket.route.routeId, "Route available")
    : ticket.route.status
  return {
    title: `Pond0x MAX · ${trigger} · ${symbol}`,
    line1: compact(
      `Position #${ticket.attention.latestPosition} · ${ticket.status}`,
      ticket.status
    ),
    line2: compact(
      `On-chain: ${ticket.onchain.status} · Jupiter: ${route}`,
      "Validation pending"
    ),
  }
}

export async function notifyMaxAttentionWindows(input: {
  tickets: ReadonlyArray<MaxAttentionDecisionTicket>
  platform?: NodeJS.Platform
  executor?: ToastExecutor
  env?: NodeJS.ProcessEnv
}): Promise<WindowsToastResult> {
  if (input.tickets.length === 0) {
    return { status: "SKIPPED_EMPTY", sentCount: 0 }
  }
  if ((input.platform ?? process.platform) !== "win32") {
    return { status: "SKIPPED_UNSUPPORTED", sentCount: 0 }
  }

  const executor = input.executor ?? defaultExecutor
  const baseEnv = input.env ?? process.env
  let sentCount = 0
  for (const ticket of input.tickets.slice(0, MAX_TOASTS_PER_CYCLE)) {
    const toastPayload = Buffer.from(
      JSON.stringify(payload(ticket)),
      "utf8"
    ).toString("base64")
    await executor({
      executable: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodedPowerShell(TOAST_SCRIPT),
      ],
      env: {
        ...baseEnv,
        PONDOX_TOAST_PAYLOAD: toastPayload,
      },
    })
    sentCount += 1
  }
  return { status: "SENT", sentCount }
}
