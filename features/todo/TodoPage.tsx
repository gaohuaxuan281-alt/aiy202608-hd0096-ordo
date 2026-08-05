"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TodoSnapshot, TodoTaskSlice } from "../../lib/study-plan/types";

type TodoResponse = {
  error?: string;
  snapshot?: TodoSnapshot | null;
};

type TodoTaskUpdateResponse = TodoResponse;

function TaskList({
  title,
  tasks,
  emptyText,
  pendingTaskId,
  onToggleTask,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
}: {
  title: string;
  tasks: TodoTaskSlice[];
  emptyText: string;
  pendingTaskId: string | null;
  onToggleTask: (task: TodoTaskSlice) => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <section className="todo-section-card">
      <div className="todo-section-head">
        <h3>{title}</h3>
        <div className="todo-section-head-actions">
          <span>{tasks.length}</span>
          {collapsible ? (
            <button
              className="todo-section-toggle"
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
            >
              {collapsed ? "展开" : "折叠"}
            </button>
          ) : null}
        </div>
      </div>
      {collapsed ? null : tasks.length === 0 ? <p className="todo-empty-inline">{emptyText}</p> : null}
      {!collapsed && tasks.length > 0 ? (
        <div className="todo-list">
          {tasks.map((task) => (
            <article
              key={task.id}
              className={`todo-task-card ${task.priority} ${task.status === "completed" ? "is-completed" : ""}`}
            >
              <button
                className={`todo-check ${task.status === "completed" ? "is-completed" : ""}`}
                type="button"
                onClick={() => onToggleTask(task)}
                disabled={pendingTaskId === task.id}
                aria-label={task.status === "completed" ? `撤回任务“${task.title}”的完成状态` : `将任务“${task.title}”标记为完成`}
                title={task.status === "completed" ? "撤回完成" : "标记完成"}
              >
                {pendingTaskId === task.id ? "…" : task.status === "completed" ? "✓" : "○"}
              </button>
              <div className="todo-task-body">
                <div className="todo-task-meta">
                  <span>{task.subject}</span>
                  <strong>{task.timeLabel}</strong>
                  <em>{task.durationMinutes} 分钟</em>
                </div>
                <h4>{task.title}</h4>
                <p>{task.goal}</p>
                <small>完成标准：{task.completionCriteria}</small>
                <small>来源：{task.source}</small>
                <div className="todo-task-actions">
                  <button
                    className={`button ${task.status === "completed" ? "" : "primary"}`}
                    type="button"
                    onClick={() => onToggleTask(task)}
                    disabled={pendingTaskId === task.id}
                  >
                    {pendingTaskId === task.id ? "提交中…" : task.status === "completed" ? "撤回完成" : "完成任务"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TodoPage() {
  const [snapshot, setSnapshot] = useState<TodoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [overdueCollapsed, setOverdueCollapsed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadTodo() {
      try {
        const response = await fetch("/api/todo/today", { cache: "no-store" });
        const result = (await response.json()) as TodoResponse;
        if (ignore) return;
        if (!response.ok) {
          setError(result.error ?? "暂时无法读取 Todo。");
          return;
        }
        setSnapshot(result.snapshot ?? null);
        if (result.error) setError(result.error);
      } catch {
        if (!ignore) setError("网络连接异常，请稍后重试。");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadTodo();
    return () => {
      ignore = true;
    };
  }, []);

  function openTodoAI() {
    window.dispatchEvent(new CustomEvent("zhixu:open-ai", {
      detail: {
        module: "todo",
        prompt: "请基于今天的 Todo 帮我判断先做什么、哪些任务可以拆分，以及是否需要延期。",
      },
    }));
  }

  async function toggleTask(task: TodoTaskSlice) {
    setPendingTaskId(task.id);
    setError("");
    try {
      const nextStatus = task.status === "completed" ? "pending" : "completed";
      const response = await fetch("/api/todo/task", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          status: nextStatus,
        }),
      });
      const result = (await response.json()) as TodoTaskUpdateResponse;
      if (!response.ok) {
        setError(result.error ?? "任务状态更新失败，请稍后重试。");
        return;
      }
      setSnapshot(result.snapshot ?? null);
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setPendingTaskId(null);
    }
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">DAILY EXECUTION</p>
          <h1>Todo</h1>
          <p>这里不单独创建任务。所有今日任务都从 Timeline 自动切出，确保执行层和计划层保持一致。</p>
        </div>
        <div className="heading-actions">
          <button className="button" type="button" onClick={openTodoAI}>✦ 拆解今日任务</button>
          <Link className="button primary" href="/timeline">去生成 Timeline</Link>
        </div>
      </header>

      {error ? <div className="planner-error" role="alert">{error}</div> : null}

      {loading ? <section className="planner-card planner-empty">正在读取 Todo…</section> : null}

      {!loading && !snapshot ? (
        <section className="planner-card planner-empty">
          <strong>今天还没有可执行任务</strong>
          <p>先去 Timeline 生成计划，Todo 会自动读取当天的任务切片、当前任务和已逾期任务。</p>
        </section>
      ) : null}

      {snapshot ? (
        <section className="todo-grid">
          <article className="planner-card todo-overview-card">
            <div className="planner-card-heading">
              <div>
                <small>今日概览</small>
                <h2>{snapshot.examName}</h2>
              </div>
              <span>{snapshot.todayKey}</span>
            </div>
            <div className="todo-overview-metrics">
              <div><span>完成率</span><strong>{snapshot.completionPercent}%</strong></div>
              <div><span>已完成</span><strong>{snapshot.completedCount}/{snapshot.totalCount}</strong></div>
              <div><span>考试日期</span><strong>{snapshot.examDate}</strong></div>
            </div>
            <div className="todo-hero-panels">
              <div>
                <small>当前任务</small>
                <strong>{snapshot.currentTask?.title ?? "暂无进行中任务"}</strong>
                <span>{snapshot.currentTask ? `${snapshot.currentTask.subject} · ${snapshot.currentTask.timeLabel}` : "可以从左侧今日任务里选择开始"}</span>
              </div>
            </div>
          </article>

          <TaskList
            title="今日全部任务"
            tasks={snapshot.todayTasks}
            emptyText="今天没有从 Timeline 派生出任务。"
            pendingTaskId={pendingTaskId}
            onToggleTask={toggleTask}
          />
          <TaskList
            title="已完成任务"
            tasks={snapshot.completedTasks}
            emptyText="完成后会自动出现在这里。"
            pendingTaskId={pendingTaskId}
            onToggleTask={toggleTask}
            collapsible
            collapsed={completedCollapsed}
            onToggleCollapse={() => setCompletedCollapsed((current) => !current)}
          />
          <TaskList
            title="已逾期任务"
            tasks={snapshot.overdueTasks}
            emptyText="当前没有逾期任务。"
            pendingTaskId={pendingTaskId}
            onToggleTask={toggleTask}
            collapsible
            collapsed={overdueCollapsed}
            onToggleCollapse={() => setOverdueCollapsed((current) => !current)}
          />
        </section>
      ) : null}
    </>
  );
}
