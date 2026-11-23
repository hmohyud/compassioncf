// A photo an editor chooses is redrawn before it is kept: cut to the shape of the place it goes (so nothing
// around it moves), sized for the page, and saved as a JPEG light enough for the database. Redrawing also
// drops what cameras write into a file (where and when it was taken).
//
// Used by "Edit this page" (bar.js) for a photo put in place of one of the pages' own, and by the editor's
// lists (app.js): a staff member's portrait, and the small picture beside a testimonial.

import { PHOTO_LIMIT } from './session.js';

const LONG_SIDE = 1600;           // pixels on the longer side: enough for a photo across the page on a sharp screen
const PHOTO_BYTES = 300 * 1024;   // what one photo should weigh at most: each visitor's first look at it is read from the database

const asJpeg = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

// shape   the place's width over its height, or a function that finds it (nothing, or 0, for the photo's own shape)
// ax, ay  the part of the photo that is kept when it is too wide or too tall for that shape: 0 is its left or
//         top edge, 1 its right or bottom edge
// shown   how wide the place is on the page, in the page's own pixels
// most    for a place that is small on every screen: the most pixels across the kept picture is ever given
export async function preparePhoto(file, { shape = 0, ax = 0.5, ay = 0.5, shown = 0, most = 0 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('That file isn’t a picture. Choose a JPEG or PNG photo.');
  if (file.size > 40 * 1024 * 1024) throw new Error('That photo is over 40 MB. Choose a smaller file.');
  let picture;
  try {
    picture = await createImageBitmap(file);
  } catch {
    throw new Error('That file couldn’t be read as a photo. Try a JPEG or PNG.');
  }
  const want = (typeof shape === 'function' ? await shape() : shape) || picture.width / picture.height;
  // The part of the new photo that is kept: as much of it as fits the shape.
  let sw = picture.width;
  let sh = picture.height;
  if (sw / sh > want) sw = Math.round(sh * want); else sh = Math.round(sw / want);
  const sx = Math.round((picture.width - sw) * ax);
  const sy = Math.round((picture.height - sh) * ay);
  // Twice the width it is shown at (for sharp screens), within sensible bounds, and never more than the photo has.
  let width = Math.max(2 * shown, want >= 1 ? 1200 : 600);
  width = Math.min(width, sw, want >= 1 ? LONG_SIDE : LONG_SIDE * want, most || Infinity);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let blob = null;
  for (let attempt = 0; attempt < 6 && !(blob && blob.size <= PHOTO_BYTES); attempt++) {
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(width / want));
    ctx.fillStyle = '#fff';   // behind a picture with see-through parts
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(picture, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.74, 0.64]) {
      blob = await asJpeg(canvas, quality);
      if (blob && blob.size <= PHOTO_BYTES) break;
    }
    width *= 0.82;   // if it is still too heavy, the next try is a little smaller
  }
  if (picture.close) picture.close();
  if (!blob) throw new Error('That photo couldn’t be prepared. Try a different file.');
  if (blob.size > PHOTO_LIMIT) throw new Error('That photo is still too large after shrinking. Try a simpler picture.');
  return { blob, width: canvas.width, height: canvas.height };
}
