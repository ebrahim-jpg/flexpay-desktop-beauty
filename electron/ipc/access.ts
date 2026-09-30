import { usersRepository } from "../repositories/users.repository";
import { getCurrentActor } from "./session";
import { effectivePermissions } from "../../shared/permissions";
import type { SafeUser } from "../../types/ipc.types";

// فحص الصلاحية في الـmain — إخفاء كارت في الواجهة مش حماية، أي حد يقدر ينده القناة.
export function requireActor(): SafeUser {
  const id = getCurrentActor();
  if (id == null) throw new Error("لازم تسجّل دخول الأول");
  const user = usersRepository.getById(id);
  if (!user) throw new Error("المستخدم غير موجود");
  return user;
}

export function can(user: SafeUser, key: keyof SafeUser["permissions"]): boolean {
  if (user.role === "owner") return true;
  return !!effectivePermissions(user.role, user.permissions)[key];
}

// أرقام المبيعات والفواتير المجمّعة للمالك/المدير بس — موظف الصالة مايشوفش فلوس اليوم
export function requireReports(): SafeUser {
  const user = requireActor();
  if (!can(user, "canViewReports")) throw new Error("أرقام المبيعات للمدير أو المالك بس");
  return user;
}
