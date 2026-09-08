import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl mb-4 text-amber-400">
        404
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Page Not Found</h2>
      <p className="text-slate-400 text-sm max-w-md mb-6">
        The requested investigation or resource could not be found.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wider transition-colors"
      >
        ← Return to Start Page
      </Link>
    </div>
  );
}
