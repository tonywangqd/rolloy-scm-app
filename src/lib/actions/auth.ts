'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export interface AuthResult {
  success: boolean
  error?: string
  data?: {
    userId: string
    email: string
  }
}

/**
 * Sign in with email and password
 * @param email - User email address
 * @param password - User password
 * @returns AuthResult with success status and optional error message
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    if (!data.user) {
      return {
        success: false,
        error: '登录失败，请重试',
      }
    }

    return {
      success: true,
      data: {
        userId: data.user.id,
        email: data.user.email!,
      },
    }
  } catch (error) {
    console.error('Sign in error:', error)
    return {
      success: false,
      error: '登录时发生错误，请稍后重试',
    }
  }
}

/**
 * Sign out the current user and redirect to login page
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()

    // Clear all auth cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    allCookies.forEach(cookie => {
      if (cookie.name.startsWith('sb-')) {
        cookieStore.delete(cookie.name)
      }
    })
  } catch (error) {
    console.error('Sign out error:', error)
  }

  redirect('/login')
}

/**
 * Get the current authenticated user
 * @returns User data or null if not authenticated
 */
export async function getCurrentUser() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return {
      id: user.id,
      email: user.email!,
      metadata: user.user_metadata,
    }
  } catch (error) {
    console.error('Get current user error:', error)
    return null
  }
}
