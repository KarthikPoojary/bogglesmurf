import changelog from '../../CHANGELOG.md?raw'

interface Section {
  heading: string
  items: string[]
}

interface Release {
  version: string
  tag: string
  sections: Section[]
}

function parseChangelog(raw: string): Release[] {
  const releases: Release[] = []
  const blocks = raw.split(/\n(?=## )/).filter((b) => b.startsWith('## '))

  for (const block of blocks) {
    const lines = block.split('\n')
    const header = lines[0]
    const m = header.match(/## \[([^\]]+)\](.*)/)
    if (!m) continue

    const version = m[1]
    const tag = m[2].replace(/^\s*[-–—]\s*/, '').trim()

    const sections: Section[] = []
    let cur: Section | null = null
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('### ')) {
        if (cur) sections.push(cur)
        cur = { heading: line.slice(4), items: [] }
      } else if (line.startsWith('- ') && cur) {
        cur.items.push(line.slice(2))
      }
    }
    if (cur) sections.push(cur)

    releases.push({ version, tag, sections })
  }

  return releases
}

const releases = parseChangelog(changelog)

interface Props {
  onClose: () => void
}

const sectionColor: Record<string, string> = {
  Added: 'text-emerald-400',
  Fixed: 'text-amber-400',
  Changed: 'text-sky-400',
  Removed: 'text-red-400',
}

export function ChangelogModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-100">Changelog</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">BoggleSmurf v{__APP_VERSION__}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Scrollable release list */}
        <div className="overflow-y-auto p-5 flex flex-col gap-6">
          {releases.map((release, i) => (
            <div key={release.version}>
              {/* Version badge + title */}
              <div className="flex items-baseline gap-2.5 mb-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  release.version === 'Unreleased'
                    ? 'bg-slate-700 text-slate-400'
                    : i === 1
                    ? 'bg-violet-700 text-violet-100'
                    : 'bg-slate-800 text-slate-300'
                }`}>
                  {release.version === 'Unreleased' ? 'Unreleased' : `v${release.version}`}
                </span>
                {release.tag && (
                  <span className="text-xs text-slate-500 leading-tight">{release.tag}</span>
                )}
              </div>

              {release.sections.length === 0 && (
                <p className="text-xs text-slate-600 italic">Nothing yet.</p>
              )}

              {release.sections.map((sec) => (
                <div key={sec.heading} className="mb-3 last:mb-0">
                  <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${sectionColor[sec.heading] ?? 'text-slate-400'}`}>
                    {sec.heading}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {sec.items.map((item, j) => (
                      <li key={j} className="text-xs text-slate-400 leading-snug flex gap-1.5">
                        <span className="text-slate-600 shrink-0 mt-px">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {i < releases.length - 1 && (
                <div className="mt-6 border-t border-slate-800" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
