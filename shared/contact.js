// The Contact page's form is the foundation's own Jotform, shown in a frame (see "contact" in
// tools/build_pages.py). What the form asks, how it looks, what it says after sending and where its
// messages go are all set at jotform.com.
//
// A frame cannot grow with what is inside it by itself. The form says how tall it is, in messages that
// read "setHeight:<pixels>:<form number>", and this makes the window onto the frame (.jot-clip in
// style.css) that tall, so the form is never cut off and never has to be scrolled inside the page. Its
// height changes with the width of the screen, when it points out a field that was missed, and when it
// gives way to its thank-you note.
//
// Jotform offers a script of its own for this. It is left out on purpose: it would run on this page with
// the page's full rights, and it adds further scripts to the page when the form asks for them. Here the
// form stays inside its frame, and all it can change on this page is how tall that window is and whether
// the top of the form is brought back into view.

const frame = document.querySelector('iframe[data-jotform]');
const clip = document.querySelector('[data-jotform-clip]');

if (frame && clip) {
  const card = frame.closest('.form-card') || clip;
  const alt = document.querySelector('[data-jotform-alt]');
  const BORDER = 1;                       // the form's own border, top and bottom, which the window leaves out
  const SHORTEST = 120, TALLEST = 6000;   // anything outside this is not a form's height
  const WAIT = 12000;                     // how long the form may take before its own address is offered

  // Listened to: this frame only, and only while it is showing a page of jotform.com.
  const JOTFORM = /^https:\/\/([a-z0-9-]+\.)*jotform\.com$/;
  const fromForm = (e) => e.source === frame.contentWindow && JOTFORM.test(e.origin);

  // Brings the top of the form into view if it has gone above the screen. After sending, the visitor is
  // at the foot of a tall form, and the thank-you note appears at its top.
  const reveal = () => {
    const header = document.querySelector('.hdr');
    const under = (header ? header.offsetHeight : 0) + 12;   // the header stays at the top of the screen
    const top = card.getBoundingClientRect().top;
    if (top < under) window.scrollTo({ top: Math.max(0, window.scrollY + top - under) });
  };

  let heard = false;
  window.addEventListener('message', (e) => {
    if (!fromForm(e) || typeof e.data !== 'string') return;
    const [what, value] = e.data.split(':');
    if (what === 'setHeight') {
      const height = Math.round(Number(value));
      if (!(height >= SHORTEST && height <= TALLEST)) return;
      clip.style.height = `${height - 2 * BORDER}px`;
      heard = true;
      if (alt) alt.hidden = true;
    } else if (what === 'scrollIntoView') {
      reveal();
    }
  });

  // A new page in the frame while the visitor is in the form: its thank-you note, or the form again.
  frame.addEventListener('load', () => { if (document.activeElement === frame) reveal(); });

  // No word from the form after a while (a content blocker, or jotform.com out of reach): offer its address.
  if (alt) setTimeout(() => { if (!heard) alt.hidden = false; }, WAIT);
}
