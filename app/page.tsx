"use client";

import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

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

  // Papers
  const [papers, setPapers] = useState<any[]>([]);

  // DEV EDIT
  const [editingPaper, setEditingPaper] = useState<any | null>(null);
  const [editedQuestions, setEditedQuestions] = useState<any[]>([]);

  // USER QUIZ
  const [quiz, setQuiz] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any>({});
  const [paperId, setPaperId] = useState("");
  const [score, setScore] = useState(0);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);

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
      const res = await fetch(
        `/api/papers/list?userId=${session?.user?.email}`
      );
      const data = await res.json();
      setPapers(data.data);
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
    const q = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: text, analyzedText: analysis }),
    }).then((r) => r.json());

    await fetch("/api/papers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questions: q.data,
        ocrText: text,
        analysis,
        userId: session.user?.email,
      }),
    });

    alert("Paper saved!");
  };

  // NEXT (USER)
  const next = async () => {
    const q = quiz[i];

    if (answers[q.questionId] === q.answer) {
      setScore((s) => s + q.marks);
    }

    if (i + 1 < quiz.length) {
      setI(i + 1);
    } else {
      setDone(true);

      await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user?.email,
          paperId,
          score,
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
      <div className="flex justify-between mb-4">
        <div>
          <p>Welcome {session.user?.name}</p>
          <p>Role: {isDeveloper ? "Developer" : "User"}</p>
        </div>

        <button
          onClick={() => {
            localStorage.removeItem("role");
            signOut();
          }}
        >
          Logout
        </button>
      </div>

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
                      Paper {p._id.toString().slice(-5)}
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
                        },
                      ])
                    }
                    className="bg-blue-500 text-white px-3 py-1 mb-3"
                  >
                    ➕ Add Question
                  </button>

                  {editedQuestions.map((q, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-3 gap-3 border p-3 my-3 rounded bg-gray-50"
                    >

                      {/* QUESTION */}
                      <div className="col-span-2">
                        <input
                          value={q.question}
                          onChange={(e) => {
                            const updated = [...editedQuestions];
                            updated[idx].question = e.target.value;
                            setEditedQuestions(updated);
                          }}
                          className="w-full border p-2"
                          placeholder="Question"
                        />
                      </div>

                      {/* OPTIONS */}
                      <div className="col-span-1">
                        {q.options.map((opt: string, i: number) => (
                          <input
                            key={i}
                            value={opt}
                            onChange={(e) => {
                              const updated = [...editedQuestions];
                              updated[idx].options[i] = e.target.value;
                              setEditedQuestions(updated);
                            }}
                            className="w-full border p-1 my-1"
                            placeholder={`Option ${i + 1}`}
                          />
                        ))}
                      </div>

                      {/* ANSWER + DELETE */}
                      <div className="col-span-3">
                        <input
                          value={q.answer}
                          onChange={(e) => {
                            const updated = [...editedQuestions];
                            updated[idx].answer = e.target.value;
                            setEditedQuestions(updated);
                          }}
                          className="w-full border p-2 mt-2"
                          placeholder="Correct Answer"
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
              {quiz.length === 0 ? (
                <div>
                  {papers.map((p) => (
                    <div
                      key={p._id}
                      onClick={() => {
                        setQuiz(p.questions);
                        setPaperId(p._id);
                        setAnswers({});
                        setScore(0);
                        setI(0);
                        setDone(false);
                        setTimeLeft(900);
                      }}
                      className={`p-2 my-2 ${
                        p.attempted ? "bg-green-200" : "bg-yellow-200"
                      }`}
                    >
                      Paper {p._id.toString().slice(-5)}
                    </div>
                  ))}
                </div>
              ) : done ? (
                <h2>Score: {score}</h2>
              ) : (
                <div>
                  <p>
                    ⏱ {Math.floor(timeLeft / 60)}:
                    {String(timeLeft % 60).padStart(2, "0")}
                  </p>

                  <h3>{quiz[i].question}</h3>

                  {quiz[i].options.map((o: string) => (
                    <button
                      key={o}
                      onClick={() =>
                        setAnswers({ ...answers, [quiz[i].questionId]: o })
                      }
                      className={`block w-full p-2 my-1 ${
                        answers[quiz[i].questionId] === o
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100"
                      }`}
                    >
                      {o}
                    </button>
                  ))}

                  <button onClick={next}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
