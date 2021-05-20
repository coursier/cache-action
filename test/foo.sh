#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"
exec ./coursier launch --contrib amm-runner:0.3.2 --scala 2.13.5 -- ./foo.sc
