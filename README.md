# vkmusic-to-txt-playlist

CLI-инструмент для выгрузки плейлистов из VK Music в TXT-файлы формата `Исполнитель - Название`, совместимые с импортом в TuneMyMusic и последующим переносом в Spotify.

English version: [README.en.md](README.en.md)

## Что умеет

- работает с `chrome`, `edge` и `firefox`
- хранит отдельные управляемые сессии в `.session/<browser>`
- умеет подключаться к уже открытому Chrome/Edge через remote debugging
- ждет авторизацию в VK, если она нужна
- догружает плейлист целиком
- экспортирует треки в TXT
- проверяет формат экспортированного файла
- делит большие плейлисты на части по 500 треков для free-лимита TuneMyMusic

## Требования

- Node.js 20+
- один из браузеров: Google Chrome, Microsoft Edge или Firefox
- аккаунт VK с доступом к нужному плейлисту

## Установка

```bash
npm install
```

## Быстрый старт

Выгрузить плейлист:

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
```

Для PowerShell на Windows также можно использовать более надежный вариант:

```bash
node src/cli.js export --browser firefox --playlist "https://vk.com/music/playlist/123_456_hash"
```

Если запускаете через `npm run`, для PowerShell лучше писать параметры через `=`:

```bash
npm run export -- --browser=firefox --playlist="https://vk.com/music/playlist/123_456_hash"
```

Использовать уже открытый Chrome или Edge с вашей основной сессией:

```bash
npm run export -- --browser=chrome --attach --playlist="https://vk.com/music/playlist/123_456_hash"
```

Выбрать браузер:

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash" --browser edge
```

Проверить получившийся TXT:

```bash
npm run validate -- --path "./playlists/My Playlist.txt"
```

Разбить большой плейлист на части по 500 треков:

```bash
npm run split -- --path "./playlists/My Playlist.txt" --max-lines 500
```

После этого файл можно загрузить в TuneMyMusic:

1. Откройте `https://www.tunemymusic.com/transfer/text-file-to-spotify`
2. Выберите `Text file`
3. Загрузите экспортированный TXT
4. Укажите Spotify как destination
5. Пройдите авторизацию и запустите перенос

## Команды

### `export`

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash" [--browser chrome] [--out "./playlists/custom.txt"] [--profile-dir "./.session/chrome"] [--executable-path "/path/to/browser"] [--headless]
```

Параметры:

- `--playlist` — ссылка на плейлист VK
- `--browser` — браузер: `chrome`, `edge` или `firefox`
- `--out` — путь для сохранения файла
- `--profile-dir` — путь к директории сессии браузера
- `--executable-path` — путь к исполняемому файлу браузера, если он не найден автоматически
- `--attach` — подключение к уже открытому Chrome/Edge через `http://127.0.0.1:9222`
- `--attach-url` — свой URL remote debugging endpoint
- `--headless` — запуск без видимого окна браузера, если сессия уже авторизована

### `snippet`

```bash
node src/cli.js snippet
```

Печатает актуальный JS-сниппет для вставки в `F12 -> Console`. Это запасной вариант, если не подходит automation-режим.

### `validate`

```bash
npm run validate -- --path "./playlists/My Playlist.txt"
```

Проверяет, что файл состоит из строк формата `Artist - Title` и показывает, превышен ли лимит в 500 треков.

### `split`

```bash
npm run split -- --path "./playlists/My Playlist.txt" --max-lines 500
```

Создает несколько TXT-файлов в отдельной папке, сохраняя исходный порядок треков.

## Примечания

- VK периодически меняет разметку, поэтому парсер может требовать обновлений.
- Для каждого браузера используется своя управляемая сессия в `.session/`, а не живой профиль пользователя.
- Режим `--attach` работает только для Chromium-браузеров вроде Chrome и Edge. Для Firefox используйте managed session или `snippet`.
- В бесплатном тарифе TuneMyMusic действует лимит 500 треков за один перенос.
- Некоторые треки могут потребовать ручной правки названия для лучшего совпадения в Spotify.
