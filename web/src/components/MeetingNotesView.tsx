'use client';

import React, { useState } from 'react';

interface MeetingNotesViewProps {
  content: string;
}

interface ParsedSection {
  title: string;
  type: 'summary' | 'decisions' | 'tasks' | 'general';
  items: Array<{
    id: string;
    type: 'paragraph' | 'decision' | 'task';
    text: string;
    num?: number;
    title?: string;
    pic?: string;
    completed?: boolean;
  }>;
}

function parseMarkdownNotes(raw: string): ParsedSection[] {
  const lines = raw.split('\n');
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection = {
    title: 'Ringkasan Rapat',
    type: 'summary',
    items: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const headerText = line.replace(/^#+\s*/, '').trim();
      const lower = headerText.toLowerCase();

      let type: ParsedSection['type'] = 'general';
      if (lower.includes('ringkasan') || lower.includes('summary')) {
        type = 'summary';
      } else if (lower.includes('keputusan') || lower.includes('decision')) {
        type = 'decisions';
      } else if (lower.includes('tugas') || lower.includes('action') || lower.includes('todo')) {
        type = 'tasks';
      }

      if (currentSection.items.length > 0 || currentSection.title !== 'Ringkasan Rapat') {
        sections.push(currentSection);
      }

      currentSection = {
        title: headerText,
        type,
        items: [],
      };
      continue;
    }

    const taskMatch = line.match(/^-\s*\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      const completed = taskMatch[1].toLowerCase() === 'x';
      const body = taskMatch[2];

      let pic = '';
      let taskText = body;
      const picMatch = body.match(/^(\*\*|\[)?([^*\]:]+)(\*\*|\])?:\s*(.*)$/);
      if (picMatch && picMatch[2] && picMatch[4]) {
        pic = picMatch[2].trim();
        taskText = picMatch[4].trim();
      }

      currentSection.items.push({
        id: `task-${i}`,
        type: 'task',
        completed,
        pic,
        text: taskText,
      });
      continue;
    }

    const numMatch = line.match(/^(\d+)\.\s*(.*)$/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      const body = numMatch[2];

      let title = '';
      let desc = body;
      const titleMatch = body.match(/^(\*\*|\[)?([^*\]:]+)(\*\*|\])?:\s*(.*)$/);
      if (titleMatch && titleMatch[2] && titleMatch[4]) {
        title = titleMatch[2].trim();
        desc = titleMatch[4].trim();
      }

      currentSection.items.push({
        id: `decision-${i}`,
        type: 'decision',
        num,
        title,
        text: desc,
      });
      continue;
    }

    const cleanText = line.replace(/^[-*•]\s*/, '').trim();
    currentSection.items.push({
      id: `para-${i}`,
      type: 'paragraph',
      text: cleanText,
    });
  }

  if (currentSection.items.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

function renderFormattedInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export default function MeetingNotesView({ content }: MeetingNotesViewProps) {
  const sections = parseMarkdownNotes(content);
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  function toggleTask(id: string, initial: boolean) {
    setCheckedTasks((prev) => ({
      ...prev,
      [id]: prev[id] !== undefined ? !prev[id] : !initial,
    }));
  }

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure.
    }
  }

  if (!content.trim()) {
    return (
      <div className="py-6 text-center text-xs sm:text-sm text-muted">
        Belum ada ringkasan notulen. Gunakan tombol Buat Notulen atau unggah transkrip terlebih dahulu.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void copyNotes()}
          className="min-h-[44px] sm:min-h-[34px] rounded-lg border border-control bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-chrome transition-colors"
        >
          {copied ? 'Notulen Tersalin' : 'Salin Notulen (.md)'}
        </button>
      </div>

      {sections.map((section, sIdx) => (
        <div key={sIdx} className="space-y-3">
          <div className="pb-1.5 border-b border-line">
            <h4 className="font-display text-sm sm:text-base font-semibold text-ink">
              {section.title}
            </h4>
          </div>

          {section.type === 'summary' && (
            <div className="rounded-xl border border-line bg-paper p-4 sm:p-5 space-y-2">
              {section.items.map((item) => (
                <p key={item.id} className="text-xs sm:text-sm text-written leading-relaxed">
                  {renderFormattedInline(item.text)}
                </p>
              ))}
            </div>
          )}

          {section.type === 'decisions' && (
            <div className="grid grid-cols-1 gap-2.5">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3.5 sm:p-4"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-card text-xs font-semibold text-accent">
                    {item.num ?? '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    {item.title && (
                      <h5 className="text-xs sm:text-sm font-semibold text-ink mb-1">
                        {renderFormattedInline(item.title)}
                      </h5>
                    )}
                    <p className="text-xs sm:text-sm text-written leading-relaxed">
                      {renderFormattedInline(item.text)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {section.type === 'tasks' && (
            <div className="grid grid-cols-1 gap-2.5">
              {section.items.map((item) => {
                const isChecked =
                  checkedTasks[item.id] !== undefined
                    ? checkedTasks[item.id]
                    : Boolean(item.completed);

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    onClick={() => toggleTask(item.id, Boolean(item.completed))}
                    className="w-full text-left flex items-start gap-3 rounded-xl border border-line bg-paper p-3.5 sm:p-4 hover:bg-card transition-colors"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isChecked
                          ? 'border-primary bg-primary text-primary-ink'
                          : 'border-control bg-float text-transparent'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {item.pic && (
                          <span className="rounded border border-line bg-card px-2 py-0.5 text-[11px] font-semibold text-ink">
                            PIC: {item.pic}
                          </span>
                        )}
                        <span className="text-[11px] text-muted">
                          {isChecked ? 'Selesai' : 'Perlu Tindak Lanjut'}
                        </span>
                      </div>
                      <p
                        className={`text-xs sm:text-sm leading-relaxed ${
                          isChecked ? 'line-through text-muted' : 'text-ink'
                        }`}
                      >
                        {renderFormattedInline(item.text)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {section.type === 'general' && (
            <div className="rounded-xl border border-line bg-paper p-4 space-y-2">
              {section.items.map((item) => (
                <p key={item.id} className="text-xs sm:text-sm text-written leading-relaxed">
                  {renderFormattedInline(item.text)}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
