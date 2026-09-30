import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// تشفير الباسورد (للمالك والمدير)
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPasswordHash(password: string, hash: string): boolean {
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

// تشفير الـ PIN (للكاشير — 4 أرقام)
export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, SALT_ROUNDS);
}

export function verifyPinHash(pin: string, hash: string): boolean {
  if (!hash) return false;
  return bcrypt.compareSync(pin, hash);
}
