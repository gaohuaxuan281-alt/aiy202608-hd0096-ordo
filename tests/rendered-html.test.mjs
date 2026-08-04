import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("unauthenticated visitors see the phone login gateway", async () => {
  const [layout, portal] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AuthPortal.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /user \? <AppShell user=\{user\}>/);
  assert.match(layout, /: <AuthPortal \/>/);
  assert.match(portal, /欢迎回来/);
  assert.match(portal, /登录并进入知序/);
  assert.match(portal, /立即注册/);
  assert.match(portal, /confirmPassword/);
});

test("account implementation keeps passwords hashed and sessions server-only", async () => {
  const [authSource, loginSource, registerSource, hostingConfig] = await Promise.all([
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(authSource, /PBKDF2/);
  assert.match(authSource, /SHA-256/);
  assert.match(authSource, /PASSWORD_ITERATIONS = 100_000/);
  assert.doesNotMatch(authSource, /PASSWORD_ITERATIONS = 210_000/);
  assert.match(authSource, /HttpOnly/);
  assert.match(loginSource, /verifyPassword/);
  assert.match(registerSource, /confirmPassword/);
  assert.deepEqual(JSON.parse(hostingConfig).d1, "DB");
});
