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

test("all product modules share one authenticated and server-only OpenAI service", async () => {
  const [
    aiConfig,
    aiRoute,
    openaiService,
    appShell,
    tutorWorkspace,
    featureScaffold,
    schema,
  ] = await Promise.all([
    readFile(new URL("../config/ai.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/respond/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/openai.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/ai-tutor/AITutorWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/shared/FeatureScaffold.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);

  for (const moduleName of ["home", "timeline", "todo", "ai-tutor", "journal", "summary", "insights", "profile"]) {
    assert.match(aiConfig, new RegExp(`(?:"${moduleName}"|${moduleName}):`));
  }
  assert.match(aiRoute, /findUserByCookieHeader/);
  assert.match(aiRoute, /countRecentAIRequests/);
  assert.match(aiRoute, /getLearningProfile/);
  assert.match(openaiService, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(openaiService, /OPENAI_API_KEY/);
  assert.match(openaiService, /store: false/);
  assert.match(openaiService, /safety_identifier/);
  assert.match(appShell, /GlobalAIAssistant/);
  assert.match(tutorWorkspace, /useAIConversation\("ai-tutor"\)/);
  assert.match(featureScaffold, /zhixu:open-ai/);
  assert.match(schema, /aiConversations/);
  assert.match(schema, /aiMessages/);
});

test("homepage is a complete read-only aggregation surface with replaceable module adapters", async () => {
  const [route, homePage, homeData, homeTypes, architecture] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/home/HomePage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/home/home-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/home/home-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/ARCHITECTURE.md", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getHomeDashboardSnapshot/);
  assert.match(route, /<HomePage snapshot=\{snapshot\}/);
  assert.match(homeTypes, /HomeDashboardAdapters/);
  assert.match(homeData, /placeholderHomeAdapters/);
  assert.match(homeData, /Promise\.all/);
  assert.match(homeData, /currentExam: "timeline"/);
  assert.match(homeData, /todayProgress: "todo"/);
  assert.match(homeData, /subjectProgress: "insights"/);

  for (const label of [
    "当前考试",
    "今日完成进度",
    "下一项",
    "今天剩余可用时间",
    "当前最大风险",
    "最近发生的计划变化",
    "待确认调整",
    "各科进展摘要",
    "AI Tutor 快速入口",
    "每日反馈总结",
    "快速新建任务",
    "进入 Timeline",
    "进入今日 Todo",
  ]) {
    assert.match(homePage, new RegExp(label));
  }
  assert.match(homePage, /只有在 Timeline 中确认后/);
  assert.match(architecture, /首页不建立独立业务表/);
});

test("journal is an append-only operation center with durable events, filtering, details, and export", async () => {
  const [route, journalPage, journalData, journalTypes, journalStore, schema, loginRoute, architecture] = await Promise.all([
    readFile(new URL("../app/journal/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/journal/JournalPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/journal/journal-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/journal/journal-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/journal-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/ARCHITECTURE.md", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getJournalSnapshot/);
  assert.match(route, /<JournalPage snapshot=\{snapshot\}/);
  assert.match(journalTypes, /JournalDataAdapter/);
  assert.match(journalTypes, /correctionOf/);
  assert.match(journalData, /placeholderJournalAdapter/);
  assert.match(journalData, /createD1JournalAdapter/);
  assert.match(journalData, /JOURNAL_EVENT_CATALOG/);
  assert.match(journalStore, /appendJournalEntry/);
  assert.match(journalStore, /WHERE user_id = \?/);
  assert.match(journalStore, /SENSITIVE_TEXT/);
  assert.match(schema, /journalEntries/);
  assert.match(loginRoute, /appendJournalEntryBestEffort/);

  for (const eventName of [
    "TaskCreated",
    "TaskUpdated",
    "TaskDeleted",
    "TaskStarted",
    "TaskPaused",
    "TaskCompleted",
    "TaskDelayed",
    "TimelineAdjusted",
    "AdjustmentAccepted",
    "AdjustmentRejected",
    "DailyFeedbackCompleted",
    "TutorSessionCompleted",
    "MasteryChanged",
    "MembershipChanged",
    "AccountSignedIn",
    "AccountSecurityChanged",
  ]) {
    assert.match(journalData, new RegExp(eventName));
  }

  for (const label of [
    "导出日志",
    "搜索任务、对象、原因或操作",
    "全部模块",
    "全部操作者",
    "详细变化",
    "修改原因",
    "涉及模块",
    "是否可撤销",
    "准备纠正记录",
    "历史日志不可编辑",
  ]) {
    assert.match(journalPage, new RegExp(label));
  }

  assert.match(journalPage, /URL\.createObjectURL/);
  assert.match(architecture, /日志采用追加式模型/);
  assert.match(architecture, /不得把密码、会话令牌、完整手机号/);
});
