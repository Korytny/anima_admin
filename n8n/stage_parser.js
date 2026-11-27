// Парсер Постановщика (Stage) → { shots[], locations[], shot_count }
// Вход: ответ модели из HTTP Request (OpenAI-совместимый): json.choices[0].message.content.
//   Старый узел AI Agent отдавал json.output — тоже понимаем.
//   Если Постановщик вызывался по локациям (несколько входных элементов) — тексты склеиваются по порядку.
// Формат:
//   === ЛОКАЦИЯ: название ===
//   --- SHOT N ---
//   ENV: <визуал окружения, освещение, позы>
//   ACT: <действие, диалог, камера>
//
// Вывод: { shots: [...], locations: [{name, shots: [индексы]}], shot_count: N }

// ===== ВХОД =====
const textOf = (j) => String(j?.choices?.[0]?.message?.content ?? j?.output ?? '');
let input = $input.all().map((it) => textOf(it.json)).join('\n');

// Ограда ```…``` вокруг ответа — снимаем
input = input.replace(/^\s*```[a-z]*\s*$/gim, '');

// Нормализация
input = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const lines = input.split('\n');

const shots = [];
const locations = [];
let currentLocation = null;
let currentShot = null;
let readingEnv = false;
let readingAct = false;

function flushShot() {
  if (currentShot !== null && currentShot.index >= 0) {
    currentShot.env = currentShot.env.trim();
    currentShot.act = currentShot.act.trim();
    shots.push(currentShot);
  }
}

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  // === ЛОКАЦИЯ: название === (номер опционален)
  const loc = trimmed.match(/^===\s*ЛОКАЦИЯ(?:\s*\d+)?\s*:?\s*(.+?)\s*===$/i);
  if (loc) {
    flushShot();
    currentShot = null;
    readingEnv = false;
    readingAct = false;
    currentLocation = loc[1].trim();
    if (!locations.find(l => l.name === currentLocation)) {
      locations.push({ name: currentLocation, shots: [] });
    }
    continue;
  }

  // --- SHOT N ---
  const shotMatch = trimmed.match(/^---\s*SHOT\s*(\d+)\s*---$/i);
  if (shotMatch) {
    flushShot();
    const idx = parseInt(shotMatch[1]);
    currentShot = { index: idx, env: '', act: '' };
    readingEnv = false;
    readingAct = false;
    const le = locations.find(l => l.name === currentLocation);
    if (le && !le.shots.includes(idx)) le.shots.push(idx);
    continue;
  }

  if (currentShot === null) continue;

  // ENV: — блок окружения
  if (trimmed.startsWith('ENV:')) {
    readingEnv = true;
    readingAct = false;
    currentShot.env = trimmed.slice(4).trim();
    continue;
  }

  // ACT: — блок действия
  if (trimmed.startsWith('ACT:')) {
    readingEnv = false;
    readingAct = true;
    currentShot.act = trimmed.slice(4).trim();
    continue;
  }

  // Продолжение многострочного блока
  if (readingEnv) currentShot.env += ' ' + trimmed;
  else if (readingAct) currentShot.act += ' ' + trimmed;
}

flushShot();

// ===== ВЫВОД =====
return [{
  json: { shots, locations, shot_count: shots.length }
}];