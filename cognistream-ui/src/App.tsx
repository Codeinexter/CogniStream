import { AskAI } from './components/AskAI';
import { DocumentList } from './components/DocumentList';
import { DocumentUploader } from './components/DocumentUploader';
import { ProgressTracker } from './components/ProgressTracker';
import { SemanticSearch } from './components/SemanticSearch';

export default function App() {
  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-50 overflow-hidden p-6 md:p-12 flex flex-col items-center selection:bg-indigo-500/30">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl w-full space-y-8">
        <div className="text-center space-y-3 pb-4">
          <div className="inline-flex items-center justify-center px-3 py-1 mb-4 text-xs font-medium rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
            <span className="w-2 h-2 rounded-full bg-indigo-400 mr-2 animate-pulse"></span>
            System Online
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            CogniStream
          </h1>
          <p className="text-sm md:text-base text-slate-400 font-light tracking-wide">
            Asynchronous Document Ingestion & RAG Pipeline
          </p>
        </div>

        <div className="space-y-6">
          <DocumentUploader />
          <ProgressTracker />
          <DocumentList />
          <AskAI />
          <SemanticSearch />
        </div>
      </div>
    </main>
  );
}