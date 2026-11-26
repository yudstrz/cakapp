import { headers } from 'next/headers';
import { auth } from './better-auth';

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  created_at?: string;
};

export async function getCurrentUser(): Promise<UserProfile | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      full_name: session.user.name,
      avatar_url: session.user.image ?? null,
    };
  } catch (err) {
    console.error('Failed to get current user:', err);
    return null;
  }
}
