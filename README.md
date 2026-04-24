# vkmusic-to-txt-playlist

Инструмент для выгрузки музыки из VK Music и переноса ее в Spotify.

Поддерживает два понятных сценария:

- экспорт VK-плейлистов и `Моя музыка` в TXT формата `Исполнитель - Название`
- импорт такого TXT прямо в Spotify `Liked Songs`

English version: [README.en.md](README.en.md)

## Что внутри

- экспорт обычных плейлистов VK по ссылке
- экспорт раздела `Моя музыка` через цель `my-music`
- attach-режим для уже открытого Chrome/Edge
- fallback через `F12 -> Console`
- валидация TXT
- разбиение больших файлов на части по 500 строк
- поиск совпадений в Spotify и добавление в `Liked Songs`

## Быстрый выбор сценария

### Вариант 1. Через CLI и браузер

Подходит, если хотите “дал ссылку -> получил TXT”.

Обычный плейлист:

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
```

`Моя музыка`:

```bash
npm run export -- --playlist my-music
```

Если уже открыт ваш Chrome/Edge с нужной VK-сессией:

```bash
npm run export -- --browser=chrome --attach --playlist="my-music"
```

### Вариант 2. Через `F12 -> Console`

Подходит, если не хочется attach-режим, отдельные профили браузера или автоматизацию.

1. Откройте нужную страницу в VK.
2. Выведите сниппет:

```bash
node src/cli.js snippet
```

3. Откройте `F12 -> Console`.
4. Если браузер попросит, введите `allow pasting`.
5. Вставьте сниппет и нажмите `Enter`.
6. Дождитесь скачивания TXT.

Этот путь уже проверен на Windows: так был получен файл [Моя музыка.txt](C:/Users/user/Desktop/music-vibe/playlists/%D0%9C%D0%BE%D1%8F%20%D0%BC%D1%83%D0%B7%D1%8B%D0%BA%D0%B0.txt).

## Установка

```bash
npm install
```

## Безопасность

Весь рабочий процесс здесь локальный.

- экспорт из VK выполняется на вашем устройстве
- инструмент либо открывает локальный браузерный контекст на вашей машине, либо вы сами запускаете локальный JS-сниппет через `F12 -> Console`
- attach-режим подключается только к браузеру, который запущен у вас локально
- managed session тоже живет локально в директории `.session/`
- TXT-файлы сохраняются локально у вас в проекте

Что это значит на практике:

- инструмент не требует передавать логин/пароль VK в код или в сторонний сервис
- при сценарии через `F12` вы сами видите и запускаете код в своем браузере
- при сценарии через CLI браузер работает на вашем же устройстве и просто проходит по списку треков

Для Spotify тоже используется ваш собственный контур:

- вы создаете свое приложение в Spotify Developer Dashboard
- используете свой `Client ID`
- авторизация идет через `localhost`:

```text
http://127.0.0.1:43821/spotify/callback
```

- токены сохраняются локально в `.session/spotify.json`

Если не хотите автоматизацию браузера вообще, используйте путь через `F12 -> Console` и ручное открытие Spotify OAuth URL из терминала.

## Работа с TXT

Проверить TXT:

```bash
npm run validate -- --path "./playlists/Моя музыка.txt"
```

Разбить большой файл на части:

```bash
npm run split -- --path "./playlists/Моя музыка.txt" --max-lines 500
```

## Spotify `Liked Songs`

Это односторонний импорт:

- TXT читается построчно
- каждый трек ищется через Spotify Web API
- совпавшие треки добавляются в `Liked Songs`
- уже существующие лайки не удаляются

### Что нужно один раз

1. Создать приложение в Spotify Developer Dashboard.
2. Взять `Client ID`.
3. Добавить redirect URI:

```text
http://127.0.0.1:43821/spotify/callback
```

### Безопасный dry-run

```bash
npm run liked-sync -- --path "./playlists/Моя музыка.txt" --spotify-client-id "YOUR_SPOTIFY_CLIENT_ID" --dry-run --limit 20
```

### Боевой импорт в `Liked Songs`

```bash
npm run liked-sync -- --path "./playlists/Моя музыка.txt" --spotify-client-id "YOUR_SPOTIFY_CLIENT_ID"
```

### Если Spotify OAuth не открылся сам

Команда печатает строку:

```text
Open Spotify authorization if it does not start automatically:
```

Если браузер не открылся автоматически, просто скопируйте выведенный URL и откройте его вручную.

## Команды

### `export`

```bash
npm run export -- --playlist "https://vk.com/music/playlist/123_456_hash"
npm run export -- --playlist "my-music"
```

Параметры:

- `--playlist` — ссылка на плейлист VK или цель `my-music`
- `--browser` — `chrome`, `edge` или `firefox`
- `--out` — путь для сохранения TXT
- `--profile-dir` — директория managed session
- `--executable-path` — путь к бинарнику браузера
- `--attach` — подключение к уже открытому Chrome/Edge через `http://127.0.0.1:9222`
- `--attach-url` — свой remote debugging endpoint
- `--headless` — запуск без видимого окна

### `liked-sync`

```bash
npm run liked-sync -- --path "./playlists/Моя музыка.txt" --spotify-client-id "YOUR_SPOTIFY_CLIENT_ID"
```

Параметры:

- `--path` — TXT-файл формата `Artist - Title`
- `--spotify-client-id` — client id Spotify app
- `--redirect-uri` — redirect URI для OAuth
- `--report` — путь для JSON-отчета
- `--market` — market для Spotify Search, например `US`
- `--limit` — ограничить число строк для пробного прогона
- `--dry-run` — только поиск и отчет, без записи в библиотеку
- `--force-auth` — заново пройти Spotify OAuth

### `validate`

```bash
npm run validate -- --path "./playlists/My Playlist.txt"
```

### `split`

```bash
npm run split -- --path "./playlists/My Playlist.txt" --max-lines 500
```

### `snippet`

```bash
node src/cli.js snippet
```

Печатает актуальный JS-сниппет для `F12 -> Console`.

## Платформы

Текущий статус:

- Windows: основной рабочий сценарий, на нем инструмент реально прогонялся
- macOS: код поддержан, но руками в этой сессии не smoke-тестировался
- Linux: код поддержан, но руками в этой сессии не smoke-тестировался

Что важно по платформам:

- `F12 -> Console` не зависит от ОС и обычно самый переносимый путь
- attach-режим работает только для Chromium-браузеров вроде Chrome и Edge
- Firefox лучше использовать через managed session или `snippet`
- автооткрытие Spotify OAuth зависит от локальной ОС и браузерной конфигурации

## Ограничения

- VK периодически меняет разметку, поэтому парсер может требовать обновлений
- для `Моя музыка` VK может показывать только видимую часть библиотеки и прятать остальное за подпиской
- Spotify-поиск не гарантирует 100% match rate, поэтому после sync смотрите JSON-отчет в `reports/`

## Источники

- Spotify PKCE Flow:
  https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Spotify Save Items to Library:
  https://developer.spotify.com/documentation/web-api/reference/save-library-items
