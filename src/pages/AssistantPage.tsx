import { Bot, ChevronRight, MoreVertical, Plus, Search, Send } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui.tsx";
import { answerQuestion, suggestedQuestions, type AnswerTable, type AssistantContext } from "@/lib/assistant.ts";
import { cn } from "@/lib/cn.ts";
import { useDb } from "@/lib/db.ts";
import type { Database } from "@/types/domain.ts";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  table?: AnswerTable;
  at: number;
}

interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  context: AssistantContext;
  updatedAt: number;
}

export function AssistantPage() {
  const db = useDb();
  const [openedAt] = useState(timestamp);
  const [chats, setChats] = useState<Chat[]>(() => [blankChat()]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlace, setEditPlace] = useState<"header" | "list" | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const skipTitleCommit = useRef(false);
  const active = chats.find((chat) => chat.id === activeId) ?? chats[0];
  const visible = chats.filter((chat) => chat.title.includes(keyword.trim()));
  const stats = useMemo(() => todayStats(db), [db]);

  function send(raw: string) {
    const text = raw.trim();
    const current = active;
    if (!text || !current) return;
    const answer = answerQuestion(db, text, current.context);
    const now = timestamp();
    const next: Chat = {
      ...current,
      title: current.messages.length === 0 && current.title === "새 대화" ? text : current.title,
      context: answer.context,
      updatedAt: now,
      messages: [
        ...current.messages,
        { id: crypto.randomUUID(), role: "user", text, at: now },
        { id: crypto.randomUUID(), role: "assistant", text: answer.text, table: answer.table, at: now },
      ],
    };
    setActiveId(current.id);
    setChats((list) => list.map((chat) => (chat.id === current.id ? next : chat)));
    setDraft("");
  }

  function createChat() {
    const chat = blankChat();
    setChats((list) => [chat, ...list]);
    setActiveId(chat.id);
    setDraft("");
  }

  function renameChat(id: string, title: string) {
    const next = title.trim() || "새 대화";
    setChats((list) => list.map((chat) => (chat.id === id ? { ...chat, title: next } : chat)));
  }

  function commitTitle() {
    if (skipTitleCommit.current) {
      skipTitleCommit.current = false;
      return;
    }
    if (editingId) renameChat(editingId, titleDraft);
    setEditingId(null);
    setEditPlace(null);
  }

  function startRename(chat: Chat, place: "header" | "list") {
    setActiveId(chat.id);
    setEditingId(chat.id);
    setEditPlace(place);
    setTitleDraft(chat.title);
  }

  function clearChat(id: string) {
    setChats((list) => list.map((chat) => (chat.id === id ? { ...chat, messages: [], context: { orderIds: [] } } : chat)));
  }

  return (
    <div className="-mx-6 -my-6 flex h-[calc(100dvh-6.5rem)] min-h-[560px] overflow-hidden bg-canvas">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="space-y-3 p-4">
          <button type="button" className="flex h-10 w-full items-center justify-center gap-1 rounded-lg bg-primary font-semibold text-white" onClick={createChat}>
            <Plus size={16} /> 새 대화
          </button>
          <label className="relative block">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input className="h-10 w-full rounded-lg border border-line bg-white pr-3 pl-8 text-sm" value={keyword} placeholder="대화 검색" onChange={(event) => setKeyword(event.target.value)} />
          </label>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          <ChatGroup label="오늘" chats={visible.filter((chat) => sameDay(chat.updatedAt, openedAt))} activeId={active?.id} editingId={editPlace === "list" ? editingId : null} titleDraft={titleDraft} onTitleDraft={setTitleDraft} onCommitTitle={commitTitle} onCancelTitle={() => { skipTitleCommit.current = true; setEditingId(null); setEditPlace(null); }} onSelect={setActiveId} onRename={startRename} onClear={clearChat} />
          <ChatGroup label="지난 7일" chats={visible.filter((chat) => !sameDay(chat.updatedAt, openedAt) && openedAt - chat.updatedAt < 7 * 86_400_000)} activeId={active?.id} editingId={editPlace === "list" ? editingId : null} titleDraft={titleDraft} onTitleDraft={setTitleDraft} onCommitTitle={commitTitle} onCancelTitle={() => { skipTitleCommit.current = true; setEditingId(null); setEditPlace(null); }} onSelect={setActiveId} onRename={startRename} onClear={clearChat} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-3">
          {active && editingId === active.id && editPlace === "header" ? (
            <input
              className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2 font-semibold"
              value={titleDraft}
              autoFocus
              aria-label="대화 제목"
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitle();
                }
                if (event.key === "Escape") {
                  skipTitleCommit.current = true;
                  setEditingId(null);
                  setEditPlace(null);
                }
              }}
            />
          ) : <h1 className="truncate font-semibold">{active?.title || "새 대화"}</h1>}
          {active ? <ChatMenu onRename={() => startRename(active, "header")} onClear={() => clearChat(active.id)} /> : null}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {active && active.messages.length === 0 ? (
            <p className="text-sm text-muted">추천 질문을 누르거나, 납기·작업지시·생산라인·미입금처럼 입력해 주세요.</p>
          ) : null}
          {active?.messages.map((message) => (
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl bg-primary-soft px-4 py-2 text-sm">
                  {message.text}
                  <span className="ml-2 text-xs text-muted">{clock(message.at)}</span>
                </p>
              </div>
            ) : (
              <div key={message.id} id={message.id} className="flex items-start gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-white"><Bot size={16} /></span>
                <div className="min-w-0 flex-1 rounded-xl border border-line bg-white p-4">
                  <p className="text-sm">{message.text}</p>
                  {message.table ? <AnswerGrid table={message.table} /> : null}
                  <p className="mt-2 text-xs text-muted">{clock(message.at)}</p>
                </div>
              </div>
            )
          ))}
        </div>
        <form className="border-t border-line bg-white px-5 py-3" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
          <div className="mb-2 flex gap-2 overflow-x-auto lg:hidden">
            {suggestedQuestions.map((question) => (
              <button key={question} type="button" className="shrink-0 rounded-full border border-line px-3 py-1 text-xs" onClick={() => send(question)}>{question}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm" value={draft} placeholder="이번 주 납기, 진행 중인 작업지시, 생산라인, 미입금 거래를 물어보세요." onChange={(event) => setDraft(event.target.value)} />
            <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-white disabled:opacity-40" disabled={!draft.trim()} aria-label="보내기"><Send size={16} /></button>
          </div>
          <p className="mt-2 text-xs text-muted">저장된 수주·작업지시·생산라인 데이터로 답합니다. 외부 AI는 호출하지 않습니다.</p>
        </form>
      </section>

      <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-canvas p-4 lg:flex">
        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">추천 질문</h2>
          <ul className="mt-2">
            {suggestedQuestions.map((question) => (
              <li key={question} className="border-t border-line first:border-t-0">
                <button type="button" className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm hover:text-primary" onClick={() => send(question)}>
                  <span>{question}</span>
                  <ChevronRight size={14} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">최근 조회한 결과</h2>
          <ul className="mt-2 space-y-2">
            {(active?.messages.filter((message) => message.role === "assistant" && message.table) ?? []).slice(-5).reverse().map((message) => (
              <li key={message.id}>
                <a href={`#${message.id}`} className="block rounded-lg px-2 py-1 text-sm hover:bg-canvas">
                  <span className="line-clamp-2">{message.text}</span>
                  <span className="text-xs text-muted">{message.table?.rows.length ?? 0}건 · {clock(message.at)}</span>
                </a>
              </li>
            ))}
            {active?.messages.some((message) => message.table) ? null : <li className="text-sm text-muted">아직 조회한 결과가 없습니다.</li>}
          </ul>
        </section>
        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">오늘의 주요 현황</h2>
          <ul className="mt-2 space-y-2">
            {stats.map((item) => (
              <li key={item.label}>
                <button type="button" className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-canvas" onClick={() => send(item.question)}>
                  <span className="text-sm">{item.label}</span>
                  <span className="font-semibold text-primary">{item.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function ChatGroup({
  label,
  chats,
  activeId,
  editingId,
  titleDraft,
  onTitleDraft,
  onCommitTitle,
  onCancelTitle,
  onSelect,
  onRename,
  onClear,
}: {
  label: string;
  chats: Chat[];
  activeId: string | undefined;
  editingId: string | null;
  titleDraft: string;
  onTitleDraft: (value: string) => void;
  onCommitTitle: () => void;
  onCancelTitle: () => void;
  onSelect: (id: string) => void;
  onRename: (chat: Chat, place: "list") => void;
  onClear: (id: string) => void;
}) {
  if (chats.length === 0) return null;
  return (
    <div>
      <p className="px-2 text-xs font-semibold text-muted">{label}</p>
      <ul className="mt-1 space-y-1">
        {chats.map((chat) => (
          <li key={chat.id} className={cn("flex items-center gap-1 rounded-lg pr-1", chat.id === activeId ? "bg-primary-soft" : "hover:bg-canvas")}>
            {editingId === chat.id ? (
              <input
                className="m-1 h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-sm font-semibold"
                value={titleDraft}
                autoFocus
                aria-label="대화 제목"
                onChange={(event) => onTitleDraft(event.target.value)}
                onBlur={onCommitTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onCommitTitle();
                  }
                  if (event.key === "Escape") onCancelTitle();
                }}
              />
            ) : (
              <button type="button" className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => onSelect(chat.id)}>
                <span className="block truncate text-sm font-semibold">{chat.title}</span>
                <span className="text-xs text-muted">{clock(chat.updatedAt)}</span>
              </button>
            )}
            <ChatMenu onRename={() => onRename(chat, "list")} onClear={() => onClear(chat.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatMenu({ onRename, onClear }: { onRename: () => void; onClear: () => void }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white"
        aria-label="대화 메뉴"
        aria-expanded={position !== null}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition(position ? null : { top: rect.bottom + 4, left: Math.max(8, rect.right - 144) });
        }}
      >
        <MoreVertical size={16} />
      </button>
      {position ? (
        <>
          <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="메뉴 닫기" onClick={() => setPosition(null)} />
          <div className="fixed z-30 w-36 rounded-lg border border-line bg-white py-1 shadow-lg" style={{ top: position.top, left: position.left }} role="menu">
            <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-canvas" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => { setPosition(null); onRename(); }}>제목 수정</button>
            <button type="button" className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-canvas" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => { setPosition(null); onClear(); }}>대화 내용 삭제</button>
          </div>
        </>
      ) : null}
    </>
  );
}

function AnswerGrid({ table }: { table: AnswerTable }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-primary-soft/40 text-muted">
          <tr>{table.columns.map((column) => <th key={column} className="px-3 py-2 font-medium">{column}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={row.href ?? rowIndex} className="border-t border-line">
              {row.cells.map((cell, index) => (
                <td key={`${cell.text}-${index}`} className="px-3 py-2">
                  {index === 0 && row.href ? <Link className="font-semibold text-primary" to={row.href}>{cell.text}</Link> : cell.className ? <Badge className={cell.className}>{cell.text}</Badge> : cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function blankChat(): Chat {
  return { id: crypto.randomUUID(), title: "새 대화", messages: [], context: { orderIds: [] }, updatedAt: timestamp() };
}

function timestamp(): number {
  return Date.now();
}

function todayStats(db: Database): Array<{ label: string; value: string; question: string }> {
  const running = db.workOrders.filter((item) => item.status === "IN_PRODUCTION").length;
  const available = db.lines.filter((line) => line.status === "AVAILABLE").length;
  const unpaidClients = new Set(db.orders.filter((order) => order.status !== "CANCELLED" && order.paymentStatus !== "PAID").map((order) => order.clientId)).size;
  return [
    { label: "진행 중 작업지시서", value: `${running}건`, question: suggestedQuestions[1] },
    { label: "가동 가능 생산라인", value: `${available}개`, question: suggestedQuestions[3] },
    { label: "미입금 거래처", value: `${unpaidClients}곳`, question: suggestedQuestions[4] },
  ];
}

function sameDay(left: number, right: number): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function clock(stamp: number): string {
  const date = new Date(stamp);
  const hour = date.getHours();
  const mark = hour < 12 ? "오전" : "오후";
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${mark} ${String(shown).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
