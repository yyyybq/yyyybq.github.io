# ELE project page

Static project page for **Embodied Last Exam**. The layout follows the
[Spatial-Interactor](https://zju-omniai.github.io/Spatial-Interactor/) page. There is no build step.

```
index.html      page structure
styles.css      styles
data.js         ← edit this: config (links, authors, invite code, BibTeX) + media manifest
app.js          behaviour (scene panel, rollouts, stage player, gallery, lightbox)
assets/
  video/*.mp4   web-encoded clips (H.264, ≤1280 px, faststart, no audio)
  poster/*.webp first-frame posters + sink before/after stills
  media-meta.js clip durations / sizes (generated)
  scene-poster.webp, favicon.svg
```

## Preview locally

```
npx serve .        # or: python -m http.server
```

## Common edits

- **Authors, affiliations, Report and Code links:** set them in `ELE_CONFIG` in `data.js`. A link left empty shows a greyed-out "soon" button.
- **Add a gallery clip:** put `foo.mp4` in `assets/video/` and `foo.webp` in `assets/poster/`, then add `{ title, group, ...V("foo") }` to `ELE_GALLERY`.
- **Rollout views:** each rollout has a `views` array. The first entry is the default.

## Interactive scene embedding

The Home1 viewer (`https://embodied-last-exam.pages.dev/viewer/`) sends
`Content-Security-Policy: frame-ancestors 'self'`, and its session cookie is
`SameSite=Lax`. Because of that, **a page on another domain (for example GitHub Pages) cannot
iframe it**. The page handles this automatically:

- **Hosted on another domain:** the panel shows the scene poster with room hotspots. *Launch scene* copies the invite code and opens the viewer in a new tab.
- **Hosted on `embodied-last-exam.pages.dev`** (deploy these files into that Cloudflare Pages project): *Launch scene* loads the live viewer inline and shows a Fullscreen button.

The second option gives true in-page interaction. It needs no code change.

The invite code appears on the page (`ELE_CONFIG.scene.inviteCode`). Set it to `""` to hide it.
