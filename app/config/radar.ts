export const RADAR_TIMEZONE = "America/Mexico_City" as const

export const RADAR_LEVELS = {
  NONE: "NONE",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  VERY_HIGH: "VERY HIGH",
} as const

export const RADAR_SIGNIFICANCE = {
  NONE: "NONE",
  LOW: "LOW",
  WATCH: "WATCH",
  HIGH: "HIGH",
} as const

export const RADAR_FOCUS_AREAS = {
  REWARDS: "REWARDS",
  AUTH: "AUTH",
  WALLET: "WALLET",
  ACCOUNT: "ACCOUNT",
  SYSTEM: "SYSTEM",
  CLAIM: "CLAIM",
  PORTAL: "PORTAL",
  TRADING: "TRADING",
  XP: "XP",
  POINTS: "POINTS",
} as const

export type RadarLevel =
  (typeof RADAR_LEVELS)[keyof typeof RADAR_LEVELS]

export type RadarSignificance =
  (typeof RADAR_SIGNIFICANCE)[keyof typeof RADAR_SIGNIFICANCE]

export type RadarFocusArea =
  (typeof RADAR_FOCUS_AREAS)[keyof typeof RADAR_FOCUS_AREAS]

export const RADAR_KEYWORDS: Record<RadarFocusArea, string[]> = {
  REWARDS: [
    "reward",
    "rewards",
    "bonus",
    "earn",
    "earning",
    "earnings",
    "redeem",
    "redemption",
    "airdrop",
    "distribution",
    "payout",
  ],
  AUTH: [
    "auth",
    "login",
    "log in",
    "sign-in",
    "sign in",
    "verify",
    "verification",
    "session",
    "credential",
    "access",
    "otp",
  ],
  WALLET: [
    "wallet",
    "connect",
    "disconnect",
    "address",
    "signature",
    "signed",
    "signedmessage",
    "signed message",
    "ethereum",
    "solana",
    "metamask",
    "phantom",
  ],
  ACCOUNT: [
    "account",
    "profile",
    "settings",
    "dashboard",
    "user",
    "identity",
    "member",
  ],
  SYSTEM: [
    "status",
    "health",
    "heartbeat",
    "monitor",
    "monitoring",
    "maintenance",
    "uptime",
  ],
  CLAIM: [
    "claim",
    "claims",
    "claimable",
    "redeem",
    "redeemable",
    "collect",
    "collectible",
  ],
  PORTAL: [
    "portal",
    "home",
    "landing",
    "surface",
    "entry",
    "terminal",
  ],
  TRADING: [
    "trade",
    "trading",
    "swap",
    "buy",
    "sell",
    "pair",
    "liquidity",
    "pool",
    "chart",
  ],
  XP: [
    "xp",
    "experience",
    "level",
    "rank",
    "badge",
    "progress",
    "streak",
  ],
  POINTS: [
    "point",
    "points",
    "score",
    "leaderboard",
    "rankings",
  ],
}

export const RADAR_CHANGE_TYPE_KEYWORDS = {
  route: [
    "route",
    "path",
    "slug",
    "page",
    "screen",
    "navigate",
  ],
  component: [
    "component",
    "widget",
    "card",
    "modal",
    "panel",
    "section",
  ],
  text: [
    "text",
    "label",
    "copy",
    "message",
    "title",
    "subtitle",
    "description",
    "summary",
  ],
  button: [
    "button",
    "cta",
    "click",
    "submit",
    "action",
  ],
  form: [
    "form",
    "input",
    "field",
    "checkbox",
    "select",
    "dropdown",
  ],
  api: [
    "api",
    "endpoint",
    "fetch",
    "request",
    "response",
    "graphql",
  ],
  config: [
    "config",
    "setting",
    "env",
    "feature flag",
    "feature_flag",
    "toggle",
  ],
  asset: [
    "image",
    "icon",
    "logo",
    "svg",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "asset",
  ],
  style: [
    "style",
    "css",
    "tailwind",
    "class",
    "theme",
    "spacing",
    "padding",
    "margin",
    "color",
  ],
} as const

export type RadarChangeType = keyof typeof RADAR_CHANGE_TYPE_KEYWORDS

export const RADAR_SCORE_WEIGHTS = {
  movementPct: 0.35,
  changedPct: 0.2,
  addedPct: 0.15,
  movementCountUnit: 3,
  movementCountCap: 10,
} as const

export const RADAR_SENSITIVITY_BONUS: Record<RadarFocusArea, number> = {
  REWARDS: 20,
  AUTH: 15,
  WALLET: 15,
  ACCOUNT: 10,
  SYSTEM: 5,
  CLAIM: 20,
  PORTAL: 5,
  TRADING: 10,
  XP: 10,
  POINTS: 10,
}

export const RADAR_RARITY_RULES = {
  quietSnapshotsShort: 3,
  quietSnapshotsLong: 6,
  bonusShortQuietBreak: 20,
  bonusLongQuietBreak: 30,
} as const

export const RADAR_PERSISTENCE_RULES = {
  repeatedFocusBonus: 10,
  repeatedFocusTrendBonus: 15,
  minimumRepeatedSnapshots: 2,
} as const

export const RADAR_NOISE_PENALTIES = {
  styleOnly: 10,
  assetOnly: 15,
  cosmeticHeavy: 20,
} as const

export const RADAR_SIGNIFICANCE_THRESHOLDS = {
  none: 0,
  lowMax: 24,
  watchMax: 54,
  highMin: 55,
} as const

export const RADAR_ALERT_RULES = {
  highSignificanceAlways: true,
  rewardsFocusAlwaysWatch: true,
  claimFocusAlwaysWatch: true,
  rarityHighThreshold: 70,
  requireDeduplication: true,
} as const

export const RADAR_STABLE_COPY = {
  signalType: "NO SIGNAL",
  launchState: "DORMANT",
  insight: "Surface stable. No actionable changes detected.",
  note: "Baseline intact. Monitoring for deviations in rewards, auth, and wallet-related flows.",
} as const