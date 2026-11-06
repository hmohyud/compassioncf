# compassioncf — redesign concepts

Three design directions for a revamped [compassioncf.com](https://compassioncf.com/), theme **inspirational** (primary) and **optimistic** (secondary).

Live: https://hmohyud.github.io/compassioncf/

| Path | Direction | Hero |
|---|---|---|
| `/` | Chooser page | — |
| `/v1/` | **Dawn**: night sky to sunrise, Fraunces serif | Participant globe |
| `/v2/` | **Morning Paper**: editorial, typographic, warm paper | Typography + rising sun (no globe) |
| `/v3/` | **Bright Horizon**: sky blue, sunshine, coral, bento | Participant globe |

## Structure
- `shared/globe.js`: vanilla Three.js port of the hero globe from `compassion-course-website/src/components/Globe.tsx` (drag to spin, hover/click tooltips, auto-tour). Options: marker/hover colours, max size, cloud opacity.
- `shared/clusters.js`: participant map pre-clustered on a 3° grid (3,898 locations → 487 regions).
- `shared/vendor/`: three.js r182 (minified ES modules, no CDN).
- `shared/site.js`: scroll reveals, count-ups, mobile nav, demo newsletter form.
- `_reference/`: export of the current site and the copy pulled from it (`CONTENT.md`). Not deployed.

No build step. Serve the folder locally with `python -m http.server`.
Deployed by `.github/workflows/deploy.yml` (GitHub Actions → Pages) on every push to `main`.

Programs copy is draft text: the live site loads programs, events and board members from Firestore, so they weren't in the export.
