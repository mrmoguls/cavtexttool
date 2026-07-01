import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtimeTable } from '../hooks/useRealtime'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import type { Driver, Message } from '../types'
import { Send, MessageSquare } from 'lucide-react'

interface DriverMessagesProps {
  driver: Driver
  onMessagesRead: () => void
}

export function DriverMessages({ driver, onMessagesRead }: DriverMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('driver_id', driver.id)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as Message[])

    // Mark dispatch messages as read
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('driver_id', driver.id)
      .eq('sender', 'dispatch')
      .is('read_at', null)

    onMessagesRead()
  }, [driver.id, onMessagesRead])

  useEffect(() => { load() }, [load])
  useRealtimeTable('messages', load)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    setBody('')
    await supabase.from('messages').insert({
      driver_id: driver.id,
      sender: 'driver',
      body: text,
    })
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 bg-[#FFFFFF] border-b border-[#D8DFEF]">
        <p className="text-xs text-[#6B7A99] text-center">Direct line to dispatch · Messages are private</p>
      </div>

      <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <EmptyState
            icon={<MessageSquare />}
            title="No messages yet"
            body="Send a message to dispatch below. They'll see it right away."
          />
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'driver' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`
              max-w-[78%] rounded-2xl px-4 py-2.5
              ${msg.sender === 'driver'
                ? 'bg-[#CC2A2A] text-white rounded-br-md'
                : 'bg-[#FFFFFF] text-[#0B1A5C] rounded-bl-md shadow-sm'}
            `}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
              <p className={`text-[10px] mt-1 ${msg.sender === 'driver' ? 'text-white/60' : 'text-[#6B7A99]'}`}>
                {formatTime(msg.created_at)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 bg-[#FFFFFF] border-t border-[#D8DFEF]">
        <div className="flex gap-2 items-end">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder="Message dispatch…"
            rows={1}
            className="flex-1 bg-[#EEF1F8] rounded-xl px-4 py-2.5 text-sm text-[#0B1A5C] resize-none outline-none border-2 border-transparent focus:border-[#CC2A2A] transition-colors placeholder:text-[#6B7A99]"
            style={{ maxHeight: 120, overflowY: 'auto' }}
          />
          <Button
            size="sm"
            onClick={send}
            disabled={!body.trim() || sending}
            className="flex-shrink-0 h-[42px] w-[42px] rounded-xl p-0 flex items-center justify-center"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
