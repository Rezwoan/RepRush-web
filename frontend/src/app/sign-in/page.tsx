import { redirect } from 'next/navigation';

/**
 * `/sign-in` was a second sign-in page with the same email and password fields
 * as `/login`. Two doors, no way to tell which was yours.
 *
 * `/login` is the survivor: it is the URL every existing account has bookmarked,
 * the one v1's links and the invite emails point at, and the one `?next=` and
 * the `?token=` activation flow already understand. Clerk lives there now with
 * hash routing, so it needs no catch-all of its own.
 */
export default function SignInRedirect() {
  redirect('/login');
}
