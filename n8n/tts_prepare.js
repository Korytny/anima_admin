// ═══════════════════════════════════════════════════════════════════════════
// tts_prepare.js — n8n Code-узел «Prepare» процесса tts-proxy (сервер 88.99, доступ к Google).
// Mode: Run Once for All Items.
//
// Прокси ничего не знает о шотах и базе: принимает текст и голос, отдаёт wav (tts_wav.js → Respond).
// Вход (POST JSON от n8n на .99, n8n/audio_vars.js):
//   text   — что сказать (обязательно)
//   voice  — голос Gemini TTS (Kore, Charon, Sadachbia…; обязательно)
//   style  — как сказать, по-английски: «Say in a calm, wise narrator voice» (необязательно)
//   model  — модель (по умолчанию MODEL)
//   pad_ms — тишина в начале и в конце, мс (по умолчанию PAD_MS)
// Выход: google_body (тело generateContent), model, pad_ms
// ═══════════════════════════════════════════════════════════════════════════

const MODEL = 'gemini-2.5-pro-preview-tts' // pro живее и держит инструкцию; flash на длинной инструкции читал её вслух и обрывался
const PAD_MS = 500

const body = $input.first().json.body ?? {}
const text = String(body.text ?? '').trim()
const voice = String(body.voice ?? '').trim()
const style = String(body.style ?? '').trim()
if (!text) throw new Error('Нет text')
if (!voice) throw new Error('Нет voice (голос Gemini TTS, напр. Kore)')

// Gemini TTS понимает инструкцию перед текстом: «Say in a grave voice: …» — инструкцию не читает вслух
const prompt = style ? `${style.replace(/[:.\s]+$/, '')}: ${text}` : text

return [
  {
    json: {
      model: String(body.model ?? '').trim() || MODEL,
      pad_ms: Number.isFinite(Number(body.pad_ms)) ? Math.max(0, Math.min(3000, Number(body.pad_ms))) : PAD_MS,
      google_body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      },
    },
  },
]
