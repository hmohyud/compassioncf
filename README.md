# Compassion Course Foundation website

The website at [compassioncf.com](https://compassioncf.com/), in the "Dawn" design: a night sky giving way to sunrise, set in Fraunces and DM Sans. It is a static site served by GitHub Pages. The repository root is the site root.

The old address, https://hmohyud.github.io/compassioncf/, redirects to the domain.

## Pages

| Address | Page |
|---|---|
| `/` | Home, with the participant globe |
| `/about/` | About us |
| `/programs/` | Programs, with `/programs/compassion-course/`, `/programs/course-fund/` and `/programs/archive/` |
| `/events/` | Upcoming events, read live from the foundation's database |
| `/board/` | Board members |
| `/blog/` | Essays, read live; one essay is `/blog/post.html?id=<post id>` |
| `/volunteer/` | Volunteer sign-up form |
| `/contact/` | Contact form |
| `/donate/` | Donate. Stripe also sends donors back here after paying or cancelling |
| `/admin/` | The site editor, for the foundation's admin accounts (see "Editing the site") |
| `404.html` | Shown for any missing address. It also forwards addresses from the previous site |

The program, about and board text comes from the previous compassioncf.com. Headlines and short linking text were written for this design.

## Editing the site

Nothing below needs this repository or a deploy. Changes show for visitors as soon as they are saved.

1. Open [compassioncf.com/admin](https://compassioncf.com/admin/) and sign in with the email and password of a foundation admin account, the same ones the previous admin panel used. "Forgot the password?" sends a reset email.
2. The editor has five tabs:
   - **Essays**: write, edit, publish or unpublish the essays on the Blog page. An essay with "Published" unticked is a draft: it is saved, but the site does not show it.
   - **Events**: add, change or remove events. Past events leave the Events page by themselves.
   - **Inbox**: messages from the Contact page and notes from the Volunteer page, with a reply-by-email button.
   - **Newsletter**: the sign-up list, to copy or download.
   - **Text and photos**: every wording change and swapped photo on the pages, each with a button to put the original back.
3. While signed in, every page of the site shows a bar at the bottom. **Edit this page** outlines the text and labels each photo.
   - **Text**: click any of it and type. **Use the original wording** restores a sentence. A sentence that appears on every page, such as the footer line, is changed everywhere at once.
   - **Photos**: click a photo (or its **Change photo** label) and choose a picture from your computer or phone. It is resized, uploaded and shown in place, with a box to describe it for people who can't see it. Click a swapped photo again to choose another or to **Use the original photo**. A photo used on several pages is swapped on all of them. A new photo is cropped to the same shape as the one it replaces.
   - Press **Save** to publish the changes, or **Cancel** to throw them away.

What "Edit this page" does not change: the menu, the forms, the logo, the numbers beside the globe, and adding or removing whole sections, board members or programs. Those are changes to the code (see below).

## How it is put together

- `index.html`: the home page, written by hand.
- Every other page is written by `tools/build_pages.py` from templates in that file, so they share one header, footer and newsletter block. Change a page there and run `python tools/build_pages.py`; edits made in the built `.html` files are overwritten by the next run. The script also replaces the home page's header and footer so they match.
- `style.css`: all of the site's styles.
- `shared/site.js`: scroll reveals, counting numbers, the mobile menu.
- `shared/globe.js`, `shared/globe-lazy.js`, `shared/clusters.js`, `shared/textures/`, `shared/vendor/`: the participant globe (three.js r182, no CDN). `clusters.js` is the participant map pre-clustered on a 3° grid: 3,898 locations in 487 regions. `globe-lazy.js` mounts the globe only when it nears the viewport.
- `shared/cms.js`: reads essays and events from the foundation's database. Pages opt in with `data-cms="blog-list" | "blog-post" | "events"`. It renders the essays' Markdown safely and shows an empty state if the read fails.
- `shared/forms.js`: sends the contact, volunteer and newsletter forms (`data-form="contact" | "volunteer" | "newsletter"`).
- `shared/donate.js`: the donate dialog that every `[data-donate]` link opens (currency, $25 to $500 presets, custom amount), themed with the `--dn-*` variables in `style.css`.
- `shared/content.js`: loaded by every page. It puts the wording changes and swapped photos editors have saved on top of what is built into the page, and loads the editor's bar in a browser that has signed in.
- `shared/admin/`: the editor. `session.js` signs in and sends database and file-storage requests as the signed-in person, `bar.js` is the bar and click-to-edit on the pages, `app.js` draws the `/admin/` screens, `admin.css` styles both. Visitors never load these.
- `shared/img/`: the logo marks, photographs and the social icon sprite.
- `tools/assemble.sh`: copies the site's files, without the repository-only ones, into a folder to publish.
- `_reference/` (on disk only, ignored by git): an export of the previous site.

## What the site talks to

Everything live runs in the foundation's Firebase project, `compassioncf-web-site`, which the previous site also uses. No keys or secrets are in this repository.

- **Essays and events** are read from the `blogPosts` and `events` collections over Firestore's REST API. Publishing in the editor updates this site without a deploy.
- **Forms** save documents in the shape the previous site wrote, so they appear in the editor's inbox and in the previous admin panel: contact messages in `contactSubmissions`, newsletter sign-ups in `newsletterSubscriptions`. Volunteer notes also go to `contactSubmissions`, with the subject "Volunteer sign-up", because the previous site's own volunteer form wrote to an invalid path and had no working inbox.
- **Donations** call the `createCheckoutSession` function, which returns a Stripe Checkout address. Stripe returns donors to `compassioncf.com/donate` with `?success=true` or `?canceled=true`.
- **The editor** signs in through Firebase Authentication (email and password) with the foundation's existing admin accounts, and reads and writes the same collections with that person's sign-in. An account counts as an editor the way it did in the previous panel: an `admin` claim, or a document `admins/<user id>` with `role: "admin"`. This code only decides what to show; what an account may actually change is decided by the database's rules.
  - Wording changes are kept in one field, `siteText`, of the existing document `content/home`: a JSON object of `{ "<key>": "<html>" }`, where the key is a hash of the sentence as it is written in the page's HTML. If that sentence is later changed in the code, the saved change no longer matches and is dropped. Saved text is stripped to plain inline markup (emphasis, links, line breaks) both when it is saved and when it is shown.
  - Swapped photos are kept the same way in a second field, `siteImages`: `{ "<which photo>": { "src": "<address of the new file>", "alt": "<description>" } }`, where a photo is named by its path in this site (`shared/img/hands.jpg`) or, for a picture the page loads from elsewhere, by its full address. The new file goes to the project's Firebase Storage, in `board-photos/`, the folder the previous admin panel uploads board photos to and so the one its rules are known to accept. Before upload the browser redraws the picture as a JPEG at most 2000 pixels on its longer side, which also removes the camera's location and date notes. The site only ever shows a swapped photo whose address is in that storage.
  - The project's web API key is not in this repository. The sign-in page reads it when someone signs in from `https://compassioncf-web-site.web.app/__/firebase/init.js`, so sign-in needs the previous site to stay up at that address.
- **The previous admin panel** still works on the same data at https://compassioncf-web-site.web.app/admin. Its board, programs and home-content sections edit records this site does not read.

## Security, in short

- The site is static files, so there is no server of ours to break into. The editor's code is public and holds no secrets.
- Firebase Authentication checks the sign-in. What a signed-in account may read or change is decided by the security rules of the Firebase project (Firestore and Storage), not by this code. **Those rules are the lock.** Nobody working on this repository has seen them; have them reviewed, and again whenever the editor learns to do something new.
- Checked from outside on 15 November 2026: someone who is not signed in is refused the inbox (`contactSubmissions`), the mailing list (`newsletterSubscriptions`) and the admin list (`admins`).
- Anything the public types into a form is shown in the editor as plain text, never as markup, and the newsletter download leaves out whatever is not a plain email address. Wording and photos saved by editors are filtered again when visitors' pages show them, so a stolen editor login could change content but could not run code in visitors' browsers.
- The editor does not start inside a frame on another page.
- When someone signs in, the editor loads one small settings file from the previous site (see above). Whoever controls that Firebase project controls that file.
- What only people can do: use a strong password that is used nowhere else (password sign-in has no second step); sign out on a shared computer, because a browser stays signed in until then; and turn on two-step verification for the GitHub account (it controls the site's code), for Directnic (the domain) and for the Google account that owns the Firebase project.

## Working on it

Serve the folder and open http://localhost:8765/:

```bash
python -m http.server 8765
```

Pushing to `main` runs `.github/workflows/deploy.yml`, which publishes the output of `tools/assemble.sh` to the `gh-pages` branch. GitHub Pages serves that branch.

## The domain

The domain was pointed at this site on 14 November 2026.

- **GitHub Pages** serves it as a custom domain. `tools/assemble.sh` writes the `CNAME` file Pages needs into every deploy; without it Pages drops the domain.
- **DNS** is hosted at Directnic, where the domain is registered (nameservers `ns0` to `ns3.directnic.com`). The records there:
  - four `A` records for the bare domain: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (GitHub Pages)
  - a `CNAME` from `www` to `hmohyud.github.io`
  - five `MX` records for Google mail, and two `TXT` records carried over from the previous setup
- Directnic serves these with a one-day caching time, so a change to them takes up to a day to reach everyone.
- **To go back to the previous site**, replace the four `A` records with a single one for `199.36.158.100` (Firebase Hosting, where the previous site still runs).

`compassioncf.com/admin` is now this site's editor, and inner addresses of the previous panel (`/admin/…`) forward to it. The previous panel is at the `web.app` address above.
