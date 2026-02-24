'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, Download, CheckCircle } from 'lucide-react';
import { FileTransfer, FileReceiver } from '@/lib/webrtc/file-transfer';
import type { PeerConnection } from '@/lib/webrtc/peer-connection';
import type { DataChannelManager } from '@/lib/webrtc/data-channel';
import type { FileMetaMessage, FileChunkMessage, FileCompleteMessage } from '@securedesk/shared';

interface FilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  peerConnection: PeerConnection | null;
  dcManager: DataChannelManager;
}

interface FileItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  direction: 'send' | 'receive';
  status: 'transferring' | 'complete' | 'error';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePanel({ isOpen, onClose, peerConnection, dcManager }: FilePanelProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiverRef = useRef(new FileReceiver());

  // Register file receive handlers
  const setupReceiveHandlers = useCallback(() => {
    dcManager.on('file_meta', (msg) => {
      const meta = msg as FileMetaMessage;
      receiverRef.current.handleMeta(meta);
      setFiles((prev) => [...prev, {
        id: meta.fileId,
        name: meta.fileName,
        size: meta.fileSize,
        progress: 0,
        direction: 'receive',
        status: 'transferring',
      }]);
    });

    dcManager.on('file_chunk', (msg) => {
      const chunk = msg as FileChunkMessage;
      const progress = receiverRef.current.handleChunk(chunk);
      setFiles((prev) => prev.map((f) =>
        f.id === chunk.fileId ? { ...f, progress } : f
      ));
    });

    dcManager.on('file_complete', (msg) => {
      const complete = msg as FileCompleteMessage;
      const result = receiverRef.current.handleComplete(complete);
      if (result) {
        // Auto-download the file
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      setFiles((prev) => prev.map((f) =>
        f.id === complete.fileId ? { ...f, progress: 100, status: 'complete' } : f
      ));
    });
  }, [dcManager]);

  // Setup handlers on first open
  const handlersSetup = useRef(false);
  if (isOpen && !handlersSetup.current) {
    setupReceiveHandlers();
    handlersSetup.current = true;
  }

  // Send a file
  const sendFile = useCallback(async (file: File) => {
    if (!peerConnection) return;

    // Use mutable variable so the closure can capture fileId after it's assigned
    let fileId = '';
    const transfer = new FileTransfer(file, (progress) => {
      setFiles((prev) => prev.map((f) =>
        f.id === fileId ? { ...f, progress } : f
      ));
    });
    const meta = transfer.getMetaMessage();
    fileId = meta.fileId;

    setFiles((prev) => [...prev, {
      id: fileId,
      name: file.name,
      size: file.size,
      progress: 0,
      direction: 'send',
      status: 'transferring',
    }]);

    // Send meta
    peerConnection.sendFile(JSON.stringify(meta));

    // Send chunks — progress is tracked via the onProgress callback in FileTransfer
    for await (const chunk of transfer.chunks()) {
      peerConnection.sendFile(JSON.stringify(chunk));
      // Small delay to avoid overwhelming the data channel
      await new Promise((r) => setTimeout(r, 5));
    }

    // Send complete
    const complete = await transfer.getCompleteMessage();
    peerConnection.sendFile(JSON.stringify(complete));

    setFiles((prev) => prev.map((f) =>
      f.id === fileId ? { ...f, progress: 100, status: 'complete' } : f
    ));
  }, [peerConnection]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    for (const file of Array.from(selectedFiles)) {
      sendFile(file);
    }
    e.target.value = '';
  }, [sendFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer.files;
    for (const file of Array.from(droppedFiles)) {
      sendFile(file);
    }
  }, [sendFile]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 sm:relative sm:inset-auto z-30 w-full sm:w-80 flex flex-col border-l border-[#1e3f68] bg-[#112640]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e3f68]">
        <h3 className="text-sm font-semibold text-[#edf2fc]">File Transfer</h3>
        <button onClick={onClose} className="text-[#5e80a8] hover:text-[#edf2fc] transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drop zone */}
      <div
        className={`mx-4 mt-4 border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-[#3b6cf5] bg-[#2b5ddb]/10'
            : 'border-[#1e3f68] hover:border-[#2a5080]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-[#406085] mx-auto mb-2" />
        <p className="text-sm text-[#7094be]">
          {isDragging ? 'Drop files here' : 'Drag & drop or click to send files'}
        </p>
        <p className="text-xs text-[#406085] mt-1">Max 500 MB per file</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {files.length === 0 && (
          <p className="text-center text-[#406085] text-sm py-4">No transfers yet</p>
        )}
        {files.map((file) => (
          <div key={file.id} className="bg-[#1c3860] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              {file.status === 'complete' ? (
                <CheckCircle className="h-4 w-4 text-[#34d399] flex-shrink-0" />
              ) : file.direction === 'send' ? (
                <Upload className="h-4 w-4 text-[#5b87f7] flex-shrink-0" />
              ) : (
                <Download className="h-4 w-4 text-[#5b87f7] flex-shrink-0" />
              )}
              <span className="text-sm text-[#b0c4e8] truncate flex-1">{file.name}</span>
              <span className="text-xs text-[#5e80a8]">{formatSize(file.size)}</span>
            </div>
            {file.status === 'transferring' && (
              <div className="h-1.5 bg-[#0c1a30] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3b6cf5] rounded-full transition-all duration-300"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
