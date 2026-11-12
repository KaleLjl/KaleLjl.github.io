#!/usr/bin/env bash
# 博客一站式脚本，用法见 ./blog.sh（无参数时打印帮助）
cd "$(dirname "$0")"
node scripts/blog.mjs "$@"
