// الجلسة الحالية في الـ Main Process — تُضبط عند تسجيل الدخول.
// تُستخدم لتسجيل created_by / updated_by على العمليات.
let currentActorId: number | null = null;

export function setCurrentActor(userId: number | null): void {
  currentActorId = userId;
}

export function getCurrentActor(): number | null {
  return currentActorId;
}
