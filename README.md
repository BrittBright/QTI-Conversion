# QTI Word Studio

A browser-only converter for Canvas QTI 1.2 packages and structured Microsoft Word documents.

The interface uses Brightpoint Community College's published brand palette and institutional logo. Confirm final branding approval before public release outside the college.

## Privacy

Files are processed entirely in the browser. The app has no server, database, analytics, authentication, or upload endpoint.

## Version 1 scope

QTI-to-Word export options:

- Blank exam: clean student copy without answers or converter markers
- Answer key: clean instructor copy with correct responses marked
- Editable re-upload file: structured copy that preserves converter markers, question types, points, and feedback

Supported question types:

- Multiple choice
- Multiple answer
- True/False
- Essay
- Short answer
- Text-only directions
- Points and general feedback

Question groups, bank references, unknown question types, media, and complex mathematics are flagged for review.

## Run locally

Open `index.html` in a modern browser. The bundled JSZip dependency allows the converter to work without an internet connection.

## Publish with GitHub Pages

1. Create a new repository.
2. Upload the contents of this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. Save and wait for the HTTPS Pages URL.

## Embed in Canvas

In the Canvas HTML editor, use:

```html
<iframe
  title="QTI Word Studio"
  src="https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/"
  width="100%"
  height="1100"
  style="border: 1px solid #c7d2da; border-radius: 8px;"
  loading="lazy"
  allow="clipboard-write">
</iframe>
```

If Canvas removes the iframe or the page is blocked, the GitHub Pages domain must be added to the institution's Canvas iframe allowlist. A normal external link will still work without an iframe.

## Test protocol

1. Export a small quiz from Canvas as QTI.
2. Convert it to Word and verify every stem, option, key, point value, and feedback field.
3. Convert the resulting Word file back to QTI.
4. Import the package into an unpublished Canvas sandbox quiz.
5. Verify it in Build and Student Preview before publishing.

Do not treat a successful import as proof that every field converted correctly.
