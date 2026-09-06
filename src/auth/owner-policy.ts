export type VerifiedUser = {
  id: string
  email?: string
  email_confirmed_at?: string
  is_anonymous?: boolean
}

// Call only with a user verified by the Supabase Auth server.
export function isPrivateOwner(
  user: VerifiedUser | null,
  configuredEmail?: string,
  configuredUserId?: string
) {
  return Boolean(
    user &&
      configuredEmail &&
      configuredUserId &&
      !user.is_anonymous &&
      user.email_confirmed_at &&
      user.id === configuredUserId &&
      user.email?.toLowerCase() === configuredEmail.trim().toLowerCase()
  )
}

export function privateAuthConfigured() {
  return Boolean(
    process.env.PRIVATE_OWNER_EMAIL &&
      process.env.PRIVATE_OWNER_USER_ID &&
      process.env.PRIVATE_AUTH_ORIGIN &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}
