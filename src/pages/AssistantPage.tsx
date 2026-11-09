import { Bot, MoreVertical, Plus, Search, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readApiErrorMessage } from "@/lib/apiClient.ts";
import {
  AI_MODELS,
  askAi,
  createConversation,
  fetchConversation,
  fetchConversations,
  renameConversation,
  type AiConversation,
  type AiMessage,
  type AiModelId,
} from "@/lib/aiApi.ts";
import { cn } from "@/lib/cn.ts";
import { todayISO } from "@/lib/dates.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

export function AssistantPage() {
  const show = useToastStore((state) => state.show);
  const [chats, setChats] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [closed, setClosed] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [detailReady, setDetailReady] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<AiModelId>(AI_MODELS[0].id);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPlace, setEditPlace] = useState<"header" | "list" | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const skipTitleCommit = useRef(false);
  const active = chats.find((chat) => chat.conversationId === activeId) ?? null;
  const visible = chats.filter((chat) => (chat.title ?? "").includes(keyword.trim()));
  const today = todayISO();

  useEffect(() => {
    let ignore = false;
    void fetchConversations().then((rows) => {
      if (ignore) return;
      setChats(rows);
      setListReady(true);
    }).catch((error: unknown) => {
      if (ignore) return;
      setChats([]);
      setListReady(true);
      show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [show]);

  useEffect(() => {
    if (activeId == null) {
      setMessages([]);
      setClosed(false);
      setDetailReady(true);
      return;
    }
    let ignore = false;
    setDetailReady(false);
    void fetchConversation(activeId).then((detail) => {
      if (ignore) return;
      setMessages(detail.messages);
      setClosed(Boolean(detail.isClosed));
      setChats((list) => list.map((chat) => chat.conversationId === detail.conversationId
        ? { ...chat, title: detail.title ?? "새 대화", isClosed: Boolean(detail.isClosed) }
        : chat));
      setDetailReady(true);
    }).catch((error: unknown) => {
      if (ignore) return;
      setMessages([]);
      setDetailReady(true);
      show(readApiErrorMessage(error));
    });
    return () => {
      ignore = true;
    };
  }, [activeId, show]);

  async function openNewChat() {
    if (sending) return;
    try {
      const id = await createConversation();
      const created: AiConversation = {
        conversationId: id,
        title: "새 대화",
        isClosed: false,
        createdAt: new Date().toISOString(),
      };
      setChats((list) => [created, ...list.filter((chat) => chat.conversationId !== id)]);
      setActiveId(id);
      setDraft("");
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    }
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || sending || closed) return;
    setSending(true);
    try {
      const createdNow = activeId == null;
      const conversationId = activeId ?? await createConversation();
      if (createdNow) {
        setChats((list) => [{
          conversationId,
          title: "새 대화",
          isClosed: false,
          createdAt: new Date().toISOString(),
        }, ...list]);
      }
      await askAi(conversationId, model, text);
      setDraft("");
      // 새 대화는 선택 뒤에 상세 조회로 기록을 채운다. 이미 연 대화는 여기서 다시 읽는다.
      if (createdNow) {
        setActiveId(conversationId);
      } else {
        const detail = await fetchConversation(conversationId);
        setMessages(detail.messages);
        setClosed(Boolean(detail.isClosed));
        setChats((list) => list.map((chat) => chat.conversationId === conversationId
          ? { ...chat, title: detail.title ?? "새 대화", isClosed: Boolean(detail.isClosed) }
          : chat));
      }
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function commitTitle() {
    if (skipTitleCommit.current) {
      skipTitleCommit.current = false;
      return;
    }
    const id = editingId;
    const next = titleDraft.trim();
    setEditingId(null);
    setEditPlace(null);
    if (id == null) return;
    if (next.length === 0) {
      show("제목을 입력해주세요.");
      return;
    }
    if (next.length > 20) {
      show("제목은 20자 이하여야 합니다.");
      return;
    }
    try {
      await renameConversation(id, next);
      setChats((list) => list.map((chat) => chat.conversationId === id ? { ...chat, title: next } : chat));
    } catch (error: unknown) {
      show(readApiErrorMessage(error));
    }
  }

  function startRename(chat: AiConversation, place: "header" | "list") {
    if (chat.isClosed) {
      show("종료된 대화방의 제목은 바꿀 수 없습니다.");
      return;
    }
    setActiveId(chat.conversationId);
    setEditingId(chat.conversationId);
    setEditPlace(place);
    setTitleDraft(chat.title ?? "");
  }

  return (
    <div className="-mx-6 -my-6 flex h-[calc(100dvh-6.5rem)] min-h-[560px] overflow-hidden bg-canvas">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-white">
        <div className="space-y-3 p-4">
          <button type="button" className="flex h-10 w-full items-center justify-center gap-1 rounded-lg bg-primary font-semibold text-white" onClick={() => void openNewChat()}>
            <Plus size={16} /> 새 대화
          </button>
          <label className="relative block">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input className="h-10 w-full rounded-lg border border-line bg-white pr-3 pl-8 text-sm" value={keyword} placeholder="대화 검색" onChange={(event) => setKeyword(event.target.value)} />
          </label>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {!listReady ? <p className="px-2 text-sm text-muted">대화를 불러오는 중입니다.</p> : null}
          {listReady && visible.length === 0 ? <p className="px-2 text-sm text-muted">대화가 없습니다.</p> : null}
          <ChatGroup label="오늘" chats={visible.filter((chat) => dayKey(chat.createdAt) === today)} activeId={activeId} editingId={editPlace === "list" ? editingId : null} titleDraft={titleDraft} onTitleDraft={setTitleDraft} onCommitTitle={() => void commitTitle()} onCancelTitle={() => { skipTitleCommit.current = true; setEditingId(null); setEditPlace(null); }} onSelect={setActiveId} onRename={startRename} />
          <ChatGroup label="지난 7일" chats={visible.filter((chat) => dayKey(chat.createdAt) !== today && ageDays(chat.createdAt) < 7)} activeId={activeId} editingId={editPlace === "list" ? editingId : null} titleDraft={titleDraft} onTitleDraft={setTitleDraft} onCommitTitle={() => void commitTitle()} onCancelTitle={() => { skipTitleCommit.current = true; setEditingId(null); setEditPlace(null); }} onSelect={setActiveId} onRename={startRename} />
          <ChatGroup label="이전" chats={visible.filter((chat) => ageDays(chat.createdAt) >= 7)} activeId={activeId} editingId={editPlace === "list" ? editingId : null} titleDraft={titleDraft} onTitleDraft={setTitleDraft} onCommitTitle={() => void commitTitle()} onCancelTitle={() => { skipTitleCommit.current = true; setEditingId(null); setEditPlace(null); }} onSelect={setActiveId} onRename={startRename} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-3">
          {active && editingId === active.conversationId && editPlace === "header" ? (
            <input
              className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2 font-semibold"
              value={titleDraft}
              autoFocus
              maxLength={20}
              aria-label="대화 제목"
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitTitle();
                }
                if (event.key === "Escape") {
                  skipTitleCommit.current = true;
                  setEditingId(null);
                  setEditPlace(null);
                }
              }}
            />
          ) : <h1 className="truncate font-semibold">{active?.title || "새 대화"}</h1>}
          {active ? <ChatMenu onRename={() => startRename(active, "header")} /> : null}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {activeId == null ? <p className="text-sm text-muted">새 대화를 만들거나 목록에서 대화를 선택하세요.</p> : null}
          {activeId != null && !detailReady ? <p className="text-sm text-muted">대화를 불러오는 중입니다.</p> : null}
          {detailReady && messages.length === 0 && activeId != null ? <p className="text-sm text-muted">질문을 입력하면 선택한 모델이 답합니다.</p> : null}
          {messages.map((message) => (
            message.role === "USER" ? (
              <div key={message.messageId} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl bg-primary-soft px-4 py-2 text-sm">
                  {message.content}
                  <span className="ml-2 text-xs text-muted">{clock(message.createdAt)}</span>
                </p>
              </div>
            ) : (
              <div key={message.messageId} className="flex items-start gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-white"><Bot size={16} /></span>
                <div className="min-w-0 flex-1 rounded-xl border border-line bg-white p-4">
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="mt-2 text-xs text-muted">{clock(message.createdAt)}</p>
                </div>
              </div>
            )
          ))}
          {sending ? <p className="text-sm text-muted">답변을 작성하고 있습니다.</p> : null}
        </div>
        <form className="border-t border-line bg-white px-5 py-3" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
          <div className="mb-2 flex items-center gap-2">
            <label className="text-xs text-muted" htmlFor="ai-model">모델</label>
            <select id="ai-model" className="h-9 rounded-lg border border-line bg-white px-2 text-sm" value={model} disabled={sending || closed} onChange={(event) => setModel(event.target.value as AiModelId)}>
              {AI_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm disabled:bg-canvas" value={draft} disabled={sending || closed} placeholder={closed ? "종료된 대화방입니다." : "질문을 입력하세요."} onChange={(event) => setDraft(event.target.value)} />
            <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-white disabled:opacity-40" disabled={!draft.trim() || sending || closed} aria-label="보내기"><Send size={16} /></button>
          </div>
        </form>
      </section>
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
}: {
  label: string;
  chats: AiConversation[];
  activeId: number | null;
  editingId: number | null;
  titleDraft: string;
  onTitleDraft: (value: string) => void;
  onCommitTitle: () => void;
  onCancelTitle: () => void;
  onSelect: (id: number) => void;
  onRename: (chat: AiConversation, place: "list") => void;
}) {
  if (chats.length === 0) return null;
  return (
    <div>
      <p className="px-2 text-xs font-semibold text-muted">{label}</p>
      <ul className="mt-1 space-y-1">
        {chats.map((chat) => (
          <li key={chat.conversationId} className={cn("flex items-center gap-1 rounded-lg pr-1", chat.conversationId === activeId ? "bg-primary-soft" : "hover:bg-canvas")}>
            {editingId === chat.conversationId ? (
              <input
                className="m-1 h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-sm font-semibold"
                value={titleDraft}
                autoFocus
                maxLength={20}
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
              <button type="button" className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => onSelect(chat.conversationId)}>
                <span className="block truncate text-sm font-semibold">{chat.title || "새 대화"}</span>
                <span className="text-xs text-muted">{clock(chat.createdAt)}{chat.isClosed ? " · 종료" : ""}</span>
              </button>
            )}
            <ChatMenu onRename={() => onRename(chat, "list")} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatMenu({ onRename }: { onRename: () => void }) {
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
          </div>
        </>
      ) : null}
    </>
  );
}

function dayKey(stamp: string): string {
  const date = new Date(stamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function ageDays(stamp: string): number {
  return (Date.now() - new Date(stamp).getTime()) / 86_400_000;
}

function clock(stamp: string): string {
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "";
  const hour = date.getHours();
  const mark = hour < 12 ? "오전" : "오후";
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${mark} ${String(shown).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
