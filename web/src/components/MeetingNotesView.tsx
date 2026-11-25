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

    // Check for section header (### or ## or #)
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

    // Check for Action Item checklist: - [ ] or - [x]
    const taskMatch = line.match(/^-\s*\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      const completed = taskMatch[1].toLowerCase() === 'x';
      const body = taskMatch[2];

      // Check if there is a PIC format like **Name**: Task or [Name]: Task
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

    // Check for Numbered Decision/Item: 1. **Title**: Description or 1. Description
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

    // Regular paragraph or bullet
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
  // Strip or format inline bold **text** cleanly
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-zinc-100">
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

  function toggleTask(id: string, initial: boolean) {
    setCheckedTasks((prev) => ({
      ...prev,
      [id]: prev[id] !== undefined ? !prev[id] : !initial,
    }));
  }

  if (!content.trim()) {
    return (
      <div className="py-6 text-center text-xs text-zinc-500 italic">
        Belum ada ringkasan notulen.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section, sIdx) => {
        return (
          <div key={sIdx} className="space-y-3">
            {/* Section Header */}
            <div className="flex items-center gap-2 pb-1 border-b border-zinc-800/60">
              {section.type === 'summary' && (
                <svg className="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              )}
              {section.type === 'decisions' && (
                <svg className="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              )}
              {section.type === 'tasks' && (
                <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m9 11 3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              )}
              {section.type === 'general' && (
                <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              )}
              <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-zinc-200">
                {section.title}
              </h4>
            </div>

            {/* Section Items */}
            {section.type === 'summary' && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
                {section.items.map((item) => (
                  <p key={item.id} className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
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
                    className="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5 sm:p-4 hover:border-zinc-700/80 transition-colors"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-amber-800/60 bg-amber-950/40 text-xs font-semibold text-amber-300">
                      {item.num ?? '•'}
                    </span>
                    <div className="min-w-0 flex-1">
                      {item.title && (
                        <h5 className="text-xs sm:text-sm font-semibold text-zinc-100 mb-1">
                          {renderFormattedInline(item.title)}
                        </h5>
                      )}
                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
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
                    <div
                      key={item.id}
                      onClick={() => toggleTask(item.id, Boolean(item.completed))}
                      className="group flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5 sm:p-4 cursor-pointer hover:bg-zinc-900/60 hover:border-zinc-700/80 transition-colors"
                    >
                      <button
                        type="button"
                        aria-label="Toggle task"
                        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                          isChecked
                            ? 'border-emerald-600 bg-emerald-950/80 text-emerald-400'
                            : 'border-zinc-700 bg-zinc-800 text-transparent group-hover:border-zinc-500'
                        }`}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {item.pic && (
                            <span className="rounded-md border border-emerald-800/60 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                              PIC: {item.pic}
                            </span>
                          )}
                          <span
                            className={`text-[10px] ${
                              isChecked ? 'text-emerald-400' : 'text-zinc-500'
                            }`}
                          >
                            {isChecked ? 'Selesai' : 'Perlu Tindak Lanjut'}
                          </span>
                        </div>
                        <p
                          className={`text-xs sm:text-sm leading-relaxed transition-colors ${
                            isChecked
                              ? 'line-through text-zinc-500'
                              : 'text-zinc-200'
                          }`}
                        >
                          {renderFormattedInline(item.text)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {section.type === 'general' && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-2">
                {section.items.map((item) => (
                  <p key={item.id} className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                    {renderFormattedInline(item.text)}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
