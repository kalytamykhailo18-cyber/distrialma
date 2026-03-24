import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isStaffUser } from "@/lib/permissions";

/**
 * Require the user to be a staff member (admin or staff role).
 * Returns the session if authorized, null otherwise.
 */
export async function requireStaff() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const role = (session.user as { role?: string }).role;
  if (!isStaffUser(role)) return null;
  return session;
}
