#!/usr/bin/env bash
# Push a clean copy of the current main branch to the friend repo (public):
#   - removes the third-party Don't Look Up copy (public/hero.html, public/assets/, election_rally.js)
#   - home page = intro video, then the student login
#   - ONE new commit on top of friend/main, so none of those files appear in that repo's history
# Usage (from the project root):   bash scripts/ops/push-friend.sh
set -euo pipefail

REMOTE=friend
URL=https://github.com/teamveins2052-ship-it/finealelection.git
WT="$(mktemp -d)/friend-wt"

git remote get-url "$REMOTE" >/dev/null 2>&1 || git remote add "$REMOTE" "$URL"
git fetch -q "$REMOTE"
git worktree add -q --detach "$WT" HEAD
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true; git worktree prune' EXIT

(
  cd "$WT"
  git rm -q -r --ignore-unmatch public/hero.html public/assets public/election_rally.js components/public/dont-look-up-hero.tsx
  cat > app/page.tsx <<'PAGE'
import { Suspense } from "react";
import { IntroLoader } from "@/components/public/intro-loader";
import { LoginFlow } from "@/components/public/login-flow";

/** Home: the intro video (public/intro.mp4) plays full screen, then the student login. */
export default function Home() {
  return (
    <>
      <IntroLoader />
      <Suspense>
        <LoginFlow />
      </Suspense>
    </>
  );
}
PAGE
  git add app/page.tsx
  leftovers=$(git ls-files | grep -cE 'hero\.html|public/assets/|election_rally|dont-look-up' || true)
  secrets=$(git ls-files | grep -cE '\.env\.(local|vercel|bootstrap$|election)|adminsdk|\.xlsx|\.csv' || true)
  [ "$leftovers" = 0 ] && [ "$secrets" = 0 ] || { echo "refusing: leftovers=$leftovers secrets=$secrets"; exit 1; }
  git -c user.name="$(git -C .. config user.name 2>/dev/null || echo tarunuttupulusu)" -c user.email="$(git config user.email)" commit -q -m "snapshot"
)

TREE=$(git -C "$WT" rev-parse 'HEAD^{tree}')
MSG="Update from election@$(git rev-parse --short HEAD): $(git log -1 --format=%s)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
C=$(git commit-tree "$TREE" -p "$REMOTE/main" -m "$MSG")
git push "$REMOTE" "$C:refs/heads/main"
echo "pushed $C to $URL"
