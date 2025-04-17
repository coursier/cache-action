#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"
exec ./cs launch ammonite:2.2.0-1-56b4d41 --scala 2.13.3 --jvm 17 -- ./foo.sc
