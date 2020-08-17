#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"
exec ./coursier launch --contrib amm-runner:0.3.0 -- ./foo.sc
