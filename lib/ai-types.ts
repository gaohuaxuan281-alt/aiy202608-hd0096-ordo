import type { AIModule } from "../config/ai";

export type AIMessageRole = "user" | "assistant";

export type AIMessage = {
  id: string;
  role: AIMessageRole;
  content: string;
  createdAt: number;
};

export type AIConversationSnapshot = {
  id: string;
  module: AIModule;
  title: string;
  messages: AIMessage[];
  createdAt: number;
  updatedAt: number;
};
