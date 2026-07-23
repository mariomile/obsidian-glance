# Glance

Glance renders standalone web links as rich, Craft-style cards while keeping
the note source as ordinary Markdown.

Part of the marioverse Obsidian plugin suite.

<p align="center">
  <img src="docs/card.png" width="700" alt="Glance — a rendered link card" />
</p>
<p align="center"><em>A standalone link, rendered as a card with favicon, domain, and preview image.</em></p>

## What makes it different

- Source-pure: a raw URL or standard Markdown link stays unchanged.
- Native editing: the card becomes editable Markdown when its line is active.
- Theme-aware: all colors and typography inherit Obsidian theme tokens.
- Local-first: metadata is fetched directly and cached in plugin data.
- Cross-platform: Live Preview and Reading Mode on desktop and mobile.

## Usage

Paste an `http://` or `https://` URL on its own line. Glance fetches Open Graph
metadata and replaces the inactive line with a rich card. Move the cursor into
the line to reveal and edit the original Markdown.

Standard links are supported too:

```markdown
[Obsidian](https://obsidian.md)
```

Inline links inside sentences are intentionally left unchanged.

## Commands

- **Refresh card under cursor**: invalidates metadata for the standalone link
  on the active line and fetches it again.
- **Clear metadata cache**: removes all cached previews.

## Development

```bash
pnpm install
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Privacy

Glance sends a request only to the URL pasted by the user. It does not use a
third-party metadata proxy or analytics service. Sites that block direct
requests fall back to a domain-only card.

## Try it

See it running in the [Obsidianverse sample vault](https://github.com/mariomile/obsidianverse-sample-vault), a small, fictional vault with the whole plugin suite pre-configured.

## License

MIT
