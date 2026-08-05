"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type InitialTimelineResult = {
  error?: string;
  plan?: unknown;
};

export function InitialTimelineBootstrap() {
  const started = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const createTimeline = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/timeline/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "onboarding" }),
      });
      const result = (await response.json()) as InitialTimelineResult;
      if (!response.ok || !result.plan) {
        setError(result.error ?? "第一版 Timeline 暂时没有生成，请重试。");
        return;
      }
      window.location.replace("/timeline");
    } catch {
      setError("网络连接异常，第一版 Timeline 尚未生成。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void createTimeline();
  }, [createTimeline]);

  return (
    <main className="onboarding-page initial-timeline-page">
      <section className="initial-timeline-card" aria-live="polite">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">序</span>
          <span>知序</span>
          <small>PLAN BUILDER</small>
        </div>
        <div className={`initial-timeline-status${loading ? " loading" : ""}`} aria-hidden="true">
          <span>时</span>
        </div>
        <p className="eyebrow">FIRST TIMELINE</p>
        <h1>{loading ? "正在把问卷转换成 Timeline" : "Timeline 还差最后一步"}</h1>
        <p>
          {loading
            ? "正在结合考试日期、Unit 范围、每日学习时段和 Quiz 结果安排首批任务。"
            : error}
        </p>
        {!loading ? (
          <button className="button primary" type="button" onClick={createTimeline}>
            重新生成 Timeline <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </section>
    </main>
  );
}
