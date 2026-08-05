import { findUserByCookieHeader } from "../../../../lib/auth";
import {
  decideFeedbackAdjustment,
  getFeedbackPageSnapshot,
} from "../../../../lib/daily-feedback";
import { appendJournalEntry } from "../../../../lib/journal-store";

type AdjustmentPayload = {
  adjustmentId?: unknown;
  decision?: unknown;
};

function adjustmentError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "FEEDBACK_ADJUSTMENT_NOT_FOUND") {
    return Response.json({ error: "没有找到这条调整建议。" }, { status: 404 });
  }
  if (code === "FEEDBACK_ADJUSTMENT_FINALIZED") {
    return Response.json({ error: "这条建议已经处理，不能更改决定。" }, { status: 409 });
  }
  if (code === "STUDY_PLAN_CONFLICT") {
    return Response.json(
      { error: "Timeline 在分析后发生了变化，请重新提交反馈后再确认。" },
      { status: 409 },
    );
  }
  if (code === "STUDY_PLAN_NOT_FOUND" || code === "STUDY_PLAN_TASK_NOT_FOUND") {
    return Response.json({ error: "原 Timeline 或目标任务已经不存在，请重新分析。" }, { status: 409 });
  }
  if (code === "STUDY_PLAN_TASK_LOCKED" || code === "STUDY_PLAN_TASK_NOT_ADJUSTABLE") {
    return Response.json({ error: "这项任务已锁定或已开始，不能再按旧建议调整。" }, { status: 409 });
  }
  if (code === "STUDY_PLAN_TASK_OVERLAP") {
    return Response.json({ error: "确认后会与现有任务时间重叠，请重新生成建议。" }, { status: 409 });
  }
  if (code === "STUDY_PLAN_DAILY_BUDGET_EXCEEDED") {
    return Response.json({ error: "确认后会超过当天可用学习时间，请重新生成建议。" }, { status: 409 });
  }
  if (code === "STUDY_PLAN_BOUNDARY_REVIEW_REQUIRED") {
    return Response.json(
      { error: "当前计划的硬边界缺少明确时间，无法安全自动修改；请先在 Timeline 补充时间段。" },
      { status: 409 },
    );
  }
  if (code === "STUDY_PLAN_HARD_BOUNDARY_CONFLICT") {
    return Response.json({ error: "这条建议会占用不可用时间或固定安排，未执行修改。" }, { status: 409 });
  }
  if (code.includes("DEPENDENCY")) {
    return Response.json({ error: "这条建议会破坏任务先后依赖，未执行修改。" }, { status: 409 });
  }
  if (code.startsWith("STUDY_PLAN_")) {
    return Response.json({ error: "这条建议不再符合当前计划约束，请重新分析。" }, { status: 409 });
  }
  console.error("Failed to decide feedback adjustment", error);
  return Response.json({ error: "调整建议暂时没有处理成功，请稍后重试。" }, { status: 500 });
}

export async function POST(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  let payload: AdjustmentPayload;
  try {
    payload = (await request.json()) as AdjustmentPayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }
  const adjustmentId = typeof payload.adjustmentId === "string"
    ? payload.adjustmentId.trim()
    : "";
  const decision = payload.decision === "accepted" || payload.decision === "rejected"
    ? payload.decision
    : null;
  if (!adjustmentId || !decision) {
    return Response.json({ error: "请选择要接受或拒绝的调整建议。" }, { status: 400 });
  }

  try {
    const result = await decideFeedbackAdjustment({
      userId: user.id,
      adjustmentId,
      decision,
    });
    if (decision === "accepted") {
      await appendJournalEntry(user.id, {
        id: `feedback-adjustment-${adjustmentId}-accepted`,
        eventName: "AdjustmentAccepted",
        actorType: "user",
        actorLabel: "你",
        module: "summary",
        moduleLabel: "反馈总结",
        action: "adjustment_accepted",
        actionLabel: "接受调整",
        title: `接受「${result.adjustment.title}」`,
        summary: result.adjustment.description,
        reason: result.adjustment.reason,
        relatedObject: {
          type: "plan",
          id: result.plan?.id ?? adjustmentId,
          label: result.plan
            ? `${result.plan.plan.examName} · 第 ${result.plan.plan.version} 版`
            : "最新 Timeline",
          href: "/timeline",
        },
        changes: [{
          field: "Timeline 调整",
          before: result.adjustment.before,
          after: result.adjustment.after,
        }],
        undoable: false,
      });
      await appendJournalEntry(user.id, {
        id: `feedback-adjustment-${adjustmentId}-timeline`,
        eventName: "TimelineAdjusted",
        actorType: "system",
        actorLabel: "知序系统",
        module: "timeline",
        moduleLabel: "Timeline",
        action: "plan_adjusted",
        actionLabel: "生成新版计划",
        title: `Timeline 已生成第 ${result.plan?.plan.version ?? "新"} 版`,
        summary: "用户确认反馈建议后，系统生成新版 Timeline；Todo 将从最新版自动派生。",
        reason: result.adjustment.reason,
        relatedObject: {
          type: "plan",
          id: result.plan?.id ?? adjustmentId,
          label: result.plan?.plan.examName ?? "最新 Timeline",
          href: "/timeline",
        },
        changes: [{
          field: "计划版本",
          before: result.adjustment.basePlanVersion
            ? `第 ${result.adjustment.basePlanVersion} 版`
            : "原版本",
          after: result.plan ? `第 ${result.plan.plan.version} 版` : "新版本",
        }],
        undoable: false,
      });
    } else {
      await appendJournalEntry(user.id, {
        id: `feedback-adjustment-${adjustmentId}-rejected`,
        eventName: "AdjustmentRejected",
        actorType: "user",
        actorLabel: "你",
        module: "summary",
        moduleLabel: "反馈总结",
        action: "adjustment_rejected",
        actionLabel: "拒绝调整",
        title: `拒绝「${result.adjustment.title}」`,
        summary: "该建议已标记为拒绝，Timeline 保持不变。",
        reason: result.adjustment.reason,
        relatedObject: {
          type: "feedback",
          id: result.adjustment.proposalId ?? adjustmentId,
          label: "每日反馈调整建议",
          href: "/summary",
        },
        changes: [{ field: "建议状态", before: "待确认", after: "已拒绝" }],
        undoable: false,
      });
    }
    const snapshot = await getFeedbackPageSnapshot(user.id);
    return Response.json(
      { snapshot, adjustment: result.adjustment },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adjustmentError(error);
  }
}
