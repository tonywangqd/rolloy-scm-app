import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

/**
 * Auth check result - success case with user
 */
type AuthSuccess = {
  user: User
  error?: never
}

/**
 * Auth check result - error case
 */
type AuthError = {
  user?: never
  error: string
}

/**
 * Result type for auth checks
 */
type AuthResult = AuthSuccess | AuthError

/**
 * Require authentication for Server Actions
 *
 * This helper function:
 * 1. Gets the current user from Supabase
 * 2. Returns user object if authenticated
 * 3. Returns error message if not authenticated
 *
 * Usage in Server Actions:
 * ```typescript
 * export async function myAction() {
 *   const authResult = await requireAuth()
 *   if (authResult.error) {
 *     return { success: false, error: authResult.error }
 *   }
 *   const { user } = authResult
 *   // ... proceed with authenticated logic
 * }
 * ```
 *
 * @returns Promise resolving to AuthResult with user or error
 */
export async function requireAuth(): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      return {
        error: `Authentication error: ${error.message}`,
      }
    }

    if (!user) {
      return {
        error: 'Authentication required. Please log in.',
      }
    }

    return { user }
  } catch (err) {
    return {
      error: `Authentication check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
