import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../../store/gameStore.js';
import { getSocket } from '../../socket.js';
import { SUIT_SYMBOLS } from '@goatbridge/shared';

interface RoomChatProps {
  messages: ChatMessage[];
  roomCode: string;
}

export default function RoomChat({ messages, roomCode }: RoomChatProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    getSocket().emit('chat_message', { roomCode, text: input.trim() });
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-navy/80 border border-gold/20 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-gold/20 text-gold text-sm font-bold">Chat</div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
        {messages.map((msg, i) => (
          <div key={i} className="group">
            <span className="text-cream/50">
              {msg.seat ? `[${msg.seat[0]?.toUpperCase()}] ` : ''}
              <span className="text-cream/80 font-medium">{msg.displayName}</span>:{' '}
            </span>
            <span className="text-cream/90">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); sendMessage(); }}
        className="flex gap-1 p-2 border-t border-gold/20"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Say something…"
          maxLength={500}
          className="flex-1 bg-navy border border-gold/20 text-cream text-xs rounded px-2 py-1 focus:outline-none focus:border-gold/50"
        />
        <button
          type="submit"
          className="text-gold text-xs px-2 py-1 hover:text-gold-light transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
