import { SignJWT } from "jose";

export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function mintJWT(
  secret: string,
  role: string,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ role, iss: "supabase-slim" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("10y")
    .sign(key);
}
