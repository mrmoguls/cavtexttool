import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import type { Driver } from '../types'
import { UserPlus, Trash2, Users } from 'lucide-react'

interface DispatchRosterProps {
  drivers: Driver[]
  onUpdate: () => void
}

export function DispatchRoster({ drivers, onUpdate }: DispatchRosterProps) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function addDriver() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    const { error: err } = await supabase.from('drivers').insert({ name })
    setAdding(false)
    if (err) { setError(err.message); return }
    setNewName('')
    onUpdate()
  }

  async function removeDriver(id: string) {
    if (!confirm('Remove this driver? This also deletes their messages.')) return
    setDeletingId(id)
    await supabase.from('drivers').delete().eq('id', id)
    setDeletingId(null)
    onUpdate()
  }

  return (
    <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-3">
      {/* Add driver */}
      <Card>
        <p className="text-xs font-semibold text-[#8C7B72] uppercase tracking-wide mb-3">Add Driver</p>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDriver()}
            placeholder="Full name"
            className="flex-1 bg-[#EAE5E0] rounded-xl px-4 py-2.5 text-sm text-[#3D2E26] outline-none border-2 border-transparent focus:border-[#C17F4A] placeholder:text-[#8C7B72] transition-colors"
          />
          <Button size="sm" onClick={addDriver} disabled={adding || !newName.trim()}>
            <UserPlus size={16} />
          </Button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </Card>

      {drivers.length === 0 ? (
        <EmptyState icon={<Users />} title="No drivers yet" body="Add your first driver above." />
      ) : (
        <div className="space-y-2">
          {drivers.map(driver => (
            <Card key={driver.id}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#F0E4D4] flex items-center justify-center text-[#C17F4A] font-semibold text-sm flex-shrink-0">
                  {driver.name.charAt(0).toUpperCase()}
                </div>
                <p className="flex-1 font-medium text-[#3D2E26]">{driver.name}</p>
                <button
                  onClick={() => removeDriver(driver.id)}
                  disabled={deletingId === driver.id}
                  className="p-1.5 rounded-lg text-[#8C7B72] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
