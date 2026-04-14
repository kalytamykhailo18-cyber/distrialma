"use client";

import { useEffect, useState, useRef } from "react";
import { HiSearch, HiPaperAirplane } from "react-icons/hi";

interface Chat {
  id: number;
  chatId: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

interface Message {
  id: number;
  chatId: string;
  direction: string;
  body: string;
  sender: string;
  timestamp: string;
}

export default function InboxPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  async function loadChats() {
    try {
      const url = search ? `/api/admin/inbox?search=${encodeURIComponent(search)}` : "/api/admin/inbox";
      const res = await fetch(url);
      const d = await res.json();
      setChats(d.chats || []);
    } catch {}
    setLoading(false);
  }

  async function loadMessages(chatId: string) {
    try {
      const res = await fetch(`/api/admin/inbox?chatId=${encodeURIComponent(chatId)}`);
      const d = await res.json();
      setMessages(d.messages || []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {}
  }

  async function sendReply() {
    if (!reply.trim() || !selectedChat) return;
    setSending(true);
    try {
      await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChat, message: reply.trim() }),
      });
      setReply("");
      await loadMessages(selectedChat);
      await loadChats();
    } catch {}
    setSending(false);
  }

  function selectChat(chatId: string) {
    setSelectedChat(chatId);
    loadMessages(chatId);
  }

  useEffect(() => { loadChats(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for new messages
  useEffect(() => {
    pollRef.current = setInterval(() => {
      loadChats();
      if (selectedChat) loadMessages(selectedChat);
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [selectedChat]); // eslint-disable-line react-hooks/exhaustive-deps

  function formatTime(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Chat list */}
      <div className={`w-full sm:w-80 lg:w-96 border-r flex flex-col bg-white ${selectedChat ? "hidden sm:flex" : "flex"}`}>
        <div className="p-3 border-b">
          <div className="relative">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); }}
              onKeyUp={() => loadChats()}
              placeholder="Buscar chat..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <p className="p-4 text-gray-400 text-sm">Cargando...</p> :
            chats.length === 0 ? <p className="p-4 text-gray-400 text-sm">No hay chats.</p> :
            chats.map((chat) => (
              <button key={chat.chatId} onClick={() => selectChat(chat.chatId)}
                className={`w-full px-4 py-3 flex items-start gap-3 text-left border-b hover:bg-gray-50 ${selectedChat === chat.chatId ? "bg-brand-50 border-l-4 border-l-brand-500" : ""}`}>
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-bold shrink-0">
                  {(chat.contactName || chat.contactPhone || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{chat.contactName || chat.contactPhone}</span>
                    <span className="text-xs text-gray-400 shrink-0">{formatTime(chat.lastMessageAt)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{chat.lastMessage}</p>
                </div>
                {chat.unread > 0 && (
                  <span className="w-5 h-5 bg-brand-500 text-white rounded-full text-xs flex items-center justify-center shrink-0">{chat.unread}</span>
                )}
              </button>
            ))
          }
        </div>
      </div>

      {/* Messages */}
      <div className={`flex-1 flex flex-col bg-gray-100 ${selectedChat ? "flex" : "hidden sm:flex"}`}>
        {selectedChat ? (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 bg-white border-b flex items-center gap-3">
              <button onClick={() => setSelectedChat(null)} className="sm:hidden text-gray-500 mr-1">←</button>
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-bold">
                {(chats.find((c) => c.chatId === selectedChat)?.contactName || "?")[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {chats.find((c) => c.chatId === selectedChat)?.contactName || selectedChat}
                </div>
                <div className="text-xs text-gray-400">
                  {chats.find((c) => c.chatId === selectedChat)?.contactPhone}
                </div>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    msg.direction === "out"
                      ? msg.sender === "bot" ? "bg-blue-100 text-blue-900" : "bg-green-100 text-green-900"
                      : "bg-white text-gray-900 shadow-sm"
                  }`}>
                    {msg.sender && msg.direction === "out" && (
                      <div className="text-xs font-medium mb-0.5 opacity-60">{msg.sender === "bot" ? "Bot" : "Agente"}</div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <div className="text-xs opacity-40 text-right mt-1">{formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            <div className="p-3 bg-white border-t flex gap-2">
              <input type="text" value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder="Escribir mensaje..."
                className="flex-1 px-4 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                className="px-4 py-2 bg-brand-500 text-white rounded-lg disabled:opacity-50">
                <HiPaperAirplane className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Selecciona un chat para ver los mensajes
          </div>
        )}
      </div>
    </div>
  );
}
