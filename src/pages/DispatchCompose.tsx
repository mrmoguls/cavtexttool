import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import type { Driver } from '../types'
import { Image, Link, AlertCircle, X } from 'lucide-react'

interface DispatchComposeProps {
  drivers: Driver[]
  onDone: () => void
  onCancel: () => void
}

export function DispatchCompose({ onDone, onCancel }: DispatchComposeProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [requiresAck, setRequiresAck] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showImageField, setShowImageField] = useState(false)
  const [showVideoField, setShowVideoField] = useState(false)

  async function submit() {
    if (!title.trim()) { setError('Please add a title.'); return }
    if (!body.trim()) { setError('Please add a message.'); return }
    setSubmitting(true)
    const { error: err } = await supabase.from('announcements').insert({
      title: title.trim(),
      body: body.trim(),
      image_url: imageUrl.trim() || null,
      video_url: videoUrl.trim() || null,
      requires_ack: requiresAck,
      created_by: 'dispatch',
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    onDone()
  }

  return (
    <div className="min-h-svh bg-[#EAE5E0] flex flex-col">
      <div className="bg-[#F5F1ED] border-b border-[#D9D2CA] px-4 py-3 safe-top">
        <div className="flex items-center justify-between">
          <button onClick={onCancel} className="text-sm text-[#8C7B72]">Cancel</button>
          <h2 className="font-semibold text-[#3D2E26] text-sm">New Announcement</h2>
          <Button size="sm" onClick={submit} disabled={submitting}>
            {submitting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-4">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={() => setError('')} className="ml-auto"><X size={14} className="text-red-400" /></button>
          </div>
        )}

        <Card>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#8C7B72] uppercase tracking-wide">Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Schedule change this Friday"
                className="mt-1 w-full bg-[#EAE5E0] rounded-xl px-4 py-2.5 text-sm text-[#3D2E26] outline-none border-2 border-transparent focus:border-[#C17F4A] placeholder:text-[#8C7B72] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#8C7B72] uppercase tracking-wide">Message</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your announcement here…"
                rows={5}
                className="mt-1 w-full bg-[#EAE5E0] rounded-xl px-4 py-2.5 text-sm text-[#3D2E26] resize-none outline-none border-2 border-transparent focus:border-[#C17F4A] placeholder:text-[#8C7B72] transition-colors"
              />
            </div>
          </div>
        </Card>

        {/* Optional media */}
        <Card>
          <p className="text-xs font-semibold text-[#8C7B72] uppercase tracking-wide mb-3">Attachments (optional)</p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setShowImageField(v => !v)}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors
                ${showImageField ? 'bg-[#F0E4D4] border-[#C17F4A] text-[#C17F4A]' : 'bg-[#EAE5E0] border-[#D9D2CA] text-[#8C7B72]'}`}
            >
              <Image size={14} /> Image URL
            </button>
            <button
              onClick={() => setShowVideoField(v => !v)}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors
                ${showVideoField ? 'bg-[#F0E4D4] border-[#C17F4A] text-[#C17F4A]' : 'bg-[#EAE5E0] border-[#D9D2CA] text-[#8C7B72]'}`}
            >
              <Link size={14} /> Video Link
            </button>
          </div>
          {showImageField && (
            <input
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://… (image URL)"
              className="w-full bg-[#EAE5E0] rounded-xl px-4 py-2.5 text-sm text-[#3D2E26] outline-none border-2 border-transparent focus:border-[#C17F4A] placeholder:text-[#8C7B72] transition-colors mb-2"
            />
          )}
          {showVideoField && (
            <input
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/… or any video link"
              className="w-full bg-[#EAE5E0] rounded-xl px-4 py-2.5 text-sm text-[#3D2E26] outline-none border-2 border-transparent focus:border-[#C17F4A] placeholder:text-[#8C7B72] transition-colors"
            />
          )}
        </Card>

        {/* Acknowledgment toggle */}
        <Card>
          <button
            onClick={() => setRequiresAck(v => !v)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="flex-1 text-left">
              <p className="font-medium text-[#3D2E26] text-sm">Require acknowledgment</p>
              <p className="text-xs text-[#8C7B72] mt-0.5">
                {requiresAck
                  ? "Drivers must tap \"I acknowledge\" — you'll see who hasn't yet."
                  : 'Viewing counts as seen. No explicit confirmation needed.'}
              </p>
            </div>
            <div className={`
              w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 relative
              ${requiresAck ? 'bg-[#C17F4A]' : 'bg-[#D9D2CA]'}
            `}>
              <div className={`
                absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200
                ${requiresAck ? 'translate-x-5' : 'translate-x-0.5'}
              `} />
            </div>
          </button>
        </Card>

        <div className="h-4" /> {/* Bottom padding */}
      </div>
    </div>
  )
}
