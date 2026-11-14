
import { Roles } from "@/types/globals";
import { getAuthSession } from "@/lib/auth";

export const checkRole = async (role: Roles): Promise<boolean> => {
  const session = await getAuthSession();
  if (!session) return false;
  return session.role === role;
};

// export const isAdmin = await checkRole("admin");
// export const isMember = await checkRole("member");
