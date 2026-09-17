import { CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../hooks/use-toast';
import { api } from '../lib/api';
import { useJobStore } from '../store/useJobStore';

// Kept in sync with cognistream/src/infrastructure/config.ts
// (ingestion.maxFileSizeBytes) - the server is the source of truth here,
// this is just a fast client-side check to avoid an unnecessary upload.
const MAX_FILE_SIZE_MB = 20;

export function DocumentUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addJob = useJobStore((state) => state.addJob);
  const { toast } = useToast();

  // Validate file size and type before processing
  const validateAndSetFile = (selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: `Please select a file smaller than ${MAX_FILE_SIZE_MB}MB.`,
      });
      return;
    }

    setFile(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    try {
      const response = await api.uploadDocument(file);
      
      // Store the active Job ID globally to trigger telemetry polling
      addJob(response.jobId);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast({
        title: 'Document Submitted',
        description: `Job ID ${response.jobId} created. Processing started...`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error.message || 'Could not send document to the ingestion queue.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full shadow-2xl bg-slate-900/40 backdrop-blur-xl border-slate-800/60 overflow-hidden transition-all duration-300 hover:border-slate-700/60">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-600" />
          Ingest Document
        </CardTitle>
        <CardDescription>
          Upload documents to split, vectorize, and store in Redis Stack.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Drop Zone Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv,.pdf,.docx"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <FileText className="w-12 h-12 text-slate-500 mb-3" />
            <div className="text-sm font-medium text-slate-300">
              {file ? (
                <span className="text-indigo-400 font-semibold">{file.name}</span>
              ) : (
                <span>Drag & drop your document here, or click to browse</span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Supports .txt, .md, .csv, .pdf, .docx (Max {MAX_FILE_SIZE_MB}MB)
            </p>
          </div>
        </div>

        {/* Selected File Details & Upload Action */}
        {file && (
          <div className="flex items-center justify-between p-3 bg-slate-100 rounded-md">
            <div className="flex items-center space-x-2 truncate">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-sm text-slate-800 truncate">{file.name}</span>
              <span className="text-xs text-slate-500">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>

            <Button
              onClick={handleUpload}
              disabled={isUploading}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Queuing...
                </>
              ) : (
                'Start Ingestion'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}