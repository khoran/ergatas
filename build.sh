#!/bin/bash

inotifywait -e close_write,moved_to,create -m -r  lib public server.js webpack.config.cjs|while read; do clear; webpack    --config webpack.config.cjs ; done
