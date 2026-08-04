"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AI_MODULES } from "../../config/ai";
import { useAIConversation } from "../../hooks/useAIConversation";

const tutor = AI_MODULES["ai-tutor"];

export function AITutorWorkspace() {
  const ai = useAIConversation("ai-tutor");
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ai.messages, ai.sending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input;
    if (!content.trim()) return;
    setInput("");
    const sent = await ai.sendMessage(content, "学生正在 AI Tutor 专属工作区中寻求学习辅导。 ");
    if (!sent) setInput(content);
  }

  return (
    <>
      <header className="page-heading tutor-heading">
        <div><p className="eyebrow">PERSONAL COACH · OPENAI</p><h1>AI Tutor</h1><p>围绕当前任务提供解释、追问、诊断和个性化学习支持。</p></div>
        <div className="tutor-status"><i /><span><strong>AI 服务已接入</strong><small>{ai.model || "等待提问"}</small></span></div>
      </header>

      <section className="tutor-workspace">
        <aside className="tutor-sidebar">
          <div className="tutor-identity"><span aria-hidden="true">✦</span><div><small>你的学习搭档</small><strong>知序 AI Tutor</strong></div></div>
          <p>{tutor.welcome}</p>
          <div className="tutor-starters"><small>可以这样开始</small>{tutor.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setInput(suggestion)}>{suggestion}<span>›</span></button>)}</div>
          <button className="button tutor-new-chat" type="button" onClick={ai.startNewConversation}>＋ 开始新对话</button>
          <div className="tutor-boundary"><strong>学习辅导边界</strong><span>AI 会结合学习档案回答，但不会自动改动任务或账号资料。</span></div>
        </aside>

        <div className="tutor-chat">
          <div className="tutor-chat-head"><div><span className="sync-dot" /><strong>{ai.conversationId ? "继续上次对话" : "新的学习对话"}</strong></div><small>对话自动保存</small></div>
          <div className="tutor-messages" aria-live="polite">
            {ai.loading ? <div className="ai-loading">正在读取对话…</div> : null}
            {!ai.loading && ai.messages.length === 0 ? <div className="tutor-empty"><span aria-hidden="true">✦</span><h2>今天哪里卡住了？</h2><p>可以输入题目、概念，也可以描述你已经尝试过的解法。</p></div> : null}
            {ai.messages.map((message) => <article key={message.id} className={`ai-message ${message.role}`}><small>{message.role === "user" ? "你" : "AI Tutor"}</small><p>{message.content}</p></article>)}
            {ai.sending ? <div className="ai-thinking"><i /><i /><i /><span>AI Tutor 正在组织讲解</span></div> : null}
            <div ref={messagesEndRef} />
          </div>
          {ai.error ? <div className="ai-inline-error tutor-error" role="alert"><span>!</span>{ai.error}<button type="button" onClick={ai.clearError}>×</button></div> : null}
          <form className="tutor-composer" onSubmit={submit}>
            <textarea value={input} onChange={(event) => setInput(event.target.value.slice(0, 4000))} rows={3} placeholder="输入题目、知识点或你的解题思路…" disabled={ai.sending} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} />
            <div><span>AI 可能出错，重要结论请结合教材核对。</span><button type="submit" disabled={ai.sending || !input.trim()}>{ai.sending ? "正在回答…" : "发送给 AI Tutor"}<b aria-hidden="true">↑</b></button></div>
          </form>
        </div>
      </section>
    </>
  );
}
