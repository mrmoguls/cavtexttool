import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtimeTable } from '../hooks/useRealtime'
import { Button } from '../components/ui/Button'
import type { Driver, Message } from '../types'
import { Send } from 'lucide-react'

interface DispatchThreadProps {
  driver: Driver
  onBack: () => void
}

export function DispatchThread({ driver, onBack }: DispatchThreadProps) {
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

    // Mark driver messages as read
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('driver_id', driver.id)
      .eq('sender', 'driver')
      .is('read_at', null)
  }, [driver.id])

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
      sender: 'dispatch',
      body: text,
    })
    setSending(false)
  }

  return (
    <div className="min-h-svh bg-[#EAE5E0] flex flex-col">
      <div className="bg-[#F5F1ED] border-b border-[#D9D2CA] px-4 py-3 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-[#C17F4A] font-medium">← Back</button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-full bg-[#F0E4D4] flex items-center justify-center text-[#C17F4A] font-semibold text-sm">
              {driver.name.charAt(0)}
            </div>
            <p className="font-semibold text-[#3D2E26] text-sm">{driver.name}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-[#8C7B72] text-sm py-12">No messages with {driver.name.split(' ')[0]} yet.</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'dispatch' ? 'justify-end' : 'justify-start'}`}>
            <div className={`
              max-w-[78%] rounded-2xl px-4 py-2.5
              ${msg.sender === 'dispatch'
                ? 'bg-[#C17F4A] text-white rounded-br-md'
                : 'bg-[#F5F1ED] text-[#3D2E26] rounded-bl-md shadow-sm'}
            `}>
              {msg.sender === 'driver' && (
                <p className="text-[10px] font-semibold text-[#8C7B72] mb-1">{driver.name.split(' ')[0]}</p>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
              <p className={`text-[10px] mt-1 ${msg.sender === 'dispatch' ? 'text-white/60' : 'text-[#8C7B72]'}`}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 bg-[#F5F1ED] border-t border-[#D9D2CA]">
        <div className="flex gap-2 items-end">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder={`Message ${driver.name.split(' ')[0]}…`}
            rows={1}
            className="flex-1 bg-[#EAE5E0] rounded-xl px-4 py-2.5 text-sm text-[#3D2E26] resize-none outline-none border-2 border-transparent focus:border-[#C17F4A] transition-colors placeholder:text-[#8C7B72]"
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
