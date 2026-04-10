// POST /api/voice/speak — proxy to ElevenLabs TTS
// Body: { text: string, voice?: string }
// Returns: audio/mpeg stream
import type { Env, DataContext } from '../../types';

interface VoiceEnv extends Env {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_PYTHAGORAS?: string;
}

export const onRequestPost: PagesFunction<VoiceEnv, any, DataContext> = async (context) => {
  const { text, voice } = await context.request.json() as { text: string; voice?: string };

  if (!text || text.length > 2000) {
    return Response.json({ error: 'text required (max 2000 chars)' }, { status: 400 });
  }

  const apiKey = context.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
  }

  // Default to the Pythagoras voice set in environment; allow override
  const voiceId = voice || context.env.ELEVENLABS_VOICE_PYTHAGORAS || '21m00Tcm4TlvDq8ikWAM';

  // Strip HTML and clean up text
  const cleaned = text
    .replace(/<[^>]*>/g, '')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: cleaned,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[ElevenLabs] Error:', res.status, errorText);
    return Response.json({ error: `ElevenLabs error: ${res.status}` }, { status: 502 });
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
