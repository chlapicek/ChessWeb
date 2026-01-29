import React, { useEffect, useState } from "react";

export default function App() {
  const [todos, setTodos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Relative path — requires a proxy (nginx or dev-server) to forward /todos -> backend
    fetch("/todos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setTodos)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>ChessWeb — Frontend</h1>
      <p>
        The app requests <code>/todos</code>. Proxy will forward to the backend.
      </p>

      {error && <div style={{ color: "crimson" }}>Error: {error}</div>}
      {!todos && !error && <div>Loading...</div>}

      {Array.isArray(todos) && (
        <ul>
          {todos.map((t) => (
            <li key={t.id}>
              {t.title} {t.dueBy ? `— due ${t.dueBy}` : ""}{" "}
              {t.isComplete ? "(done)" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}