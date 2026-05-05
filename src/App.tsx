function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <div className="text-8xl mb-4">🍄</div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-100 sm:text-5xl">
          BoggleSmurf
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          Find every word hiding in a Boggle grid.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Because losing quietly is worse than losing.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap justify-center">
        <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
          Tailwind ✓
        </span>
        <span className="rounded-full bg-blue-900/40 px-3 py-1 text-xs font-medium text-blue-400 ring-1 ring-blue-500/30">
          React 19 ✓
        </span>
        <span className="rounded-full bg-violet-900/40 px-3 py-1 text-xs font-medium text-violet-400 ring-1 ring-violet-500/30">
          TypeScript ✓
        </span>
        <span className="rounded-full bg-amber-900/40 px-3 py-1 text-xs font-medium text-amber-400 ring-1 ring-amber-500/30">
          Vite 8 ✓
        </span>
      </div>

      <p className="text-xs text-slate-600 mt-4">
        Phase 0 scaffold — solver and grid UI coming next
      </p>
    </div>
  )
}

export default App
