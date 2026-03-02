// app/extensions/email-center-block/BlockExtension.jsx
// @ts-nocheck

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

// Shopify calls this file as the entrypoint
export default async () => {
  render(<EmailCenterBlock />, document.body);
};

function EmailCenterBlock() {
  const [template, setTemplate] = useState(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // history state
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState("");

  // ✅ paging state (always visible controls)
  const PAGE_SIZE = 3;
  const [pageIndex, setPageIndex] = useState(0); // 0 = newest page

  // ✅ expand/collapse state
  const [expandedLogId, setExpandedLogId] = useState(null);

  // 🔧 DEV ONLY
  const orderGid = "gid://shopify/Order/7146281468149";

  useEffect(() => {
    loadFirstTemplate();
  }, []);

  useEffect(() => {
    if (orderGid) loadLogs(orderGid);
  }, [orderGid]);

  function htmlToText(html) {
    if (!html) return "";
    return String(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  }

  async function loadFirstTemplate() {
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/email/templates");
      if (!res.ok) throw new Error(`Failed to load templates (HTTP ${res.status})`);

      const json = await res.json();
      const list = json.templates || [];

      if (list.length === 0) {
        setStatus("No email templates found. Add one in your database.");
        setTemplate(null);
        return;
      }

      const first = list[0];
      setTemplate(first);
      setSubject(first.subject || "");
      setBodyHtml(first.bodyHtml || "");
    } catch (err) {
      console.error("[EmailCenter] loadFirstTemplate error", err);
      setError("Could not load email templates.");
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs(orderGid) {
    setLoadingLogs(true);
    setLogsError("");

    try {
      const params = new URLSearchParams({ orderGid });
      const res = await fetch(`/api/email/logs?${params.toString()}`);
      const text = await res.text();

      if (!res.ok) throw new Error(`Failed to load logs (HTTP ${res.status})`);

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Logs endpoint did not return JSON");
      }

      const nextLogs = json.logs || [];
      setLogs(nextLogs);

      // Always jump back to newest page after refresh
      setPageIndex(0);

      // Close any expanded row (prevents expanding a row id that isn't on page anymore)
      setExpandedLogId(null);
    } catch (err) {
      console.error("[EmailCenter] loadLogs error", err);
      setLogsError(err.message || "Could not load email history.");
      setLogs([]);
      setPageIndex(0);
      setExpandedLogId(null);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleSend() {
    if (!template) {
      setError("No template loaded.");
      return;
    }

    setSending(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderGid,
          templateId: Number(template.id),
          subjectOverride: subject,
          bodyOverride: bodyHtml,
        }),
      });

      const text = await res.text();

      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok || !json || json.ok === false) {
        throw new Error((json && json.error) || `Send failed (HTTP ${res.status})`);
      }

      setStatus("Email sent and logged successfully.");

      await loadLogs(orderGid);
      setPageIndex(0);
      setExpandedLogId(null);
    } catch (err) {
      console.error("[EmailCenter] handleSend error", err);
      setError(err.message || "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const aTime = new Date(a.sentAt).getTime();
      const bTime = new Date(b.sentAt).getTime();
      return bTime - aTime;
    });
  }, [logs]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedLogs.length / PAGE_SIZE));
  }, [sortedLogs.length]);

  // Keep pageIndex in range if logs count changes
  useEffect(() => {
    setPageIndex((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  const pageLogs = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return sortedLogs.slice(start, end);
  }, [sortedLogs, pageIndex]);

  // If you change page, close the expanded row
  useEffect(() => {
    setExpandedLogId(null);
  }, [pageIndex]);

  const canPrev = pageIndex > 0; // newer
  const canNext = pageIndex < totalPages - 1; // older

  const showingFrom = sortedLogs.length === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const showingTo = Math.min(sortedLogs.length, (pageIndex + 1) * PAGE_SIZE);

  return (
    <s-admin-block title="Email Center">
      <s-stack direction="block" gap="base">
        {loading && <s-text>Loading email templates…</s-text>}
        {error && <s-text>{error}</s-text>}
        {status && !loading && <s-text>{status}</s-text>}

        {!loading && template && (
          <>
            <s-text>
              Using template: <strong>{template.label}</strong>
            </s-text>

            <s-text-field
              label="Email subject"
              value={subject}
              onChange={(event) => setSubject(event.currentTarget.value || "")}
            />

            <s-text-area
              label="Email body (HTML allowed)"
              rows="5"
              value={bodyHtml}
              onChange={(event) => setBodyHtml(event.currentTarget.value || "")}
            />

            <s-button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !bodyHtml.trim()}
            >
              {sending ? "Sending…" : "Send email to customer"}
            </s-button>

            <s-text>
              <strong>Email history for this order</strong>
            </s-text>

            {loadingLogs && <s-text>Loading history…</s-text>}
            {logsError && <s-text>History error: {logsError}</s-text>}

            {!loadingLogs && !logsError && sortedLogs.length === 0 && (
              <s-text>No emails sent for this order yet.</s-text>
            )}

            {!loadingLogs && !logsError && sortedLogs.length > 0 && (
              <s-box borderWidth="base" borderRadius="base" padding="tight">
                {/* ✅ Controls at the TOP so Shopify can't clip them */}
                <s-stack direction="inline" gap="tight" alignment="center">
                  <s-button
                    disabled={!canPrev}
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  >
                    Newer
                  </s-button>

                  <s-text>
                    {showingFrom}-{showingTo} of {sortedLogs.length} (Page{" "}
                    {pageIndex + 1}/{totalPages})
                  </s-text>

                  <s-button
                    disabled={!canNext}
                    onClick={() =>
                      setPageIndex((p) => Math.min(totalPages - 1, p + 1))
                    }
                  >
                    Older
                  </s-button>
                </s-stack>

                <s-stack direction="block" gap="tight">
                  {pageLogs.map((log) => {
                    const isOpen = expandedLogId === log.id;
                    const fullText = htmlToText(log.bodyHtml);
                    const preview = fullText.slice(0, 280);
                    const hasMore = fullText.length > 280;

                    return (
                      <s-box
                        key={log.id}
                        padding="tight"
                        borderWidth="base"
                        borderRadius="base"
                      >
                        {/* Clickable row header */}
                        <s-button
                          onClick={() =>
                            setExpandedLogId((curr) =>
                              curr === log.id ? null : log.id
                            )
                          }
                        >
                          {isOpen ? "▼" : "▶"}{" "}
                          {log.template?.label || "Custom email"} —{" "}
                          {new Date(log.sentAt).toLocaleString()}
                        </s-button>

                        {/* Expanded content */}
                        {isOpen && (
                          <s-stack direction="block" gap="extraTight">
                            <s-text>
                              <strong>Subject:</strong> {log.subject}
                            </s-text>
                            <s-text>
                              <strong>Body preview:</strong>{"\n"}
                              {preview}
                              {hasMore ? "…" : ""}
                            </s-text>
                          </s-stack>
                        )}
                      </s-box>
                    );
                  })}
                </s-stack>
              </s-box>
            )}
          </>
        )}
      </s-stack>
    </s-admin-block>
  );
}
