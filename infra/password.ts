import { compare, hash } from "bcrypt";

export async function hashPassword(unhashedPassword: string) {
  return hash(unhashedPassword, 10);
}

export async function checkPasswordHash(
  unhashedPassword: string,
  hashedPassword: string
) {
  return compare(unhashedPassword, hashedPassword);
}
