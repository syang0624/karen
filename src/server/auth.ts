import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "karen_user";
let developmentSecret: string | undefined;

function secret() {
  const value = process.env.KAREN_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("KAREN_SESSION_SECRET is required in production");
  }
  developmentSecret ??= randomUUID();
  return developmentSecret;
}

function sign(userId: string) {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}

function parseCookies(header: string | null) {
  return new Map(
    (header ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      })
  );
}

function verifyCookie(value: string | undefined) {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator === -1) return null;
  const userId = value.slice(0, separator);
  const received = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(userId));
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }
  return userId;
}

export function resolveUser(request: Request): {
  userId: string;
  setCookie: string | null;
} {
  const cookieValue = parseCookies(request.headers.get("cookie")).get(COOKIE_NAME);
  const existing = verifyCookie(cookieValue);
  if (existing) return { userId: existing, setCookie: null };

  const userId = `usr_${randomUUID()}`;
  const value = `${userId}.${sign(userId)}`;
  return {
    userId,
    setCookie: `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  };
}
