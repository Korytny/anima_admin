// ═══════════════════════════════════════════════════════════════════════════
// audio_result.js — n8n Code-узел «Wav info» конвейера озвучки (n8n на .99). Mode: Run Once for All Items.
//
// Вход: binary.data — wav от tts-proxy (узел «TTS», Response Format: File).
// Считает длительность по заголовку WAV и даёт файлу имя <NN>-<шот>.wav (Vars.file_name),
// чтобы локальный ComfyUI сохранил его так (при повторе — «<NN>-<шот> (1).wav», старые остаются).
// Выход: json.audio_duration (сек), binary.data — тот же wav с нужным именем.
// ═══════════════════════════════════════════════════════════════════════════

const VARS_NODE = 'Vars'

const item = $input.first()
const bin = item.binary?.data
if (!bin) throw new Error('tts-proxy не вернул файл (нет binary.data) — проверьте узел TTS: Response Format = File')
const buf = await this.helpers.getBinaryDataBuffer(0, 'data')
if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Ответ tts-proxy — не wav: ${buf.toString('utf8', 0, 200)}`)

// Ищем чанки fmt и data (заголовок не обязательно 44 байта)
let rate = 24000
let blockAlign = 2
let dataSize = buf.length - 44
for (let p = 12; p + 8 <= buf.length; ) {
  const id = buf.toString('ascii', p, p + 4)
  const size = buf.readUInt32LE(p + 4)
  if (id === 'fmt ') {
    rate = buf.readUInt32LE(p + 12)
    blockAlign = buf.readUInt16LE(p + 20)
  }
  if (id === 'data') {
    dataSize = Math.min(size, buf.length - p - 8)
    break
  }
  p += 8 + size + (size % 2)
}
const audio_duration = Math.round((dataSize / (rate * blockAlign)) * 100) / 100

const file_name = $(VARS_NODE).first().json.file_name
return [{ json: { audio_duration }, binary: { data: { ...bin, fileName: file_name, mimeType: 'audio/wav', fileExtension: 'wav' } } }]
