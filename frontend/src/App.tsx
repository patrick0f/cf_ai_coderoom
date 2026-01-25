import { useState, FormEvent } from "react";
import { useRoom } from "./useRoom";
import type { Message } from "./types";

function App() {
  const {
    roomId,
    snapshot,
    loading,
    error,
    createRoom,
    sendMessage,
    requestReview,
    resetRoom,
  } = useRoom();

  const [input, setInput] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const content = input;
    setInput("");
    await sendMessage(content);
  };

  const handleReview = async () => {
    setReviewLoading(true);
    await requestReview();
    setReviewLoading(false);
  };

  if (!roomId) {
    return (
      <div className="welcome">
        <h1>CodeRoom</h1>
        <p>AI Pair Programming Assistant</p>
        <button onClick={createRoom} disabled={loading}>
          {loading ? "Creating..." : "Create New Room"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>CodeRoom</h1>
        <span className="room-id">Room: {roomId.slice(0, 8)}...</span>
        <button onClick={resetRoom} disabled={loading} className="btn-secondary">
          Reset
        </button>
      </header>

      <div className="main">
        <div className="chat-panel">
          <div className="messages">
            {snapshot?.messages.length === 0 && (
              <p className="empty">No messages yet. Start a conversation!</p>
            )}
            {snapshot?.messages.map((msg: Message) => (
              <div key={msg.seq} className={`message ${msg.role}`}>
                <div className="message-role">{msg.role}</div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
            {loading && <div className="message assistant loading">Thinking...</div>}
          </div>

          <form onSubmit={handleSubmit} className="input-form">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about code, paste snippets, or describe a problem..."
              disabled={loading}
              rows={3}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </div>

        <aside className="artifacts-panel">
          <section className="artifact">
            <h3>Summary</h3>
            <p>{snapshot?.rollingSummary || "No summary yet"}</p>
          </section>

          <section className="artifact">
            <h3>TODOs</h3>
            {snapshot?.artifacts.todos?.items.length ? (
              <ul>
                {snapshot.artifacts.todos.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="empty">No TODOs extracted</p>
            )}
          </section>

          <section className="artifact">
            <h3>
              Code Review
              <button
                onClick={handleReview}
                disabled={loading || reviewLoading || !snapshot?.messages.length}
                className="btn-small"
              >
                {reviewLoading ? "Reviewing..." : "Run Review"}
              </button>
            </h3>
            {snapshot?.artifacts.lastReview ? (
              <div className="review">
                <p><strong>Summary:</strong> {snapshot.artifacts.lastReview.content.summary}</p>
                {snapshot.artifacts.lastReview.content.issues.length > 0 && (
                  <div>
                    <strong>Issues:</strong>
                    <ul>
                      {snapshot.artifacts.lastReview.content.issues.map((issue, i) => (
                        <li key={i} className={`issue-${issue.severity}`}>
                          <span className="severity">{issue.severity}</span> {issue.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {snapshot.artifacts.lastReview.content.testPlan.length > 0 && (
                  <div>
                    <strong>Test Plan:</strong>
                    <ul>
                      {snapshot.artifacts.lastReview.content.testPlan.map((test, i) => (
                        <li key={i}>{test}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="empty">No review yet. Click "Run Review" to analyze the conversation.</p>
            )}
          </section>
        </aside>
      </div>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

export default App;
