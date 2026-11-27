import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getClientIp, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError, getProviderAdapter, getServerApiKey, type AiProviderId } from '@/lib/ai/providers';
import { getDefaultSeedModel, getVerifiedModelsForProvider, pickDefaultVerifiedModel } from '@/lib/ai/models';
import { createRedisCacheStore, enforceAiLimits, recordGlobalSpend } from '@/lib/ai/limits';
import { ensurePortalSchema } from '@/lib/meetings';

export const runtime = 'nodejs';
export const maxDuration = 60;

const AskSchema = z.object({
  question: z.string().trim().min(2, 'Pertanyaan terlalu singkat.').max(600),
});

function pickAvailableProvider(): AiProviderId | null {
  for (const p of ['gemini', 'openai', 'anthropic'] as const) {
    if (getServerApiKey(p)) return p;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const parsed = AskSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', parsed.error.issues[0]?.message || 'Pertanyaan tidak valid.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }
    await ensurePortalSchema(sql);

    const question = parsed.data.question;
    const email = (authUser.email || '').trim().toLowerCase();
    const keywords = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 6);

    // Retrieve recent accessible meetings and score against query terms in SQL/JS (no extra vector DB).
    const candidates = (await sql`
      SELECT DISTINCT m.id, m.title, m.started_at, COALESCE(n.enhanced, n.mine, '') AS note_text
      FROM meetings m
      LEFT JOIN notes n ON n.meeting_id = m.id
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = m.workspace_id
       AND (wm.user_id = ${authUser.userId} OR (${email} <> '' AND lower(wm.email) = ${email}))
      WHERE m.user_id = ${authUser.userId}
         OR (COALESCE(m.share_mode, 'private') = 'workspace' AND wm.workspace_id IS NOT NULL)
      ORDER BY m.started_at DESC
      LIMIT 40
    `) as Array<{ id: string; title: string; started_at: string | number; note_text: string }>;

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          answer: 'Belum ada rapat yang tersinkron di akun ini. Rekam atau unggah rapat terlebih dahulu.',
          citations: [],
        },
        { status: 200, headers: getSecurityHeaders(req) },
      );
    }

    const candidateIds = candidates.map((c) => c.id);
    const transcriptRows = (await sql`
      SELECT meeting_id, speaker, text
      FROM transcripts
      WHERE meeting_id = ANY(${candidateIds})
      ORDER BY start_ms ASC
      LIMIT 600
    `) as Array<{ meeting_id: string; speaker: string | null; text: string }>;

    const transcriptsByMeeting = new Map<string, string[]>();
    for (const tr of transcriptRows) {
      const list = transcriptsByMeeting.get(tr.meeting_id) ?? [];
      list.push(`${tr.speaker || 'Peserta'}: ${tr.text}`);
      transcriptsByMeeting.set(tr.meeting_id, list);
    }

    const scored = candidates
      .map((m) => {
        const joinedTranscript = (transcriptsByMeeting.get(m.id) ?? []).join('\n');
        const fullText = `${m.title}\n${m.note_text}\n${joinedTranscript}`;
        const lower = fullText.toLowerCase();
        const hits = keywords.reduce((acc, kw) => (lower.includes(kw) ? acc + 1 : acc), 0);
        return { ...m, joinedTranscript, fullText, hits };
      })
      .sort((a, b) => b.hits - a.hits || Number(b.started_at) - Number(a.started_at));

    const matched = scored.filter((s) => s.hits > 0).slice(0, 5);
    const topSources = (matched.length > 0 ? matched : scored.slice(0, 3)).map((s) => ({
      id: s.id,
      title: s.title || 'Rapat Tanpa Judul',
      startedAt: Number(s.started_at),
      excerpt: (s.note_text || s.joinedTranscript).slice(0, 260),
      context: `Judul: ${s.title}\nCatatan:\n${s.note_text.slice(0, 2000)}\nCuplikan Transkrip:\n${s.joinedTranscript.slice(0, 2000)}`,
    }));

    const provider = pickAvailableProvider();
    const apiKey = provider ? getServerApiKey(provider) : '';
    if (!provider || !apiKey) {
      return NextResponse.json(
        {
          ok: true,
          answer: `Ditemukan ${topSources.length} rapat terkait berdasarkan kata kunci. Buka rapat di bawah untuk membaca detailnya.`,
          citations: topSources.map(({ id, title, startedAt, excerpt }) => ({ id, title, startedAt, excerpt })),
        },
        { status: 200, headers: getSecurityHeaders(req) },
      );
    }

    const contextBlock = topSources.map((s, idx) => `[Sumber ${idx + 1} | ID: ${s.id}]\n${s.context}`).join('\n\n---\n\n');
    const estimatedInputTokens = Math.ceil((question.length + contextBlock.length) / 4);
    await enforceAiLimits({
      userId: authUser.userId,
      ip: getClientIp(req),
      tier: authUser.tier,
      estimatedInputTokens,
    });

    const cache = createRedisCacheStore();
    const { models } = await getVerifiedModelsForProvider(provider, { cache });
    const modelId = models.length > 0 ? pickDefaultVerifiedModel(models, provider) : getDefaultSeedModel(provider).id;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('TIMEOUT')), 45_000);
    try {
      const result = await getProviderAdapter(provider).generate({
        model: modelId,
        system:
          'Anda adalah asisten pencari pengetahuan rapat Cakapp. Jawab pertanyaan pengguna HANYA berdasarkan konteks rapat yang diberikan. Sebutkan judul rapat sebagai rujukan jika relevan. Jika informasi tidak ada di sumber, katakan jujur tidak ditemukan.',
        input: `Pertanyaan:\n${question}\n\nKonteks Rapat:\n${contextBlock}`,
        signal: controller.signal,
        apiKey,
      });

      await recordGlobalSpend({
        provider,
        model: modelId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });

      return NextResponse.json(
        {
          ok: true,
          answer: result.text,
          citations: topSources.map(({ id, title, startedAt, excerpt }) => ({ id, title, startedAt, excerpt })),
        },
        { status: 200, headers: getSecurityHeaders(req) },
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
