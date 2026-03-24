"use client";

import { useState, useEffect, useRef } from "react";
import { FaWhatsapp } from "react-icons/fa";

const CONTACTS = [
  { label: "Mayorista", phone: "5491154137677" },
  { label: "Distribuidora", phone: "5491150202134" },
  { label: "Proveedores", phone: "5491176003814" },
];

export default function WhatsAppButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-2 bg-white rounded-lg shadow-lg border overflow-hidden">
          {CONTACTS.map((c) => (
            <a
              key={c.phone}
              href={`https://wa.me/${c.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-sm text-gray-700 border-b last:border-b-0"
            >
              <FaWhatsapp className="w-5 h-5 text-green-500 shrink-0" />
              {c.label}
            </a>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
        aria-label="WhatsApp"
      >
        <FaWhatsapp className="w-7 h-7" />
      </button>
    </div>
  );
}
