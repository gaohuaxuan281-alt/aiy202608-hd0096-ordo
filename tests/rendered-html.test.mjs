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
  assert.match(layout, /hasCompleteExamPlan\(learningProfile\)/);
  assert.match(layout, /hasCompletedDiagnosticQuizForProfile\(learningProfile, diagnosticResult\)/);
  assert.match(layout, /!onboardingComplete \? \(/);
  assert.match(layout, /<LearningQuestionnaire initialProfile=\{learningProfile\}/);
  assert.match(portal, /欢迎回来/);
  assert.match(portal, /登录并进入知序/);
  assert.match(portal, /立即注册/);
  assert.match(portal, /confirmPassword/);
  assert.match(questionnaire, /你现在读几年级/);
  assert.match(questionnaire, /这次想规划哪些科目/);
  assert.match(questionnaire, /你正在使用哪套教材/);
  assert.match(questionnaire, /计划什么时候考试/);
  assert.match(questionnaire, /这次考试考哪些 Unit/);
  assert.match(questionnaire, /你每天准备几点到几点学习/);
  assert.match(questionnaire, /补充说明/);
  assert.match(questionnaire, /下周考试/);
  assert.match(questionnaire, /Unit 1–3/);
  assert.match(questionnaire, /用 10 题找到真正的复习重点/);
  assert.match(questionnaire, /共 7 步/);
  assert.match(questionnaire, /api\/onboarding\/diagnostic-quiz\/generate/);
  assert.match(questionnaire, /api\/timeline\/plan/);
  assert.match(layout, /<InitialTimelineBootstrap \/>/);
});

test("learning catalog and exam plan cover grade one through senior three with durable textbook unit ranges", async () => {
  const [catalog, questionnaire, learningRoute, learningService, examPlan, schema, migration] = await Promise.all([
    readFile(new URL("../config/learning-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/onboarding/LearningQuestionnaire.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/learning-profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/learning-profile.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/exam-plan.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_yielding_misty_knight.sql", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /id: "p1", label: "一年级"/);
  assert.match(catalog, /id: "h3", label: "高三"/);
  assert.match(catalog, /人教 PEP 版/);
  assert.match(catalog, /人教 A 版/);
  assert.match(catalog, /统编版/);
  assert.match(learningRoute, /parseLearningProfileInput/);
  assert.match(questionnaire, /examUnitStart/);
  assert.match(questionnaire, /examUnitEnd/);
  assert.match(examPlan, /MAX_EXAM_UNIT = 20/);
  assert.match(learningService, /hasCompleteExamPlan/);
  assert.match(schema, /userLearningProfiles/);
  assert.match(schema, /userSubjectPreferences/);
  assert.match(schema, /examDate: text\("exam_date"\)/);
  assert.match(schema, /examUnitStart: integer\("exam_unit_start"\)/);
  assert.match(migration, /ADD `exam_date` text/);
  assert.match(migration, /ADD `exam_unit_start` integer/);
});

test("onboarding stores the study window and recovers initial timeline creation", async () => {
  const [
    questionnaire,
    recovery,
    profileService,
    profileInput,
    initialPlan,
    timelineRoute,
    schema,
    runtimeSchema,
    migration,
    generator,
    layout,
    planStore,
    generationMigration,
  ] = await Promise.all([
    readFile(new URL("../features/onboarding/LearningQuestionnaire.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/onboarding/InitialTimelineBootstrap.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/learning-profile.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/learning-profile-input.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/initial-study-plan.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/timeline/plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0011_slim_dracula.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/study-plan/generator.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/study-plan/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0012_lean_mastermind.sql", import.meta.url), "utf8"),
  ]);

  for (const field of ["dailyStudyStart", "dailyStudyEnd", "additionalNotes"]) {
    assert.match(questionnaire, new RegExp(field));
    assert.match(profileService, new RegExp(field));
    assert.match(profileInput, new RegExp(field));
  }
  assert.match(questionnaire, /source: "onboarding"/);
  assert.match(questionnaire, /重新生成首个 Timeline/);
  assert.match(recovery, /source: "onboarding"/);
  assert.match(recovery, /window\.location\.replace\("\/timeline"\)/);
  assert.match(initialPlan, /dailyAvailableMinutes/);
  assert.match(initialPlan, /任务不得超出这个区间/);
  assert.match(timelineRoute, /hasCompletedDiagnosticQuizForProfile/);
  assert.match(timelineRoute, /reserveStudyPlanGeneration/);
  assert.match(timelineRoute, /status: 202/);
  assert.match(timelineRoute, /retryAfterMs/);
  assert.match(planStore, /INSERT OR IGNORE INTO study_plans/);
  assert.match(planStore, /generation_status = 'completed'/);
  assert.match(planStore, /AND lease_token = \?/);
  assert.match(schema, /generationKey: text\("generation_key"\)/);
  assert.match(schema, /generationStatus: text\("generation_status"\).*default\("completed"\)/);
  assert.match(generationMigration, /ADD `generation_key` text/);
  assert.match(generationMigration, /study_plans_generation_key_unique/);
  assert.match(schema, /dailyStudyStart: text\("daily_study_start"\)/);
  assert.match(runtimeSchema, /ALTER TABLE user_learning_profiles ADD COLUMN daily_study_start TEXT/);
  assert.match(migration, /ADD `daily_study_start` text/);
  assert.match(migration, /ADD `daily_study_end` text/);
  assert.match(migration, /ADD `additional_notes` text/);
  assert.match(generator, /const breakMinutes =/);
  assert.match(layout, /initialTimelineReady/);
});

test("timeline generates concrete micro tasks with a hard 30 minute ceiling", async () => {
  const [generator, granularity, route, timelinePage, feedbackGenerator, planStore] = await Promise.all([
    readFile(new URL("../lib/study-plan/generator.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/study-plan/granularity.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/timeline/plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/timeline/TimelinePage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/daily-feedback-generator.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/study-plan/store.ts", import.meta.url), "utf8"),
  ]);

  assert.match(granularity, /MIN_TIMELINE_TASK_MINUTES = 10/);
  assert.match(granularity, /PREFERRED_MAX_TIMELINE_TASK_MINUTES = 20/);
  assert.match(granularity, /MAX_TIMELINE_TASK_MINUTES = 30/);
  assert.match(granularity, /splitTimelineTaskDurations/);
  assert.match(generator, /时长优先 10–20 分钟，永远不能超过 30 分钟/);
  assert.match(generator, /完成函数单调性3题并订正/);
  assert.match(generator, /goal 必须写成 2–3 个带序号的执行步骤/);
  assert.match(generator, /completionCriteria 必须可量化、可勾选验收/);
  assert.match(generator, /expandDayBlueprints/);
  assert.match(generator, /durationMinutes: phase === 1/);
  assert.match(route, /onboarding-timeline:v3/);
  assert.match(route, /最多 30 分钟、可以直接照做并能量化验收的微任务/);
  assert.match(timelinePage, /执行步骤：/);
  assert.match(timelinePage, /验收标准：/);
  assert.match(feedbackGenerator, /target\.durationMinutes > MAX_TIMELINE_TASK_MINUTES/);
  assert.match(planStore, /validateGeneratedPlanGranularity/);
  assert.match(planStore, /splitTimelineTaskDurations\(target\.durationMinutes\)/);
});

test("onboarding diagnostic quiz generates 10 AI questions and stores timeline-ready mastery data", async () => {
  const [
    questionnaire,
    quizStep,
    generateRoute,
    completeRoute,
    summaryRoute,
    quizService,
    generator,
    schema,
    migration,
    layout,
    aiRoute,
    timelinePrompt,
    handoff,
  ] = await Promise.all([
    readFile(new URL("../features/onboarding/LearningQuestionnaire.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/onboarding/DiagnosticQuizStep.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/onboarding/diagnostic-quiz/generate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/onboarding/diagnostic-quiz/complete/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/diagnostic-quiz/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/diagnostic-quiz.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/diagnostic-quiz-generator.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_melted_grim_reaper.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/respond/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai-prompts.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/TEAM_HANDOFF.md", import.meta.url), "utf8"),
  ]);

  assert.match(questionnaire, /生成 10 题诊断 Quiz/);
  assert.match(questionnaire, /提交 Quiz/);
  assert.match(quizStep, /考前知识点覆盖诊断/);
  assert.match(quizStep, /薄弱知识点/);
  assert.match(quizStep, /逐题答案与解析/);
  assert.match(generateRoute, /requestOpenAIStructuredResponse/);
  assert.match(generateRoute, /saveGeneratedDiagnosticQuiz/);
  assert.match(generateRoute, /QUIZ_GENERATIONS_PER_HOUR/);
  assert.match(completeRoute, /completeDiagnosticQuiz/);
  assert.match(completeRoute, /saveLearningProfile/);
  assert.match(summaryRoute, /getLatestCompletedDiagnosticQuiz/);
  assert.doesNotMatch(summaryRoute, /correctOption/);
  assert.match(generator, /minItems: 10/);
  assert.match(generator, /buildDiagnosticCoverageTargets/);
  assert.match(generator, /逐题覆盖位置/);
  assert.match(quizService, /getLatestCompletedDiagnosticQuiz/);
  assert.match(quizService, /profileFingerprint/);
  assert.match(schema, /diagnosticQuizAttempts/);
  assert.match(schema, /diagnosticQuizQuestions/);
  assert.match(schema, /diagnosticQuizAnswers/);
  assert.match(migration, /CREATE TABLE `diagnostic_quiz_attempts`/);
  assert.match(layout, /hasCompletedDiagnosticQuizForProfile/);
  assert.match(aiRoute, /诊断薄弱知识点/);
  assert.match(timelinePrompt, /最近 10 题诊断结果/);
  assert.match(handoff, /getLatestCompletedDiagnosticQuiz/);
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
  assert.match(aiRoute, /计划考试日期/);
  assert.match(aiRoute, /考试范围/);
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
  assert.match(homeData, /emptyHomeAdapters/);
  assert.match(homeData, /Promise\.all/);
  assert.match(homeData, /currentExam: "timeline"/);
  assert.match(homeData, /todayProgress: "todo"/);
  assert.match(homeData, /subjectProgress: "insights"/);
  assert.doesNotMatch(homeData, /exam-placeholder|task-placeholder|placeholderHomeAdapters/);
  assert.match(route, /getLatestCompletedDiagnosticQuiz/);
  assert.match(route, /listJournalEntries/);

  for (const label of [
    "当前考试",
    "今日完成进度",
    "下一项",
    "今天剩余可用时间",
    "当前最大风险",
    "最近真实操作记录",
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
  assert.match(homePage, /Todo 暂无可展示任务/);
  assert.match(homePage, /不使用演示数字/);
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

test("daily feedback reads real module context and applies AI proposals only after confirmation", async () => {
  const [
    route,
    adjustmentRoute,
    pageRoute,
    page,
    types,
    store,
    generator,
    planStore,
    schema,
    migration,
    revisionMigration,
    rateLimitMigration,
    homeRoute,
  ] = await Promise.all([
    readFile(new URL("../app/api/summary/daily/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/summary/adjustment/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/summary/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/summary/SummaryPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/summary/summary-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/daily-feedback.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/daily-feedback-generator.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/study-plan/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_easy_kinsey_walden.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0009_sleepy_zarek.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0010_lyrical_falcon.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(pageRoute, /getFeedbackPageSnapshot/);
  assert.match(pageRoute, /initialSnapshot/);
  assert.match(route, /buildFeedbackSystemContext/);
  assert.match(route, /generateDailyFeedbackAnalysis/);
  assert.match(route, /DailyFeedbackCompleted/);
  assert.match(adjustmentRoute, /decideFeedbackAdjustment/);
  assert.match(adjustmentRoute, /AdjustmentAccepted/);
  assert.match(adjustmentRoute, /TimelineAdjusted/);
  assert.match(adjustmentRoute, /AdjustmentRejected/);
  assert.match(store, /getAIModuleUsage/);
  assert.match(store, /listJournalEntries/);
  assert.match(store, /completedMinutesEstimate/);
  assert.match(generator, /actualStudyMinutes 为 null 时必须明确写/);
  assert.match(generator, /只能是待确认建议/);
  assert.match(planStore, /applyFeedbackAdjustment/);
  assert.match(planStore, /version: current\.plan\.version \+ 1/);
  assert.match(types, /awaiting_confirmation/);
  assert.match(schema, /dailyFeedbacks/);
  assert.match(schema, /feedbackAdjustments/);
  assert.match(migration, /CREATE TABLE `daily_feedbacks`/);
  assert.match(migration, /CREATE TABLE `feedback_adjustments`/);
  assert.match(revisionMigration, /ADD `parent_plan_id` text/);
  assert.match(revisionMigration, /study_plans_user_parent_unique/);
  assert.match(rateLimitMigration, /CREATE TABLE `ai_request_events`/);
  assert.match(route, /reserveAIRequest/);
  assert.match(homeRoute, /getHomeSummarySlice/);

  for (const label of [
    "系统已经知道的事",
    "补充只有你知道的情况",
    "语音补充",
    "AI 反馈总结",
    "计划与实际偏差",
    "新发现的薄弱点",
    "明日风险",
    "Timeline 修改草案",
    "确认并应用",
    "暂不采用",
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /不会冒充实际用时/);
  assert.match(page, /草案不会自动修改 Timeline/);
});

test("progress insights aggregates authenticated real data without inventing learning metrics", async () => {
  const [pageRoute, page, apiRoute, store, layout, styles, timelineRoute, planTypes] = await Promise.all([
    readFile(new URL("../app/insights/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/insights/InsightsPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/insights/summary/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/insights-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/insights/insights.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/timeline/plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/study-plan/types.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageRoute, /<InsightsPage \/>/);
  assert.match(page, /api\/insights\/summary/);
  assert.match(page, /zhixu:open-ai/);
  assert.match(page, /当前计划已记录实际投入/);
  assert.match(page, /已完成任务对应计划时长/);
  assert.match(page, /当前计划与执行记录/);
  assert.doesNotMatch(page, /按时完成率/);
  assert.match(apiRoute, /findUserByCookieHeader/);
  assert.match(apiRoute, /Cache-Control/);
  assert.match(apiRoute, /no-store/);
  assert.match(store, /getLatestStudyPlan/);
  assert.match(store, /normalizeSubject/);
  assert.match(store, /subjectByLabel/);
  assert.match(store, /Asia\/Shanghai/);
  assert.match(store, /daily_feedbacks/);
  assert.match(store, /actual_study_minutes/);
  assert.match(store, /createLearningPlanFingerprint/);
  assert.match(store, /planMatchesLearningProfile/);
  assert.match(store, /profile_fingerprint = \?/);
  assert.match(timelineRoute, /learningProfileFingerprint: createStudyPlanProfileFingerprint\(learningProfile\)/);
  assert.match(planTypes, /learningProfileFingerprint\?: string/);
  assert.match(store, /diagnostic_quiz_attempts/);
  assert.match(store, /ai_conversations/);
  assert.match(layout, /features\/insights\/insights\.css/);
  assert.match(styles, /\.insights-metrics-grid/);
});
