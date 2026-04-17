"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { HiSearch, HiPaperAirplane, HiOutlineUser, HiOutlineLocationMarker, HiOutlineCurrencyDollar, HiOutlineClipboardList, HiOutlineX, HiOutlineLightningBolt, HiOutlinePlus, HiOutlineTrash } from "react-icons/hi";
import { formatPrice } from "@/lib/utils";
import { PageTransition, Stagger, springBtn, hoverRow, CollapsiblePanel } from "@/components/AnimateIn";

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
  mediaType?: string | null;
}

interface CustomerClient {
  cod: string;
  nombre: string;
  cuit: string;
  saldo: number;
  calle: string;
  localidad: string;
  telefono: string;
}

interface CustomerOrder {
  boleta: string;
  fechora: string;
  total: number;
  items: number;
}

interface CustomerInfo {
  found: boolean;
  clients?: CustomerClient[];
  orders?: CustomerOrder[];
}

interface QuickReply {
  id: number;
  shortcut: string;
  body: string;
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
  const lastMsgCount = useRef(0);
  const userScrolled = useRef(false);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrManage, setQrManage] = useState(false);
  const [newQrShortcut, setNewQrShortcut] = useState("");
  const [newQrBody, setNewQrBody] = useState("");

  async function loadQuickReplies() {
    try {
      const res = await fetch("/api/admin/quick-replies");
      const d = await res.json();
      setQuickReplies(d.replies || []);
    } catch {}
  }

  async function saveQuickReply() {
    if (!newQrShortcut.trim() || !newQrBody.trim()) return;
    await fetch("/api/admin/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut: newQrShortcut, body: newQrBody }),
    });
    setNewQrShortcut("");
    setNewQrBody("");
    loadQuickReplies();
  }

  async function deleteQuickReply(id: number) {
    await fetch(`/api/admin/quick-replies?id=${id}`, { method: "DELETE" });
    loadQuickReplies();
  }

  useEffect(() => { loadQuickReplies(); }, []);

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
      const newMsgs = d.messages || [];
      setMessages(newMsgs);
      if (newMsgs.length !== lastMsgCount.current) {
        lastMsgCount.current = newMsgs.length;
        if (!userScrolled.current) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
      }
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
      userScrolled.current = false;
      await loadMessages(selectedChat);
      await loadChats();
    } catch {}
    setSending(false);
  }

  async function loadCustomer(phone: string) {
    if (!phone) return;
    setCustomer(null);
    setCustomerLoading(true);
    try {
      const res = await fetch(`/api/admin/inbox/customer?phone=${encodeURIComponent(phone)}`);
      const d = await res.json();
      setCustomer(d);
    } catch { setCustomer({ found: false }); }
    setCustomerLoading(false);
  }

  function selectChat(chatId: string) {
    setSelectedChat(chatId);
    userScrolled.current = false;
    lastMsgCount.current = 0;
    setCustomerOpen(false);
    loadMessages(chatId);
    // Load customer info based on chat's contactPhone
    const chat = chats.find((c) => c.chatId === chatId);
    if (chat) loadCustomer(chat.contactPhone || chatId);
  }

  function formatOrderDate(f: string): string {
    if (!f || f.length < 8) return f;
    return `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;
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
    <PageTransition className="h-[calc(100vh-64px)] flex">
      {/* Chat list */}
      <div className={`w-full sm:w-80 lg:w-96 border-r flex flex-col bg-white ${selectedChat ? "hidden sm:flex" : "flex"}`}>
        <Stagger delay={0} className="p-3 border-b">
          <div className="relative">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); }}
              onKeyUp={() => loadChats()}
              placeholder="Buscar chat..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
          </div>
        </Stagger>
        <div className="flex-1 overflow-y-auto">
          {loading ? <p className="p-4 text-gray-400 text-sm">Cargando...</p> :
            chats.length === 0 ? <p className="p-4 text-gray-400 text-sm">No hay chats.</p> :
            chats.map((chat) => (
              <button key={chat.chatId} onClick={() => selectChat(chat.chatId)}
                className={`w-full px-4 py-3 flex items-start gap-3 text-left border-b ${hoverRow} ${selectedChat === chat.chatId ? "bg-brand-50 border-l-4 border-l-brand-500" : ""}`}>
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
            <Stagger delay={60} className="px-4 py-3 bg-white border-b flex items-center gap-3">
              <button onClick={() => setSelectedChat(null)} className={`sm:hidden text-gray-500 mr-1 ${springBtn}`}>←</button>
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-bold">
                {(chats.find((c) => c.chatId === selectedChat)?.contactName || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {chats.find((c) => c.chatId === selectedChat)?.contactName || selectedChat}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {chats.find((c) => c.chatId === selectedChat)?.contactPhone}
                </div>
              </div>
              <button
                onClick={() => setCustomerOpen((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${springBtn} ${
                  customer?.found ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                title={customer?.found ? `Cliente: ${customer.clients?.[0].nombre}` : "Ver info cliente"}
              >
                <HiOutlineUser className="w-4 h-4" />
              </button>
            </Stagger>

            {/* Customer info panel */}
            <CollapsiblePanel open={customerOpen}>
              <div className="bg-gradient-to-b from-green-50 to-white border-b border-green-200 px-4 py-3">
                {customerLoading ? (
                  <p className="text-xs text-gray-500">Buscando cliente...</p>
                ) : !customer?.found ? (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">No es cliente registrado en PunTouch.</p>
                    <button onClick={() => setCustomerOpen(false)} className={`text-gray-400 ${springBtn}`}>
                      <HiOutlineX className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    {customer.clients && customer.clients.map((c) => (
                      <div key={c.cod} className="mb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <HiOutlineUser className="w-4 h-4 text-green-600 shrink-0" />
                            <span className="text-sm font-semibold text-gray-900 truncate">{c.nombre}</span>
                            <span className="text-xs text-gray-400">#{c.cod}</span>
                          </div>
                          <Link href={`/admin/dashboard/cliente?cod=${c.cod}`} target="_blank" className="text-xs text-brand-600 hover:underline shrink-0 ml-2">
                            Ver perfil
                          </Link>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-600">
                          {c.calle && (
                            <span className="flex items-center gap-1">
                              <HiOutlineLocationMarker className="w-3 h-3 text-gray-400" />
                              {c.calle}{c.localidad ? ", " + c.localidad : ""}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <HiOutlineCurrencyDollar className={`w-3 h-3 ${c.saldo < 0 ? "text-red-500" : "text-green-500"}`} />
                            <span className={`font-medium ${c.saldo < 0 ? "text-red-600" : "text-green-600"}`}>
                              Saldo: {formatPrice(c.saldo)}
                            </span>
                          </span>
                          {c.cuit && <span className="text-gray-400">CUIT: {c.cuit}</span>}
                        </div>
                      </div>
                    ))}
                    {customer.orders && customer.orders.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-green-200">
                        <div className="flex items-center gap-1 mb-1">
                          <HiOutlineClipboardList className="w-3 h-3 text-gray-400" />
                          <span className="text-xs font-medium text-gray-700">Ultimas compras ({customer.orders.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {customer.orders.slice(0, 6).map((o) => (
                            <div key={o.boleta} className="bg-white border rounded px-2 py-1 text-xs">
                              <span className="text-gray-500">{formatOrderDate(o.fechora)}</span>
                              <span className="ml-2 text-gray-400">#{o.boleta}</span>
                              <span className="ml-2 font-medium text-gray-900">{formatPrice(o.total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CollapsiblePanel>

            {/* Messages area */}
            <Stagger delay={120} className="flex-1 overflow-y-auto p-4 space-y-2">

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
                  style={{ animation: "fadeSlideUp 300ms cubic-bezier(0.25,1,0.5,1) both" }}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    msg.direction === "out"
                      ? msg.sender === "bot" ? "bg-blue-100 text-blue-900" : "bg-green-100 text-green-900"
                      : "bg-white text-gray-900 shadow-sm"
                  }`}>
                    {msg.sender && msg.direction === "out" && (
                      <div className="text-xs font-medium mb-0.5 opacity-60">{msg.sender === "bot" ? "Bot" : "Agente"}</div>
                    )}
                    {msg.mediaType?.startsWith("image") && msg.body.startsWith("[Imagen]") ? (
                      (() => {
                        const filePath = msg.body.replace("[Imagen] ", "").trim();
                        const src = `/api/admin/inbox/media/${filePath}`;
                        return (
                          <a href={src} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt="Imagen enviada"
                              className="max-w-full max-h-64 rounded-lg mb-1 border" />
                            <div className="text-[11px] opacity-60">Abrir</div>
                          </a>
                        );
                      })()
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    )}
                    <div className="text-xs opacity-40 text-right mt-1">{formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </Stagger>

            {/* Quick replies panel */}
            <CollapsiblePanel open={qrOpen}>
              <div className="bg-yellow-50 border-t border-yellow-200 px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-yellow-800">Respuestas rapidas</span>
                  <div className="flex gap-1">
                    <button onClick={() => setQrManage((v) => !v)} className={`text-xs text-yellow-700 hover:text-yellow-900 ${springBtn}`}>
                      {qrManage ? "Listo" : "Administrar"}
                    </button>
                    <button onClick={() => setQrOpen(false)} className={`text-yellow-700 ${springBtn}`}>
                      <HiOutlineX className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {qrManage ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input type="text" value={newQrShortcut} onChange={(e) => setNewQrShortcut(e.target.value)}
                        placeholder="Atajo (ej: saludo)"
                        className="w-32 px-2 py-1 border border-yellow-300 rounded text-xs focus:outline-none focus:border-yellow-500" />
                      <input type="text" value={newQrBody} onChange={(e) => setNewQrBody(e.target.value)}
                        placeholder="Mensaje..."
                        className="flex-1 px-2 py-1 border border-yellow-300 rounded text-xs focus:outline-none focus:border-yellow-500" />
                      <button onClick={saveQuickReply} disabled={!newQrShortcut.trim() || !newQrBody.trim()}
                        className={`px-3 py-1 bg-yellow-500 text-white rounded text-xs font-medium disabled:opacity-50 ${springBtn}`}>
                        <HiOutlinePlus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {quickReplies.length === 0 ? (
                        <p className="text-xs text-gray-400">Sin respuestas rapidas. Agrega una arriba.</p>
                      ) : quickReplies.map((qr) => (
                        <div key={qr.id} className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1 border border-yellow-100">
                          <span className="font-mono font-bold text-yellow-700 shrink-0">/{qr.shortcut}</span>
                          <span className="flex-1 text-gray-700 truncate">{qr.body}</span>
                          <button onClick={() => deleteQuickReply(qr.id)} className={`text-red-400 hover:text-red-600 ${springBtn}`}>
                            <HiOutlineTrash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {quickReplies.length === 0 ? (
                      <p className="text-xs text-gray-500">Sin respuestas rapidas. Tocá &quot;Administrar&quot; para agregar.</p>
                    ) : quickReplies.map((qr) => (
                      <button key={qr.id}
                        onClick={() => { setReply(qr.body); setQrOpen(false); }}
                        className={`px-2 py-1 bg-white border border-yellow-300 rounded-lg text-xs text-gray-700 hover:bg-yellow-100 hover:border-yellow-500 transition-colors ${springBtn}`}
                        title={qr.body}>
                        /{qr.shortcut}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CollapsiblePanel>

            {/* Reply input */}
            <Stagger delay={180} className="p-3 bg-white border-t flex gap-2">
              <button onClick={() => setQrOpen((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${springBtn} ${
                  qrOpen ? "bg-yellow-200 text-yellow-800" : "bg-gray-100 text-gray-500 hover:bg-yellow-100"
                }`}
                title="Respuestas rapidas">
                <HiOutlineLightningBolt className="w-5 h-5" />
              </button>
              <input type="text" value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder="Escribir mensaje..."
                className="flex-1 px-4 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                className={`px-4 py-2 bg-brand-500 text-white rounded-lg disabled:opacity-50 ${springBtn}`}>
                <HiPaperAirplane className="w-5 h-5" />
              </button>
            </Stagger>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Selecciona un chat para ver los mensajes
          </div>
        )}
      </div>
    </PageTransition>
  );
}
