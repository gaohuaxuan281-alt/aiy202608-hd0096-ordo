"use client";

import { AI_MODULES, type AIModule } from "../../config/ai";

type FeatureScaffoldProps = {
  eyebrow: string;
  title: string;
  description: string;
  glyph: string;
  modulePath: string;
  handoff: string;
  aiModule: Exclude<AIModule, "home" | "ai-tutor" | "profile">;
};

export function FeatureScaffold({ eyebrow, title, description, glyph, modulePath, handoff, aiModule }: FeatureScaffoldProps) {
  const ai = AI_MODULES[aiModule];

  function openAI(prompt = "") {
    window.dispatchEvent(new CustomEvent("zhixu:open-ai", { detail: { module: aiModule, prompt } }));
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="heading-actions"><button className="button" type="button">筛选</button><button className="button primary" type="button" onClick={() => openAI()}>✦ 调用 AI</button></div>
      </header>
      <section className="feature-stage">
        <div className="feature-stage-head">
          <span className="feature-glyph" aria-hidden="true">{glyph}</span>
          <div><h2>{title} 工作区</h2><p>一级路由、导航状态与响应式容器已接通</p></div>
        </div>
        <div className="module-boundary">
          <article className="boundary-card">
            <h3>员工开发区域</h3>
            <p>{handoff}</p>
            <span className="dev-tag">独立模块 · 可持续迭代</span>
          </article>
          <article className="boundary-card accent">
            <h3>模块边界</h3>
            <p>本页只依赖公共 AppShell 与设计变量。业务状态、数据请求和细分组件均可在模块目录内自行演进。</p>
            <span className="dev-tag">{modulePath}</span>
          </article>
        </div>
        <article className="module-ai-card">
          <div className="module-ai-copy"><span aria-hidden="true">✦</span><div><small>OPENAI CONNECTED</small><h3>{ai.label}</h3><p>{ai.description}。员工可以通过统一接口继续把 AI 输出连接到本模块的业务操作。</p></div></div>
          <div className="module-ai-suggestions">{ai.suggestions.slice(0, 2).map((suggestion) => <button key={suggestion} type="button" onClick={() => openAI(suggestion)}>{suggestion}<span>→</span></button>)}</div>
        </article>
      </section>
    </>
  );
}
