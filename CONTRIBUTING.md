# Contributing

Thank you for helping improve the KiJi resource repository.

## Feed inclusion rules

- Add feeds to the most specific category file under `feeds/`.
- Prefer stable RSS or Atom URLs.
- Avoid spam, malware, scraping mirrors, or low-quality duplicate sources.
- Include `text`, `title`, `type="rss"`, and `xmlUrl` attributes for feed entries.
- Run `npm test` before opening a pull request.

## Category requests

Open an issue before adding a new top-level category. Existing categories are listed in [README.md](README.md).

## External RSS resources

To suggest a third-party curated list (not an OPML bundle in this repo), add an entry to `metadata/external-resources.json` and the **External RSS resources** table in [README.md](README.md). Prefer stable, actively maintained lists with clear licensing and OPML or feed URLs users can import.

For bulk export from the app database, validation rules, and CI behavior, see the KiJi documentation repo: `docs/resource/kiji-resource-catalog.md`.
