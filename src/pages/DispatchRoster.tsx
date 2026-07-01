import { useState } from 'react'
import { useData } from '../lib/data-context'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { UserPlus, Trash2, Users } from 'lucide-react'

export function DispatchRoster() {
  const data = useData()
  const { drivers } = data
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function addDriver() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    await data.addDriver(name)
    setAdding(false)
    setNewName('')
  }

  async function removeDriver(id: string) {
    if (!confirm('Remove this driver? This also deletes their messages.')) return
    setDeletingId(id)
    await data.removeDriver(id)
    setDeletingId(null)
  }

  return (
    <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-3">
      <Card>
        <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-3">Add Driver</p>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDriver()}
            placeholder="Full name"
            className="flex-1 bg-[#EEF1F8] rounded-xl px-4 py-2.5 text-sm text-[#0B1A5C] outline-none border-2 border-transparent focus:border-[#CC2A2A] placeholder:text-[#6B7A99] transition-colors"
          />
          <Button size="sm" onClick={addDriver} disabled={adding || !newName.trim()}>
            <UserPlus size={16} />
          </Button>
        </div>
      </Card>

      {drivers.length === 0 ? (
        <EmptyState icon={<Users />} title="No drivers yet" body="Add your first driver above." />
      ) : (
        <div className="space-y-2">
          {drivers.map(driver => (
            <Card key={driver.id}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#FCE9E9] flex items-center justify-center text-[#CC2A2A] font-semibold text-sm flex-shrink-0">
                  {driver.name.charAt(0).toUpperCase()}
                </div>
                <p className="flex-1 font-medium text-[#0B1A5C]">{driver.name}</p>
                <button
                  onClick={() => removeDriver(driver.id)}
                  disabled={deletingId === driver.id}
                  className="p-1.5 rounded-lg text-[#6B7A99] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
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
