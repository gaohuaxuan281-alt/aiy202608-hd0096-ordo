"use client";

import { useEffect, useState } from "react";
import type { AIModule } from "../config/ai";
import type { AIConversationSnapshot, AIMessage } from "../lib/ai-types";

type AIResponse = {
  error?: string;
  conversation?: AIConversationSnapshot | null;
  conversationId?: string;
  message?: AIMessage;
  model?: string;
};

export function useAIConversation(aiModule: AIModule, enabled = true) {
  const [loadedModule, setLoadedModule] = useState<AIModule | null>(null);
  const [storedConversationId, setStoredConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function loadConversation() {
      try {
        const response = await fetch(`/api/ai/respond?module=${encodeURIComponent(aiModule)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = (await response.json()) as AIResponse;
        if (!response.ok) {
          setError(result.error ?? "暂时无法读取 AI 对话。");
          setStoredConversationId(null);
          setMessages([]);
        } else {
          setError("");
          setStoredConversationId(result.conversation?.id ?? null);
          setMessages(result.conversation?.messages ?? []);
        }
        setLoadedModule(aiModule);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError("网络连接异常，请稍后重试。");
        setStoredConversationId(null);
        setMessages([]);
        setLoadedModule(aiModule);
      }
    }
    void loadConversation();
    return () => controller.abort();
  }, [aiModule, enabled]);

  const isCurrentModule = loadedModule === aiModule;
  const conversationId = isCurrentModule ? storedConversationId : null;
  const currentMessages = isCurrentModule ? messages : [];
  const currentError = isCurrentModule ? error : "";

  function startNewConversation() {
    setStoredConversationId(null);
    setMessages([]);
    setError("");
    setModel("");
    setLoadedModule(aiModule);
  }

  async function sendMessage(content: string, context?: string) {
    const trimmed = content.trim();
    if (!trimmed || sending) return false;

    const optimisticId = `local-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: optimisticId, role: "user", content: trimmed, createdAt: Date.now() },
    ]);
    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/ai/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: aiModule, message: trimmed, conversationId, context }),
      });
      const result = (await response.json()) as AIResponse;
      if (!response.ok || !result.message || !result.conversationId) {
        setMessages((current) => current.filter((message) => message.id !== optimisticId));
        setError(result.error ?? "AI 暂时没有完成回答，请重试。");
        return false;
      }

      setStoredConversationId(result.conversationId);
      setModel(result.model ?? "");
      setMessages((current) => [...current, result.message!]);
      return true;
    } catch {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setError("网络连接异常，请稍后重试。");
      return false;
    } finally {
      setSending(false);
    }
  }

  return {
    conversationId,
    messages: currentMessages,
    loading: enabled && !isCurrentModule,
    sending,
    error: currentError,
    model,
    sendMessage,
    startNewConversation,
    clearError: () => setError(""),
  };
}
