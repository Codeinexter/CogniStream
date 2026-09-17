import { Bot, Loader2, Send, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { useToast } from '../hooks/use-toast';
import { api, type AskResponse } from '../lib/api';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

export function AskAI() {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const { toast } = useToast();

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsAsking(true);
    try {
      const result = await api.askQuestion(question);
      setResponse(result);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not get an answer',
        description: error.message || 'The AI backend failed to respond.',
      });
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <Card className="w-full shadow-lg bg-slate-900/40 backdrop-blur-xl border-slate-800/60">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Bot className="w-5 h-5 text-emerald-500" />
          Ask AI
        </CardTitle>
        <CardDescription>
          Get a synthesized answer grounded in your ingested documents, not raw chunks.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form onSubmit={handleAsk} className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              type="text"
              placeholder="e.g., How does CogniStream chunk documents?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="pl-10 h-12 bg-slate-950/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500/50"
            />
          </div>
          <Button
            type="submit"
            disabled={isAsking || !question.trim()}
            className="h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            {isAsking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Thinking...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Ask
              </>
            )}
          </Button>
        </form>

        {response && (
          <div className="space-y-4">
            <div className="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                {response.answer}
              </p>
            </div>

            {response.sources.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Sources ({response.sources.length})
                </p>
                {response.sources.map((source, index) => (
                  <div
                    key={index}
                    className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/50 text-xs text-slate-400"
                  >
                    <span className="font-mono text-slate-500">
                      {source.docId ? source.docId.slice(0, 8) : 'N/A'}...
                    </span>{' '}
                    &mdash; {source.text.slice(0, 160)}
                    {source.text.length > 160 ? '…' : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}