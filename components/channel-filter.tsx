'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import styles from './ChannelFilterPanel.module.css'

interface ChannelOption {
  id?: string | null
  name: string
}

const getChannelKey = (option: ChannelOption): string =>
  option.id ? `id:${option.id}` : `name:${option.name.trim().toLowerCase()}`

interface ChannelFilterPanelProps {
  channels: ChannelOption[]
  excluded: string[]
  onExcludedChange: (next: string[]) => void
}

export function ChannelFilterPanel({ channels, excluded, onExcludedChange }: ChannelFilterPanelProps) {
  const sortedChannels = useMemo(() => {
    const unique = new Map<string, ChannelOption>()
    channels.forEach((option) => {
      if (!option?.name) return
      const key = getChannelKey(option)
      if (!unique.has(key)) unique.set(key, option)
    })
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [channels])

  const excludedSet = useMemo(() => new Set(excluded.filter(Boolean)), [excluded])
  const selectedCount = sortedChannels.reduce(
    (acc, option) => acc + (excludedSet.has(getChannelKey(option)) ? 0 : 1),
    0
  )
  const totalCount = sortedChannels.length

  const toggleChannel = (channel: ChannelOption, include: boolean) => {
    const key = getChannelKey(channel)
    const next = new Set(excludedSet)
    if (include) {
      next.delete(key)
    } else {
      next.add(key)
    }
    onExcludedChange(Array.from(next))
  }

  const includeAll = () => {
    if (excludedSet.size) onExcludedChange([])
  }

  const excludeAll = () => {
    if (!sortedChannels.length) return
    onExcludedChange(sortedChannels.map((option) => getChannelKey(option)))
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Channel filter</h3>
          <p className="text-xs text-zinc-400">
            {totalCount
              ? `${selectedCount} of ${totalCount} channels included`
              : 'Channels appear after your first query'}
          </p>
        </div>
      </div>

      {sortedChannels.length > 0 ? (
        <div className={cn('mt-3 grid gap-2', styles.scrollContainer)}>
          {sortedChannels.map((channel) => {
            const key = getChannelKey(channel)
            const isIncluded = !excludedSet.has(key)
            return (
              <label
                key={key}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 hover:border-white/20"
              >
                <span className="truncate">{channel.name}</span>
                <input
                  type="checkbox"
                  className="size-4 rounded border-white/30 bg-black/40 accent-emerald-400"
                  checked={isIncluded}
                  onChange={(event) => toggleChannel(channel, event.target.checked)}
                />
              </label>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">
          No channels indexed yet. Run a query to populate this list.
        </p>
      )}

      {totalCount > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={includeAll}
            className="rounded-full border border-white/15 px-3 py-1 text-zinc-200 hover:bg-white/10"
            disabled={excludedSet.size === 0}
          >
            Include all
          </button>
          <button
            type="button"
            onClick={excludeAll}
            className="rounded-full border border-white/15 px-3 py-1 text-zinc-200 hover:bg-white/10"
            disabled={excludedSet.size === totalCount}
          >
            Exclude all
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default ChannelFilterPanel
