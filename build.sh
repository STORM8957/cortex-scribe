#!/bin/sh
# Builds inkling.html from the modules, in the order listed in src/ORDER.txt.
# (scripts/build.mjs does the same with Node, and also prepares the desktop app.)
cd "$(dirname "$0")/src" && cat $(cat ORDER.txt) > ../inkling.html && echo "built inkling.html"
