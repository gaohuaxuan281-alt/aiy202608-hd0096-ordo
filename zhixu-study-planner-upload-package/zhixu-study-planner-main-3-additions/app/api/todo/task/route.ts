import { findUserByCookieHeader } from "../../../../lib/auth";
import {
  buildTodoSnapshot,
  updateStudyPlanTaskStatus,
} from "../../../../lib/study-plan-store";
import type { StudyPlanTaskStatus } from "../../../../lib/study-plan-types";

type TodoTaskUpdatePayload = {
  taskId?: unknown;
  status?: unknown;
};

function isAllowedStatus(value: unknown): value is StudyPlanTaskStatus {
  return value === "pending" || value === "completed";
}

export async function PATCH(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  let payload: TodoTaskUpdatePayload;
  try {
    payload = (await request.json()) as TodoTaskUpdatePayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const taskId = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
  if (!taskId) {
    return Response.json({ error: "没有找到要更新的任务。" }, { status: 400 });
  }
  if (!isAllowedStatus(payload.status)) {
    return Response.json({ error: "只支持完成和撤回完成两种操作。" }, { status: 400 });
  }

  try {
    const plan = await updateStudyPlanTaskStatus({
      userId: user.id,
      taskId,
      status: payload.status,
    });
    return Response.json(
      { snapshot: buildTodoSnapshot(plan) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "STUDY_PLAN_NOT_FOUND") {
      return Response.json({ error: "请先生成 Timeline 计划。" }, { status: 404 });
    }
    if (code === "STUDY_PLAN_TASK_NOT_FOUND") {
      return Response.json({ error: "没有找到这个 Todo 任务。" }, { status: 404 });
    }
    console.error("Failed to update todo task status", error);
    return Response.json({ error: "任务状态暂时没有更新成功，请稍后重试。" }, { status: 500 });
  }
}
