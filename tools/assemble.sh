#!/usr/bin/env bash
# Copies the files that make up the website into a folder to publish: everything in the
# repository except the files only the repository needs (this folder and the GitHub
# workflow; a README.md, should one ever be added, is left out too). Used by
# .github/workflows/deploy.yml, and handy for testing the exact published site locally.
#
#   bash tools/assemble.sh [out-dir]      (default: _site, which git ignores)
set -euo pipefail
cd "$(dirname "$0")/.."

out="${1:-_site}"
rm -rf "$out"
mkdir -p "$out"

# Tracked files plus new ones not yet committed; ignored files (_reference/, _site/) are skipped,
# and so is a file that has been deleted but whose deletion is not committed yet.
git ls-files -z --cached --others --exclude-standard -- . \
    ':!:.github' ':!:.gitignore' ':!:README.md' ':!:tools' \
  | while IFS= read -r -d '' f; do if [ -e "$f" ]; then printf '%s\0' "$f"; fi; done \
  | xargs -0 cp --parents -t "$out"

touch "$out/.nojekyll"                    # GitHub Pages: serve the files as they are
echo "compassioncf.com" > "$out/CNAME"    # GitHub Pages: the site's own domain. Without this
                                          # file in every deploy, Pages drops the custom domain.

echo "Assembled $(find "$out" -type f | wc -l) files in $out"
