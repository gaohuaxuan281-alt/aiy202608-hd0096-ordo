"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AI_MODULES,
  getAIModuleFromPathname,
  isAIModule,
  type AIModule,
} from "../config/ai";
import { useAIConversation } from "../hooks/useAIConversation";

type OpenAIEventDetail = {
  module?: string;
  prompt?: string;
};

export function GlobalAIAssistant() {
  const pathname = usePathname();
  const pathModule = getAIModuleFromPathname(pathname);
  const [moduleOverride, setModuleOverride] = useState<{ value: AIModule; pathname: string } | null>(null);
  const aiModule = moduleOverride?.pathname === pathname ? moduleOverride.value : pathModule;
  const moduleConfig = AI_MODULES[aiModule];
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ai = useAIConversation(aiModule, open);

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<OpenAIEventDetail>).detail;
      if (detail?.module && isAIModule(detail.module)) setModuleOverride({ value: detail.module, pathname });
      if (detail?.prompt) setInput(detail.prompt);
      setOpen(true);
    }
    window.addEventListener("zhixu:open-ai", handleOpen);
    return () => window.removeEventListener("zhixu:open-ai", handleOpen);
  }, [pathname]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ai.messages, ai.sending, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input;
    if (!content.trim()) return;
    setInput("");
    const sent = await ai.sendMessage(content, `用户当前位于 ${pathname} 页面。`);
    if (!sent) setInput(content);
  }

  if (pathname.startsWith("/ai-tutor") && !open) return null;

  return (
    <>
      <button className="global-ai-trigger" type="button" onClick={() => setOpen(true)} aria-label={`打开${moduleConfig.label}`}>
        <span aria-hidden="true">✦</span><strong>知序 AI</strong>
      </button>

      {open ? (
        <div className="ai-drawer-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setOpen(false)}>
          <aside className="ai-drawer" role="dialog" aria-modal="true" aria-labelledby="ai-drawer-title">
            <header className="ai-drawer-header">
              <span className="ai-orb" aria-hidden="true">✦</span>
              <div><small>当前模块 AI</small><h2 id="ai-drawer-title">{moduleConfig.label}</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭 AI 助手">×</button>
            </header>

            <div className="ai-drawer-context"><span>{moduleConfig.description}</span><button type="button" onClick={ai.startNewConversation}>新对话</button></div>

            <div className="ai-message-list" aria-live="polite">
              {ai.loading ? <div className="ai-loading">正在读取对话…</div> : null}
              {!ai.loading && ai.messages.length === 0 ? (
                <div className="ai-welcome-message"><span aria-hidden="true">✦</span><p>{moduleConfig.welcome}</p></div>
              ) : null}
              {ai.messages.map((message) => (
                <article key={message.id} className={`ai-message ${message.role}`}><small>{message.role === "user" ? "你" : "知序 AI"}</small><p>{message.content}</p></article>
              ))}
              {ai.sending ? <div className="ai-thinking"><i /><i /><i /><span>正在思考</span></div> : null}
              <div ref={messagesEndRef} />
            </div>

            {ai.messages.length === 0 ? (
              <div className="ai-suggestion-list">
                {moduleConfig.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setInput(suggestion)}>{suggestion}<span>→</span></button>)}
              </div>
            ) : null}

            {ai.error ? <div className="ai-inline-error" role="alert"><span>!</span>{ai.error}<button type="button" onClick={ai.clearError}>×</button></div> : null}

            <form className="ai-composer" onSubmit={submit}>
              <textarea value={input} onChange={(event) => setInput(event.target.value.slice(0, 4000))} placeholder={`向${moduleConfig.label}提问…`} rows={3} disabled={ai.sending} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }} />
              <div><span>Enter 发送 · Shift + Enter 换行</span><button type="submit" disabled={ai.sending || !input.trim()}>{ai.sending ? "回答中" : "发送"} <b aria-hidden="true">↑</b></button></div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
