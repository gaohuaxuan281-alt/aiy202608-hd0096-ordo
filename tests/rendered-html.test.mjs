import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("unauthenticated visitors see the phone login gateway and new users enter onboarding", async () => {
  const [layout, portal, questionnaire] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AuthPortal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/onboarding/LearningQuestionnaire.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /!user \? \(/);
  assert.match(layout, /<AuthPortal \/>/);
  assert.match(layout, /!learningProfile \? \(/);
  assert.match(layout, /<LearningQuestionnaire initialProfile=\{null\}/);
  assert.match(portal, /欢迎回来/);
  assert.match(portal, /登录并进入知序/);
  assert.match(portal, /立即注册/);
  assert.match(portal, /confirmPassword/);
  assert.match(questionnaire, /你现在读几年级/);
  assert.match(questionnaire, /这次想规划哪些科目/);
  assert.match(questionnaire, /你正在使用哪套教材/);
  assert.match(questionnaire, /api\/account\/learning-profile/);
});

test("learning catalog covers primary grade one through senior grade three with common textbooks", async () => {
  const [catalog, learningRoute, schema] = await Promise.all([
    readFile(new URL("../config/learning-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/learning-profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /id: "p1", label: "一年级"/);
  assert.match(catalog, /id: "h3", label: "高三"/);
  assert.match(catalog, /人教 PEP 版/);
  assert.match(catalog, /人教 A 版/);
  assert.match(catalog, /统编版/);
  assert.match(learningRoute, /getSubjectsForGrade/);
  assert.match(learningRoute, /getTextbookLabel/);
  assert.match(schema, /userLearningProfiles/);
  assert.match(schema, /userSubjectPreferences/);
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

test("user center supports durable profiles, editable learning settings, password changes, and a non-paying membership demo", async () => {
  const [profilePage, profileRoute, passwordRoute, profileService] = await Promise.all([
    readFile(new URL("../features/profile/ProfilePage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/password/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/profile.ts", import.meta.url), "utf8"),
  ]);

  assert.match(profilePage, /编辑个人资料/);
  assert.match(profilePage, /学习档案/);
  assert.match(profilePage, /重新设置/);
  assert.match(profilePage, /修改登录密码/);
  assert.match(profilePage, /充值会员（演示）/);
  assert.match(profilePage, /不会扣款/);
  assert.doesNotMatch(profilePage, /api\/(payment|pay|checkout)/i);
  assert.match(profileRoute, /saveUserProfile/);
  assert.match(profileService, /ON CONFLICT\(user_id\) DO UPDATE/);
  assert.match(passwordRoute, /verifyPassword/);
  assert.match(passwordRoute, /updatePassword/);
});
