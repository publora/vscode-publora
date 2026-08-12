# Publora for VS Code

Select the text, run one command, and it goes out. This extension sends the selection, or the whole file, to [Publora](https://publora.com?utm_source=vscode&utm_medium=extension) as a scheduled post or a draft.

Ten networks: LinkedIn, X, Instagram, Threads, TikTok, YouTube, Facebook, Bluesky, Mastodon and Telegram.

The obvious use: you finish a release, the changelog is already open in the editor, and the announcement goes out without opening a browser.

## Commands

| Command | What it does |
|---|---|
| **Publora: Send selection** | Sends the selected text. With nothing selected, sends the whole file. |
| **Publora: Send this file** | Sends the whole file regardless of the selection. |

After the command you pick the channels, then choose between a draft and a scheduled time.

## Setup

1. Create a Publora account at [publora.com](https://publora.com?utm_source=vscode&utm_medium=extension). The free plan is 15 posts a month and three connected accounts, no card needed.
2. Connect at least one social account in the Publora dashboard. The extension publishes to accounts connected there; it cannot connect them for you.
3. Open [Settings → API keys](https://app.publora.com/dashboard/api?utm_source=vscode&utm_medium=extension), press Generate API key.
4. In VS Code, open Settings, search for `publora.apiKey`, and paste it.

## Things worth knowing

**Drafts are offered first.** Choosing "Save as draft" publishes nothing: the post waits in Publora until you look at it.

**Instagram, TikTok and YouTube need media.** They reject text-only posts, and this version sends text only. The extension says so rather than failing quietly.

**Your key stays in your settings.** It is sent only to `https://api.publora.com` in a request header. The extension talks to no other host, reads no other files, and stores nothing.

## Licence

MIT
