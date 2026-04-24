# vkmusic-to-txt-playlist

Инструмент для переноса музыки из VK в Spotify.

Основной рабочий сценарий:

1. Выгрузить плейлист или `Моя музыка` из VK в TXT
2. При необходимости разбить TXT на части по 500 треков
3. Импортировать через TuneMyMusic — получить Spotify-плейлист
4. Пройти по полученному плейлисту и добавить все треки в `Liked Songs` через браузерную автоматизацию

English version: [README.en.md](README.en.md)

## Что умеет

**Экспорт из VK:**

- обычные плейлисты по ссылке
- раздел `Моя музыка` через цель `my-music`
- attach-режим для уже открытого Chrome/Edge
- fallback через `F12 -> Console`
- валидация и разбиение TXT

**Автоматизация Spotify (браузерная):**

- массовый лайк треков из открытого плейлиста через attach к Chrome
- удаление треков из плейлиста по ходу лайка — плейлист постепенно сжимается, скролл не нужен
- сохранение отчёта с результатами по каждому треку
- повтор для пропущенных треков

## Установка

```bash
npm install
```

## Быстрый старт

### Шаг 1. Выгрузить музыку из VK

Через CLI (откроет браузер сам):

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
npm run export -- --playlist my-music
```

Или через `F12 -> Console` (самый простой способ без автоматизации):

```bash
node src/cli.js snippet
```

Скопировать вывод, открыть нужную страницу VK, открыть `F12 -> Console`, вставить и нажать `Enter`. TXT скачается автоматически.

### Шаг 2. При необходимости разбить TXT

```bash
npm run split -- --path "./playlists/Моя музыка.txt" --max-lines 500
```

### Шаг 3. Импортировать через TuneMyMusic

[tunemymusic.com/transfer/text-file-to-spotify](https://www.tunemymusic.com/transfer/text-file-to-spotify)

Загрузить TXT → выбрать Spotify как цель → получить плейлист.

### Шаг 4. Лайкнуть треки из плейлиста через браузер

Открыть Chrome с remote debugging:

```bash
chrome.exe --remote-debugging-port=9222
```

Открыть нужный Spotify-плейлист в этом браузере. Запустить:

```bash
node src/cli.js spotify-like-attach --remove-from-playlist
```

Инструмент пройдёт по каждому треку, поставит лайк и удалит его из плейлиста. Плейлист постепенно сжимается — никакого скролла, все треки обрабатываются с самого начала списка.

Флаг `--remove-from-playlist` рекомендуется всегда: без него при большом плейлисте придётся бороться с виртуальным скроллом Spotify.

## Команды

### `export`

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
npm run export -- --playlist my-music
```

Параметры:

| Параметр             | Описание                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| `--playlist`         | Ссылка на плейлист VK или `my-music`                                    |
| `--browser`          | `chrome`, `edge` или `firefox` (по умолчанию `chrome`)                  |
| `--out`              | Путь для сохранения TXT                                                 |
| `--profile-dir`      | Директория managed session                                              |
| `--executable-path`  | Путь к бинарнику браузера                                               |
| `--attach`           | Подключиться к уже открытому Chrome/Edge через `http://127.0.0.1:9222`  |
| `--attach-url`       | Свой remote debugging endpoint                                          |
| `--headless`         | Запуск без видимого окна                                                |

### `validate`

```bash
npm run validate -- --path "./playlists/Моя музыка.txt"
```

Проверяет формат TXT и показывает статистику.

### `split`

```bash
npm run split -- --path "./playlists/Моя музыка.txt" --max-lines 500
```

Разбивает большой TXT на части. По умолчанию 500 строк на файл.

### `snippet`

```bash
node src/cli.js snippet
```

Печатает JS-сниппет для ручного запуска через `F12 -> Console` на странице VK.

### `spotify-like-snippet`

```bash
node src/cli.js spotify-like-snippet
```

Печатает JS-сниппет для ручного лайка треков прямо из консоли Spotify (без attach-режима).

### `spotify-like-attach`

```bash
node src/cli.js spotify-like-attach [опции]
```

Подключается к открытому Chrome и ставит лайки на треки из открытого Spotify-плейлиста.

| Параметр                | Описание                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| `--attach-url`          | Remote debugging endpoint (по умолчанию `http://127.0.0.1:9222`)     |
| `--remove-from-playlist` | Удалять трек из плейлиста после лайка — рекомендуется               |
| `--max-new-likes`       | Лимит новых лайков за запуск                                          |
| `--retry-per-row`       | Попыток на трек (по умолчанию 5)                                      |
| `--retry-skipped`       | Повторить пропущенные треки в конце того же запуска                   |
| `--report`              | Путь для сохранения JSON-отчёта                                       |

### `spotify-like-attach-retry`

```bash
node src/cli.js spotify-like-attach-retry --from-report <путь> [опции]
```

Повторяет только треки со статусом `menu-not-found` из предыдущего отчёта.

| Параметр                | Описание                                                |
| ----------------------- | ------------------------------------------------------- |
| `--from-report`         | Путь к JSON-отчёту предыдущего запуска                  |
| `--remove-from-playlist` | Удалять из плейлиста после лайка                       |
| остальные               | Те же что у `spotify-like-attach`                       |

### `liked-sync`

```bash
node src/cli.js liked-sync --path "./playlists/Моя музыка.txt" --spotify-client-id <id>
```

Ищет треки по Spotify API и добавляет в `Liked Songs`. Работает медленно из-за rate limit на поиск — для больших библиотек лучше использовать браузерный вариант.

### `liked-sync-playlist`

```bash
node src/cli.js liked-sync-playlist --playlist <spotify-url|id> --spotify-client-id <id>
```

То же, но берёт треки напрямую из Spotify-плейлиста (без поиска). Может упираться в ограничения Extended Quota Mode для приложений в разработке.

## Отчёты

`spotify-like-attach` сохраняет JSON-отчёт в папку `reports/`. Каждая строка содержит:

- `key` — track ID из Spotify
- `label` — текст строки как он отображается в UI
- `status` — `liked`, `already-liked`, `action-not-found`, `menu-not-found`

По этому отчёту можно запустить повтор через `spotify-like-attach-retry`.

## Безопасность

Весь процесс локальный:

- экспорт из VK выполняется на вашем устройстве
- attach-режим подключается только к браузеру, запущенному у вас локально
- сессии хранятся локально в `.session/`
- TXT и отчёты сохраняются локально в проекте
- инструмент не требует передавать логин/пароль в сторонний сервис

## Платформы

| ОС      | Статус                                   |
| ------- | ---------------------------------------- |
| Windows | основной рабочий сценарий, проверен      |
| macOS   | поддержан в коде                         |
| Linux   | поддержан в коде                         |

Важно:

- `F12 -> Console` не зависит от ОС и работает везде
- attach-режим работает только для Chromium-браузеров (Chrome, Edge)
- Firefox лучше использовать через managed session или `snippet`

## Ограничения

- VK периодически меняет разметку — парсер может требовать обновлений
- для `Моя музыка` VK может показывать только видимую часть библиотеки за подпиской
- бесплатный TuneMyMusic — лимит 500 треков за перенос
- Spotify API в режиме разработки имеет жёсткий rate limit на поиск и может отдавать 403 на некоторые эндпоинты (Extended Quota Mode)
