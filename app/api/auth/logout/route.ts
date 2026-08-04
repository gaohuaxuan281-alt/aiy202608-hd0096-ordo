import {
  readSessionToken,
  revokeSession,
  serializeSessionCookie,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const token = readSessionToken(request.headers.get("cookie"));
  try {
    await revokeSession(token);
  } catch (error) {
    console.error("Failed to revoke session", error);
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": serializeSessionCookie(null, request.url),
      },
    },
  );
}
