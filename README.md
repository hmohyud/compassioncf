# compassioncf — redesign concepts

Five design directions for a revamped [compassioncf.com](https://compassioncf.com/), theme **inspirational** (primary) and **optimistic** (secondary).

Live: https://hmohyud.github.io/compassioncf/

| Path | Direction | Hero |
|---|---|---|
| `/` | Chooser page | — |
| `/v1/` | **Dawn**: night sky to sunrise, Fraunces serif | Participant globe |
| `/v2/` | **Morning Paper**: editorial, typographic, warm paper | Typography + rising sun (no globe) |
| `/v3/` | **Bright Horizon**: sky blue, sunshine, coral, bento | Participant globe |
| `/v4/` | **Meridian**: premium editorial, ivory, ink and gold | Full-screen sunrise video (no globe) |
| `/v5/` | **Kindred**: Meridian's polish with a people focus, terracotta and cream | Full-screen people montage video (no globe) |

## Structure
- `shared/globe.js`: vanilla Three.js port of the hero globe from `compassion-course-website/src/components/Globe.tsx` (drag to spin, hover/click tooltips, auto-tour). Options: marker/hover colours, max size, cloud opacity.
- `shared/clusters.js`: participant map pre-clustered on a 3° grid (3,898 locations → 487 regions).
- `shared/vendor/`: three.js r182 (minified ES modules, no CDN).
- `shared/video-hero.js`: hero video loader used by v4 and v5 (sources set via `data-webm` / `data-mp4` / `data-mobile`).
- `shared/video/people-*`: v5 hero, an 18.5 s montage of three Pexels clips (sunset gathering, friends in a circle, group hug), colour-matched, crossfaded: WebM 1.5 MB, MP4 2.2 MB, phone crop 1.0 MB.
- `shared/video/`: v4 hero loop (Pexels, free license), 20 s at 24 fps: 1280×720 WebM VP9 (1.6 MB), MP4 H.264 fallback (2.1 MB), 540×960 phone crop (1.1 MB), plus posters. the loader attaches it only after page load, skips it for reduced-motion and Save-Data users, and pauses it off-screen.
- `shared/site.js`: scroll reveals, count-ups, mobile nav, demo newsletter form.
- `_reference/`: export of the current site and the copy pulled from it (`CONTENT.md`). Not deployed.

No build step. Serve the folder locally with `python -m http.server`.
Deployed by `.github/workflows/deploy.yml` (GitHub Actions → Pages) on every push to `main`.

Programs copy is draft text: the live site loads programs, events and board members from Firestore, so they weren't in the export.
