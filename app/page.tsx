"use client";

import { useState, useEffect, useMemo } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

const TEST_LENGTH = 35;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

type Difficulty = (typeof DIFFICULTIES)[number];

function normalizeDifficulty(value: unknown): Difficulty {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  if (normalized === "easy" || normalized === "medium" || normalized === "hard") {
    return normalized;
  }
  if (normalized === "basic") return "easy";
  if (normalized === "advanced") return "hard";
  return "medium";
}

function nextDifficulty(current: Difficulty, isCorrect: boolean): Difficulty {
  const idx = DIFFICULTIES.indexOf(current);
  if (isCorrect) return DIFFICULTIES[Math.min(idx + 1, DIFFICULTIES.length - 1)];
  return DIFFICULTIES[Math.max(idx - 1, 0)];
}

function getDifficultyFallbackOrder(current: Difficulty): Difficulty[] {
  if (current === "easy") return ["easy", "medium", "hard"];
  if (current === "medium") return ["medium", "easy", "hard"];
  return ["hard", "medium", "easy"];
}

function computeTopicTargets(topics: string[], total: number): Record<string, number> {
  const result: Record<string, number> = {};
  if (topics.length === 0) return result;
  const base = Math.floor(total / topics.length);
  let extra = total % topics.length;
  for (const topic of topics) {
    result[topic] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
  }
  return result;
}

const PAPER_SUBJECTS = ["English", "Maths", "Science"] as const;

type AdaptiveState = {
  grouped: Record<string, Record<Difficulty, any[]>>;
  topicTargets: Record<string, number>;
  topicAsked: Record<string, number>;
  topicCorrect: Record<string, number>;
  currentDifficulty: Record<string, Difficulty>;
  finalDifficulty: Record<string, Difficulty>;
  askedMap: Record<string, boolean>;
};

export default function Home() {
  const { data: session } = useSession();

  // ROLE
  const [role, setRole] = useState<"dev" | "user" | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem("role") as "dev" | "user" | null;
    if (saved) setRole(saved);
  }, []);
  const isDeveloper = role === "dev";

  const [mode, setMode] = useState<"home" | "analyze" | "quiz">("home");

  // OCR + Analyze
  const [files, setFiles] = useState<FileList | null>(null);
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [step, setStep] = useState<"upload" | "extracted" | "analyzed">("upload");
  const [paperSubject, setPaperSubject] =
    useState<(typeof PAPER_SUBJECTS)[number]>("Maths");
  const [paperClass, setPaperClass] = useState<number>(5);

  // Papers
  const [papers, setPapers] = useState<any[]>([]);
  const [papersError, setPapersError] = useState("");

  // DEV EDIT
  const [editingPaper, setEditingPaper] = useState<any | null>(null);
  const [editedQuestions, setEditedQuestions] = useState<any[]>([]);

  // USER QUIZ
  const [quiz, setQuiz] = useState<any[]>([]);
  const [quizPaperContext, setQuizPaperContext] = useState<{
    subject: string;
    classLevel: number;
  } | null>(null);
  const [questionBank, setQuestionBank] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any>({});
  const [paperId, setPaperId] = useState("");
  const [score, setScore] = useState(0);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveState | null>(null);
  const [adaptiveTrace, setAdaptiveTrace] = useState<any[]>([]);
  const [showAdaptiveDebug, setShowAdaptiveDebug] = useState(false);
  const [hintUi, setHintUi] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [hintText, setHintText] = useState("");
  const [hintError, setHintError] = useState("");
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachReply, setCoachReply] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState("");

  /** User must pick subject + class before paper list (Take Quiz). */
  const [userViewSubject, setUserViewSubject] = useState<
    "" | (typeof PAPER_SUBJECTS)[number]
  >("");
  const [userViewClass, setUserViewClass] = useState<number | "">("");

  const filteredPapersForUser = useMemo(() => {
    if (userViewSubject === "" || userViewClass === "") return [];
    return papers.filter((p) => {
      const sub = (p.subject as string) || "Maths";
      const cls = typeof p.classLevel === "number" ? p.classLevel : 1;
      return sub === userViewSubject && cls === userViewClass;
    });
  }, [papers, userViewSubject, userViewClass]);

  // TIMER (USER ONLY)
  useEffect(() => {
    if (done || quiz.length === 0 || isDeveloper) return;

    if (timeLeft <= 0) {
      setDone(true);
      return;
    }

    const t = setTimeout(() => setTimeLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, done, quiz.length, isDeveloper]);

  // FETCH PAPERS
  useEffect(() => {
    if (mode !== "quiz") return;

    const fetchPapers = async () => {
      try {
        setPapersError("");
        const res = await fetch(
          `/api/papers/list?userId=${session?.user?.email}`,
          { cache: "no-store" }
        );
        const bodyText = await res.text();
        const data = bodyText ? JSON.parse(bodyText) : null;

        if (!res.ok) {
          throw new Error(data?.error || "Failed to fetch papers");
        }

        setPapers(data?.data || []);
      } catch (error) {
        console.error("fetchPapers error:", error);
        setPapers([]);
        setPapersError(
          error instanceof Error ? error.message : "Failed to fetch papers"
        );
      }
    };

    fetchPapers();
  }, [mode, session]);

  // LOGIN
  if (!session) {
    return (
      <div className="text-center mt-20 space-y-6">
        <h2>Choose Login Type</h2>

        <button
          onClick={() => {
            localStorage.setItem("role", "dev");
            signIn("google");
          }}
        >
          👨‍💻 Developer Login
        </button>

        <button
          onClick={() => {
            localStorage.setItem("role", "user");
            signIn("google");
          }}
        >
          👤 User Login
        </button>
      </div>
    );
  }

  // OCR
  const handleUpload = async () => {
    if (!files) return;
    let combined = "";

    for (let f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);

      const res = await fetch("/api/ocr", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      combined += data.text + "\n";
    }

    setText(combined);
    setStep("extracted");
  };

  // ANALYZE
  const handleAnalyze = async () => {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    setAnalysis(data.output);
    setStep("analyzed");
  };

  // GENERATE PAPER
  const generateQuiz = async () => {
    try {
      const quizRes = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: text,
          analyzedText: analysis,
          subject: paperSubject,
          classLevel: paperClass,
        }),
      });
      const quizBodyText = await quizRes.text();
      const quizData = quizBodyText ? JSON.parse(quizBodyText) : null;

      if (!quizRes.ok) {
        throw new Error(quizData?.error || "Quiz generation failed.");
      }
      if (quizData?.validation) {
        console.log("Quiz validation report:", quizData.validation);
      }

      const saveRes = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: quizData?.data,
          ocrText: text,
          analysis,
          userId: session.user?.email,
          subject: paperSubject,
          classLevel: paperClass,
        }),
      });
      const saveBodyText = await saveRes.text();
      const saveData = saveBodyText ? JSON.parse(saveBodyText) : null;

      if (!saveRes.ok) {
        throw new Error(saveData?.error || "Failed to save generated paper.");
      }
      if (saveData?.validation) {
        console.log("Paper save validation report:", saveData.validation);
      }

      alert("Paper saved!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate paper.";
      alert(message);
    }
  };

  // NEXT (USER)
  const prepareQuestionBank = (rawQuestions: any[]) => {
    return (Array.isArray(rawQuestions) ? rawQuestions : [])
      .map((q: any, index: number) => {
        const difficulty = normalizeDifficulty(q?.difficulty);
        const marks = Number(q?.marks) || (difficulty === "hard" ? 3 : difficulty === "medium" ? 2 : 1);
        return {
          questionId: q?.questionId || `q_${index + 1}`,
          question: String(q?.question || "").trim(),
          options: Array.isArray(q?.options) ? q.options.slice(0, 4) : [],
          answer: String(q?.answer || "").trim(),
          category: String(q?.category || q?.topic || "General").trim() || "General",
          difficulty,
          marks,
        };
      })
      .filter((q: any) => q.question && q.options.length === 4 && q.answer);
  };

  const initializeAdaptiveState = (bank: any[]): AdaptiveState | null => {
    if (bank.length < TEST_LENGTH) return null;

    const grouped: Record<string, Record<Difficulty, any[]>> = {};
    for (const q of bank) {
      if (!grouped[q.category]) {
        grouped[q.category] = { easy: [], medium: [], hard: [] };
      }
      grouped[q.category][q.difficulty].push(q);
    }

    const topics = Object.keys(grouped);
    const topicTargets = computeTopicTargets(topics, TEST_LENGTH);
    const topicAsked: Record<string, number> = {};
    const topicCorrect: Record<string, number> = {};
    const currentDifficulty: Record<string, Difficulty> = {};
    const finalDifficulty: Record<string, Difficulty> = {};

    for (const topic of topics) {
      topicAsked[topic] = 0;
      topicCorrect[topic] = 0;
      currentDifficulty[topic] = "easy";
      finalDifficulty[topic] = "easy";
    }

    return {
      grouped,
      topicTargets,
      topicAsked,
      topicCorrect,
      currentDifficulty,
      finalDifficulty,
      askedMap: {},
    };
  };

  const pickNextAdaptiveQuestion = (state: AdaptiveState) => {
    const topics = Object.keys(state.grouped);
    const candidateTopics = topics
      .filter((topic) => state.topicAsked[topic] < (state.topicTargets[topic] || 0))
      .sort(
        (a, b) =>
          (state.topicTargets[b] - state.topicAsked[b]) -
          (state.topicTargets[a] - state.topicAsked[a])
      );

    const tryPickFromTopic = (topic: string) => {
      const difficultyOrder = getDifficultyFallbackOrder(state.currentDifficulty[topic]);
      for (const diff of difficultyOrder) {
        const candidate = state.grouped[topic][diff].find(
          (q) => !state.askedMap[q.questionId]
        );
        if (candidate) return candidate;
      }
      return null;
    };

    for (const topic of candidateTopics) {
      const picked = tryPickFromTopic(topic);
      if (picked) return picked;
    }

    for (const topic of topics) {
      const picked = tryPickFromTopic(topic);
      if (picked) return picked;
    }
    return null;
  };

  const beginAdaptiveQuiz = (paper: any) => {
    const preparedBank = prepareQuestionBank(paper.questions);
    const initialState = initializeAdaptiveState(preparedBank);

    if (!initialState) {
      setPapersError("This paper does not have enough valid questions for a 35-question adaptive test.");
      return;
    }

    const first = pickNextAdaptiveQuestion(initialState);
    if (!first) {
      setPapersError("Could not start adaptive test due to question distribution.");
      return;
    }

    const topic = first.category;
    const stateAfterFirst: AdaptiveState = {
      ...initialState,
      topicAsked: {
        ...initialState.topicAsked,
        [topic]: (initialState.topicAsked[topic] || 0) + 1,
      },
      askedMap: {
        ...initialState.askedMap,
        [first.questionId]: true,
      },
    };

    setQuestionBank(preparedBank);
    setAdaptiveState(stateAfterFirst);
    setAdaptiveTrace([]);
    setQuiz([first]);
    setPaperId(paper._id);
    setQuizPaperContext({
      subject: paper.subject || "Maths",
      classLevel:
        typeof paper.classLevel === "number" ? paper.classLevel : 1,
    });
    setAnswers({});
    setScore(0);
    setI(0);
    setDone(false);
    setTimeLeft(900);
    setHintUi("idle");
    setHintText("");
    setHintError("");
  };

  const resetHintUi = () => {
    setHintUi("idle");
    setHintText("");
    setHintError("");
  };

  const sendCoachMessage = async () => {
    const text = coachInput.trim();
    if (!text || coachLoading) return;
    try {
      setCoachLoading(true);
      setCoachError("");
      setCoachReply("");
      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(data?.error || "Coach request failed.");
      }
      setCoachReply(String(data.reply || ""));
      setCoachInput("");
    } catch (err) {
      setCoachError(
        err instanceof Error ? err.message : "Coach request failed."
      );
    } finally {
      setCoachLoading(false);
    }
  };

  const getHintForCurrentQuestion = async () => {
    if (quiz.length === 0) return;
    const current = quiz[i];

    try {
      setHintUi("loading");
      setHintError("");
      setHintText("");

      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: current.question,
          options: current.options,
          category: current.category,
          difficulty: current.difficulty,
        }),
      });

      const bodyText = await res.text();
      const data = bodyText ? JSON.parse(bodyText) : null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate hint.");
      }

      setHintText(data?.hint || "Try breaking the problem into smaller steps.");
      setHintUi("ready");
    } catch (error) {
      setHintError(
        error instanceof Error ? error.message : "Failed to generate hint."
      );
      setHintUi("error");
    }
  };

  const next = async () => {
    if (!adaptiveState || quiz.length === 0) return;

    const q = quiz[i];
    const gotCurrentRight = answers[q.questionId] === q.answer;
    const currentMarks = Number(q.marks) || 0;
    const updatedScore = gotCurrentRight ? score + currentMarks : score;
    const topic = q.category || "General";
    const currentLevel = adaptiveState.currentDifficulty[topic] || "easy";
    const updatedDifficultyForTopic = nextDifficulty(currentLevel, gotCurrentRight);

    const updatedAdaptiveState: AdaptiveState = {
      ...adaptiveState,
      topicCorrect: {
        ...adaptiveState.topicCorrect,
        [topic]: (adaptiveState.topicCorrect[topic] || 0) + (gotCurrentRight ? 1 : 0),
      },
      currentDifficulty: {
        ...adaptiveState.currentDifficulty,
        [topic]: updatedDifficultyForTopic,
      },
      finalDifficulty: {
        ...adaptiveState.finalDifficulty,
        [topic]: updatedDifficultyForTopic,
      },
    };

    const currentTraceRow = {
      order: i + 1,
      questionId: q.questionId,
      category: topic,
      servedDifficulty: q.difficulty,
      targetDifficultyAfterAnswer: updatedDifficultyForTopic,
      selectedAnswer: answers[q.questionId] || null,
      correctAnswer: q.answer,
      isCorrect: gotCurrentRight,
      marksAwarded: gotCurrentRight ? currentMarks : 0,
    };
    const updatedTrace = [...adaptiveTrace, currentTraceRow];

    if (gotCurrentRight) {
      setScore(updatedScore);
    }

    const reachedTestLength = quiz.length >= TEST_LENGTH;
    const nextQuestion = reachedTestLength
      ? null
      : pickNextAdaptiveQuestion(updatedAdaptiveState);

    if (nextQuestion) {
      const nextTopic = nextQuestion.category || "General";
      updatedAdaptiveState.topicAsked = {
        ...updatedAdaptiveState.topicAsked,
        [nextTopic]: (updatedAdaptiveState.topicAsked[nextTopic] || 0) + 1,
      };
      updatedAdaptiveState.askedMap = {
        ...updatedAdaptiveState.askedMap,
        [nextQuestion.questionId]: true,
      };

      setAdaptiveState(updatedAdaptiveState);
      setAdaptiveTrace(updatedTrace);
      setQuiz((prev) => [...prev, nextQuestion]);
      resetHintUi();
      setI(i + 1);
    } else {
      if (!reachedTestLength) {
        setPapersError(
          "Adaptive test ended early because this paper does not have enough balanced questions across topics/difficulties."
        );
      }
      setDone(true);
      setAdaptiveState(updatedAdaptiveState);
      setAdaptiveTrace(updatedTrace);

      const perTopicSummary = Object.keys(updatedAdaptiveState.topicTargets).map((t) => ({
        topic: t,
        targetCount: updatedAdaptiveState.topicTargets[t] || 0,
        attempted: updatedAdaptiveState.topicAsked[t] || 0,
        correct: updatedAdaptiveState.topicCorrect[t] || 0,
        finalDifficulty: updatedAdaptiveState.finalDifficulty[t] || "easy",
      }));

      await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user?.email,
          paperId,
          score: updatedScore,
          subject: quizPaperContext?.subject ?? "Maths",
          classLevel: quizPaperContext?.classLevel ?? 1,
          adaptiveTrace: updatedTrace,
          perTopicSummary,
          servedCount: quiz.length,
          testLength: TEST_LENGTH,
          responses: quiz.map((q) => ({
            ...q,
            selectedAnswer: answers[q.questionId],
            isCorrect: answers[q.questionId] === q.answer,
          })),
        }),
      });
    }
  };

  return (
    <div className="p-6">

      {/* HEADER */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>Welcome {session.user?.name}</span>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem("role");
            signOut();
          }}
          className="underline"
        >
          Logout
        </button>
        <button
          type="button"
          onClick={() => setCoachOpen((o) => !o)}
          className="underline"
        >
          {coachOpen ? "Hide Coach" : "Coach"}
        </button>
      </div>

      {coachOpen && (
        <div className="mb-4 border rounded-lg p-3 bg-slate-50 space-y-2">
          <p className="text-xs text-gray-600">
            Ask about your past attempts or scores—the assistant can call tools
            to load your history (filtered by subject or class).
          </p>
          <textarea
            className="w-full border rounded p-2 text-sm min-h-[88px]"
            value={coachInput}
            onChange={(e) => setCoachInput(e.target.value)}
            placeholder="Example: Summarize my Maths attempts for class 5."
          />
          <button
            type="button"
            disabled={coachLoading}
            onClick={sendCoachMessage}
            className="text-sm px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
          >
            {coachLoading ? "Thinking…" : "Send"}
          </button>
          {coachError && (
            <p className="text-sm text-red-600">{coachError}</p>
          )}
          {coachReply && (
            <div className="text-sm border-t pt-2 mt-2 whitespace-pre-wrap">
              {coachReply}
            </div>
          )}
        </div>
      )}

      {/* HOME */}
      {mode === "home" && (
        <div>
          {isDeveloper && (
            <>
              <button onClick={() => setMode("analyze")}>
                Upload Paper
              </button>
              <button onClick={() => setMode("quiz")}>
                View Papers
              </button>
            </>
          )}

          {!isDeveloper && (
            <button onClick={() => setMode("quiz")}>
              Take Quiz
            </button>
          )}
        </div>
      )}

      {/* ANALYZE */}
      {mode === "analyze" && isDeveloper && (
        <div>
          <button onClick={() => setMode("home")}>Back</button>

          <div className="my-4 flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2">
              <span className="text-sm">Subject</span>
              <select
                value={paperSubject}
                onChange={(e) =>
                  setPaperSubject(e.target.value as (typeof PAPER_SUBJECTS)[number])
                }
                className="border p-2 rounded"
              >
                {PAPER_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm">Class</span>
              <select
                value={paperClass}
                onChange={(e) => setPaperClass(Number(e.target.value))}
                className="border p-2 rounded"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {step === "upload" && (
            <>
              <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
              <button onClick={handleUpload}>Extract</button>
            </>
          )}

          {step === "extracted" && (
            <>
              <pre>{text}</pre>
              <button onClick={handleAnalyze}>Analyze</button>
            </>
          )}

          {step === "analyzed" && (
            <>
              <pre>{analysis}</pre>
              <button onClick={generateQuiz}>Generate & Save</button>
            </>
          )}
        </div>
      )}

      {/* QUIZ / EDIT */}
      {mode === "quiz" && (
        <div>
          <button onClick={() => setMode("home")}>Back</button>

          {/* DEV */}
          {isDeveloper && (
            <>
              {papersError && <p className="text-red-600 mb-3">{papersError}</p>}
              {!editingPaper ? (
                <div>
                  {papers.map((p) => (
                    <div
                      key={p._id}
                      onClick={() => {
                        setEditingPaper(p);
                        setEditedQuestions(p.questions);
                      }}
                      className="p-2 bg-gray-100 my-2"
                    >
                      Paper {p._id.toString().slice(-5)}{" "}
                      <span className="text-sm text-gray-600">
                        &middot; {p.subject || "Maths"} &middot; Class{" "}
                        {p.classLevel ?? 1}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <h2>Edit Paper</h2>

                  {/* ADD QUESTION */}
                  <button
                    onClick={() =>
                      setEditedQuestions([
                        ...editedQuestions,
                        {
                          questionId: "new_" + Date.now(),
                          question: "",
                          options: ["", "", "", ""],
                          answer: "",
                          category: "",
                          difficulty: "easy",
                          marks: 1,
                        },
                      ])
                    }
                    className="bg-blue-500 text-white px-3 py-1 mb-3"
                  >
                    ➕ Add Question
                  </button>

                  {editedQuestions.map((q, idx) => (
                    <div key={idx} className="border rounded my-4 overflow-hidden w-full">
                      <div className="bg-blue-200 p-3 border-b border-blue-300">
                        <p className="text-sm font-semibold mb-1">
                          Question {idx + 1}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                          <input
                            value={q.category || ""}
                            onChange={(e) => {
                              const updated = [...editedQuestions];
                              updated[idx].category = e.target.value;
                              setEditedQuestions(updated);
                            }}
                            className="border p-2 bg-white rounded"
                            placeholder="Category (e.g. Algebra)"
                          />
                          <select
                            value={q.difficulty || "easy"}
                            onChange={(e) => {
                              const updated = [...editedQuestions];
                              updated[idx].difficulty = e.target.value;
                              setEditedQuestions(updated);
                            }}
                            className="border p-2 bg-white rounded"
                          >
                            <option value="easy">easy</option>
                            <option value="medium">medium</option>
                            <option value="hard">hard</option>
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={q.marks ?? 1}
                            onChange={(e) => {
                              const updated = [...editedQuestions];
                              updated[idx].marks = Number(e.target.value) || 1;
                              setEditedQuestions(updated);
                            }}
                            className="border p-2 bg-white rounded"
                            placeholder="Marks"
                          />
                        </div>
                        <textarea
                          value={q.question}
                          onChange={(e) => {
                            const updated = [...editedQuestions];
                            updated[idx].question = e.target.value;
                            setEditedQuestions(updated);
                          }}
                          onInput={(e) => {
                            const target = e.currentTarget;
                            target.style.height = "auto";
                            target.style.height = `${target.scrollHeight}px`;
                          }}
                          rows={1}
                          style={{ minHeight: "54px", width: "100%" }}
                          className="w-full border border-blue-300 px-3 py-3 bg-white rounded resize-none overflow-hidden leading-6 text-base"
                          placeholder="Question"
                        />
                      </div>

                      {q.options.map((opt: string, i: number) => {
                        const label = ["A", "B", "C", "D"][i] || String(i + 1);
                        return (
                          <div
                            key={i}
                            style={{
                              backgroundColor: i % 2 === 0 ? "#fbcfe8" : "#bfdbfe",
                              borderColor: i % 2 === 0 ? "#f9a8d4" : "#93c5fd",
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                            }}
                            className="p-3 border-b"
                          >
                            <div className="font-bold w-8 h-8 rounded-full bg-white border flex items-center justify-center">
                              {label}
                            </div>
                            <input
                              value={opt}
                              onChange={(e) => {
                                const updated = [...editedQuestions];
                                updated[idx].options[i] = e.target.value;
                                setEditedQuestions(updated);
                              }}
                              style={{ width: "320px", maxWidth: "100%" }}
                              className="border p-2 bg-white rounded"
                              placeholder={`Option ${label}`}
                            />
                          </div>
                        );
                      })}

                      <div className="p-3 bg-white">
                        <input
                          value={q.answer}
                          onChange={(e) => {
                            const updated = [...editedQuestions];
                            updated[idx].answer = e.target.value;
                            setEditedQuestions(updated);
                          }}
                          className="w-full border p-2"
                          placeholder="Correct Answer (A/B/C/D or full text)"
                        />

                        <button
                          onClick={() =>
                            setEditedQuestions(
                              editedQuestions.filter((_, i) => i !== idx)
                            )
                          }
                          className="bg-red-500 text-white mt-2 px-3 py-1"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* SAVE / IGNORE */}
                  <button
                    onClick={async () => {
                      await fetch("/api/papers/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          paperId: editingPaper._id,
                          questions: editedQuestions,
                        }),
                      });
                      alert("Saved!");
                      setEditingPaper(null);
                    }}
                    className="bg-green-600 text-white px-4 py-2"
                  >
                    Save
                  </button>

                  <button
                    onClick={() => {
                      setEditingPaper(null);
                      setEditedQuestions([]);
                    }}
                    className="bg-gray-400 text-white px-4 py-2 ml-2"
                  >
                    Ignore
                  </button>
                </div>
              )}
            </>
          )}

          {/* USER */}
          {!isDeveloper && (
            <>
              {papersError && <p className="text-red-600 mb-3">{papersError}</p>}
              {quiz.length === 0 ? (
                <div>
                  <p className="text-sm mb-3">
                    Choose subject and class to see available papers.
                  </p>
                  <div className="flex flex-wrap gap-4 items-center mb-4">
                    <label className="flex items-center gap-2">
                      <span className="text-sm">Subject</span>
                      <select
                        value={userViewSubject}
                        onChange={(e) =>
                          setUserViewSubject(
                            e.target.value as "" | (typeof PAPER_SUBJECTS)[number]
                          )
                        }
                        className="border p-2 rounded min-w-[140px]"
                      >
                        <option value="">Select subject</option>
                        {PAPER_SUBJECTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-sm">Class</span>
                      <select
                        value={userViewClass === "" ? "" : String(userViewClass)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setUserViewClass(v === "" ? "" : Number(v));
                        }}
                        className="border p-2 rounded min-w-[100px]"
                      >
                        <option value="">Select class</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {userViewSubject !== "" &&
                    userViewClass !== "" &&
                    filteredPapersForUser.length === 0 && (
                      <p className="text-sm text-gray-600 mb-2">
                        No papers found for{" "}
                        <b>{userViewSubject}</b>, Class{" "}
                        <b>{userViewClass}</b>.
                      </p>
                    )}
                  {(userViewSubject === "" || userViewClass === "") && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded">
                      Select both subject and class to load papers.
                    </p>
                  )}
                  {(userViewSubject !== "" &&
                    userViewClass !== "") &&
                    filteredPapersForUser.map((p) => (
                    <div
                      key={p._id}
                      onClick={() => {
                        beginAdaptiveQuiz(p);
                      }}
                      className={`p-2 my-2 cursor-pointer rounded ${
                        p.attempted ? "bg-green-200" : "bg-yellow-200"
                      }`}
                    >
                      Paper {p._id.toString().slice(-5)}{" "}
                      <span className="text-sm opacity-90">
                        &middot; {p.subject || "Maths"} &middot; Class{" "}
                        {p.classLevel ?? 1}
                      </span>
                    </div>
                  ))}
                </div>
              ) : done ? (
                <h2>Score: {score}</h2>
              ) : (
                <div>
                  <p className="text-sm mb-2 flex flex-wrap items-baseline gap-y-1">
                    <span>
                      Question {i + 1} / {TEST_LENGTH}
                    </span>
                    <span className="text-gray-700 ml-10 shrink-0">
                      ⏱{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                    </span>
                  </p>

                  <h3>{quiz[i].question}</h3>
                  <p className="text-sm text-gray-700 mt-1 mb-3">
                    Category: <b>{quiz[i].category || "General"}</b> | Difficulty:{" "}
                    <b>{quiz[i].difficulty || "easy"}</b> | Marks:{" "}
                    <b>{quiz[i].marks ?? 1}</b>
                  </p>

                  <div className="space-y-2 mb-4">
                    {quiz[i].options.map((o: string, optIdx: number) => {
                      const selected =
                        answers[quiz[i].questionId] === o;
                      return (
                        <button
                          key={`${quiz[i].questionId}-${optIdx}-${o}`}
                          type="button"
                          onClick={() =>
                            setAnswers({ ...answers, [quiz[i].questionId]: o })
                          }
                          aria-pressed={selected}
                          className="block w-full rounded-lg text-left transition"
                          style={{
                            boxSizing: "border-box",
                            padding: "12px 14px",
                            border: selected
                              ? "3px solid #064e3b"
                              : "3px solid #cbd5e1",
                            backgroundColor: selected ? "#059669" : "#f1f5f9",
                            color: selected ? "#ffffff" : "inherit",
                            boxShadow: selected
                              ? "0 0 0 3px #a7f3d0"
                              : "none",
                          }}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowAdaptiveDebug((x) => !x)}
                      className="text-sm underline text-gray-700"
                    >
                      {showAdaptiveDebug
                        ? "Hide adaptive debug"
                        : "Show adaptive debug"}
                    </button>

                    {showAdaptiveDebug && adaptiveState && (
                      <pre className="text-xs bg-gray-100 p-3 rounded border overflow-x-auto">
                        {JSON.stringify(
                          {
                            topicTargets: adaptiveState.topicTargets,
                            topicAsked: adaptiveState.topicAsked,
                            topicCorrect: adaptiveState.topicCorrect,
                            currentDifficulty: adaptiveState.currentDifficulty,
                          },
                          null,
                          2
                        )}
                      </pre>
                    )}

                    <div className="space-y-2">
                      {hintUi === "idle" && (
                        <button
                          type="button"
                          onClick={getHintForCurrentQuestion}
                          className="text-sm px-4 py-2 bg-violet-600 text-white rounded"
                        >
                          Get Hint
                        </button>
                      )}

                      {hintUi === "loading" && (
                        <p className="text-sm text-gray-600">Generating hint…</p>
                      )}

                      {hintUi === "ready" && (
                        <div className="space-y-2">
                          <p className="text-sm">
                            <span className="font-semibold">Hint:</span>{" "}
                            <span className="whitespace-pre-wrap">{hintText}</span>
                          </p>
                          <button
                            type="button"
                            onClick={resetHintUi}
                            className="text-sm px-4 py-2 border border-gray-400 rounded"
                          >
                            Close hint
                          </button>
                        </div>
                      )}

                      {hintUi === "error" && (
                        <div className="space-y-2">
                          <p className="text-sm text-red-600">{hintError}</p>
                          <button
                            type="button"
                            onClick={resetHintUi}
                            className="text-sm px-4 py-2 border border-gray-400 rounded"
                          >
                            Close hint
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={next}
                      className="px-5 py-2 bg-slate-800 text-white rounded font-medium"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
