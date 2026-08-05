"use client";

import type {
  DiagnosticQuiz,
  DiagnosticQuizResult,
} from "../../lib/diagnostic-quiz-types";

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

export function DiagnosticQuizStep({
  quiz,
  answers,
  result,
  onAnswer,
}: {
  quiz: DiagnosticQuiz;
  answers: Record<string, number>;
  result: DiagnosticQuizResult | null;
  onAnswer: (questionId: string, optionIndex: number) => void;
}) {
  if (result) {
    return (
      <div className="diagnostic-result">
        <div className="diagnostic-score-card">
          <div className="diagnostic-score-ring" aria-label={`诊断得分 ${result.score} 分，共 ${result.total} 分`}>
            <strong>{result.score}</strong><span>/ {result.total}</span>
          </div>
          <div>
            <p className="eyebrow">DIAGNOSTIC COMPLETE</p>
            <h2>诊断完成，复习依据已建立</h2>
            <p>正确率 {result.percentage}% · Timeline 和 AI 会优先处理本次暴露的薄弱知识点。</p>
          </div>
        </div>

        <div className="diagnostic-subject-scores" aria-label="分科诊断结果">
          {result.subjectScores.map((item) => (
            <div key={item.subject}>
              <span>{item.subjectLabel}</span>
              <strong>{item.correct}/{item.total}</strong>
              <i><b style={{ width: `${item.percentage}%` }} /></i>
            </div>
          ))}
        </div>

        <section className="diagnostic-weaknesses" aria-labelledby="diagnostic-weak-title">
          <div>
            <span aria-hidden="true">靶</span>
            <div><small>将进入复习规划的数据</small><h3 id="diagnostic-weak-title">薄弱知识点</h3></div>
          </div>
          {result.weakTopics.length ? (
            <ul>
              {result.weakTopics.map((item, index) => (
                <li key={`${item.subject}-${item.unitNumber}-${item.knowledgePoint}-${index}`}>
                  <span>{item.subjectLabel} · {item.unitLabel}</span><strong>{item.knowledgePoint}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>本次 10 题全部答对，Timeline 会安排巩固与迁移练习。</p>
          )}
        </section>

        <details className="diagnostic-review">
          <summary>查看逐题答案与解析</summary>
          <div>
            {result.questions.map((question) => (
              <article key={question.id} className={question.isCorrect ? "correct" : "incorrect"}>
                <header><span>{question.position}</span><div><small>{question.subjectLabel} · {question.unitLabel} · {question.knowledgePoint}</small><strong>{question.prompt}</strong></div><b>{question.isCorrect ? "正确" : "需复习"}</b></header>
                <p>你的答案：{OPTION_LABELS[question.selectedOption]} · 正确答案：{OPTION_LABELS[question.correctOption]}</p>
                <div>{question.explanation}</div>
              </article>
            ))}
          </div>
        </details>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  return (
    <div className="diagnostic-quiz-step">
      <div className="diagnostic-quiz-overview">
        <span aria-hidden="true">10</span>
        <div><small>AI DIAGNOSTIC QUIZ</small><strong>考前知识点覆盖诊断</strong><p>{quiz.coverageSummary}</p></div>
        <b>已答 {answeredCount}/10</b>
      </div>

      <div className="diagnostic-question-list">
        {quiz.questions.map((question) => (
          <fieldset className="diagnostic-question" key={question.id}>
            <legend>第 {question.position} 题</legend>
            <div className="diagnostic-question-meta">
              <span>{question.subjectLabel}</span><span>{question.unitLabel}</span><span>{question.knowledgePoint}</span><i>{question.difficulty}</i>
            </div>
            <h3><b>{String(question.position).padStart(2, "0")}</b>{question.prompt}</h3>
            <div className="diagnostic-options">
              {question.options.map((option, optionIndex) => (
                <label key={`${question.id}-${optionIndex}`} className={answers[question.id] === optionIndex ? "selected" : ""}>
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={optionIndex}
                    checked={answers[question.id] === optionIndex}
                    onChange={() => onAnswer(question.id, optionIndex)}
                  />
                  <span>{OPTION_LABELS[optionIndex]}</span><strong>{option}</strong><i>{answers[question.id] === optionIndex ? "✓" : ""}</i>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
