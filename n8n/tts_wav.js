// ═══════════════════════════════════════════════════════════════════════════
// tts_wav.js — n8n Code-узел «Wav» процесса tts-proxy. Mode: Run Once for All Items.
//
// Ответ Gemini TTS — сырой PCM s16le (mimeType «audio/L16;codec=pcm;rate=24000») в base64.
// Добавляем тишину pad_ms в начале и в конце (как раньше 05sec.wav через ffmpeg) и WAV-заголовок.
// Выход: binary.audio — wav (его отдаёт Respond to Webhook), json.duration — секунды.
// ═══════════════════════════════════════════════════════════════════════════

const PREPARE_NODE = 'Prepare'

const res = $input.first().json
const part = res?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
if (!part) throw new Error(`Google не вернул аудио: ${JSON.stringify(res).slice(0, 300)}`)

const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1]) || 24000
const channels = 1
const bytesPerSample = 2
const pcm = Buffer.from(part.inlineData.data, 'base64')
const padMs = $(PREPARE_NODE).first().json.pad_ms ?? 0
const pad = Buffer.alloc(Math.round((rate * padMs) / 1000) * channels * bytesPerSample)
const data = Buffer.concat([pad, pcm, pad])

const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + data.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20) // PCM
header.writeUInt16LE(channels, 22)
header.writeUInt32LE(rate, 24)
header.writeUInt32LE(rate * channels * bytesPerSample, 28)
header.writeUInt16LE(channels * bytesPerSample, 32)
header.writeUInt16LE(bytesPerSample * 8, 34)
header.write('data', 36)
header.writeUInt32LE(data.length, 40)

const wav = Buffer.concat([header, data])
const duration = Math.round((data.length / (rate * channels * bytesPerSample)) * 100) / 100

return [
  {
    json: { duration, bytes: wav.length, rate },
    binary: { audio: { data: wav.toString('base64'), mimeType: 'audio/wav', fileName: 'tts.wav', fileExtension: 'wav' } },
  },
]
