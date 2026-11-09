# compassioncf — redesign concepts

Five design directions for a revamped [compassioncf.com](https://compassioncf.com/), theme **inspirational** (primary) and **optimistic** (secondary).

Live: https://hmohyud.github.io/compassioncf/

| Path | Direction | Hero | Globe |
|---|---|---|---|
| `/` | Chooser page | — | — |
| `/v1/` | **Dawn**: night sky to sunrise, Fraunces serif. The only direction with full sub-pages | Participant globe | In the hero, and on the Compassion Course page |
| `/v2/` | **Morning Paper**: editorial, typographic, warm paper | Typography + rising sun | Section II, "Where we are" |
| `/v3/` | **Bright Horizon**: sky blue, sunshine, coral, bento | Participant globe | In the hero |
| `/v4/` | **Meridian**: premium editorial, ivory, ink and gold | Full-screen sunrise video | "Our Reach" section after the mission |
| `/v5/` | **Kindred**: Meridian's polish with a people focus, terracotta and cream | Full-screen people montage video | Under the people mosaic |

## Structure
- `v1/` sub-pages (Dawn), each a folder with an `index.html` that shares `v1/style.css`:
  - `about/`
  - `programs/`, with `compassion-course/`, `course-fund/` and `archive/` (copy from compassioncf.com's program pages)
  - `events/`
  - `board/`
  - `blog/`, with `blog/post.html?id=<post id>`
  - `volunteer/`
  - `contact/`

  The header, footer and newsletter markup is repeated on every page, so change it everywhere at once. The volunteer and contact forms are demo forms, like the newsletter.
- `shared/globe.js`: vanilla Three.js port of the hero globe from `compassion-course-website/src/components/Globe.tsx` (drag to spin, hover/click tooltips, auto-tour). Options: marker/hover colours, max size, cloud opacity.
- `shared/globe-lazy.js`: mounts the globe only when it nears the viewport (v2, v4, v5), so three.js and the textures aren't downloaded until the reader scrolls toward it.
- `shared/clusters.js`: participant map pre-clustered on a 3° grid (3,898 locations → 487 regions).
- `shared/vendor/`: three.js r182 (minified ES modules, no CDN).
- `shared/video-hero.js`: hero video loader used by v4 and v5 (sources set via `data-webm` / `data-mp4` / `data-mobile`).
- `shared/video/people-*`: v5 hero, an 18.5 s montage of three Pexels clips (sunset gathering, friends in a circle, group hug), colour-matched, crossfaded: WebM 1.5 MB, MP4 2.2 MB, phone crop 1.0 MB.
- `shared/video/`: v4 hero loop (Pexels, free license), 20 s at 24 fps: 1280×720 WebM VP9 (1.6 MB), MP4 H.264 fallback (2.1 MB), 540×960 phone crop (1.1 MB), plus posters. the loader attaches it only after page load, skips it for reduced-motion and Save-Data users, and pauses it off-screen.
- `shared/site.js`: scroll reveals, count-ups, mobile nav, demo newsletter form.
- `shared/cms.js`: reads the foundation's public Firestore collections (`blogPosts`, `events`) over the REST API with no key, the same data compassioncf.com shows, so new essays and events appear without editing this site. Pages opt in with `data-cms="blog-list" | "blog-post" | "events"`; it renders the posts' Markdown safely, and falls back to an empty state or a compassioncf.com link if the read fails. Dawn's home page shows the latest three essays this way.
- `shared/donate.js`: the donate dialog every `[data-donate]` link opens (currency, $25–$500 presets, custom amount), themed per version with `--dn-*` variables. "Donate" calls the same Firebase function as compassioncf.com/donate (`createCheckoutSession` on `compassioncf-web-site`) and goes to the Stripe checkout page it returns; if that call fails, it offers the compassioncf.com donate page instead.
- `_reference/`: export of the current site and the copy pulled from it (`CONTENT.md`). Not deployed.

No build step. Serve the folder locally with `python -m http.server`.
Deployed by `.github/workflows/deploy.yml` (GitHub Actions → Pages) on every push to `main`.

Programs copy in v2–v5 is draft text: the live site loads programs, events and board members from Firestore, so they weren't in the export. Dawn's program, about and board pages use the live site's copy.
