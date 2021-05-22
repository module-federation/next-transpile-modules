#!/bin/bash
# Look at how messy this script is :p

NEXT_VERSION="10.2.0"
ROOT=$(pwd)

echo "==================== NPM ===================="
npm --prefix "$ROOT/src/__tests__/__apps__/npm-basic" install "next@$NEXT_VERSION" --save-exact

echo "==================== PNPM ===================="
pnpm --dir "$ROOT/src/__tests__/__apps__/pnpm" install "next@$NEXT_VERSION"

echo "==================== WEBPACK 4 ===================="
yarn --cwd "$ROOT/src/__tests__/__apps__/webpack-4/app" add "next@$NEXT_VERSION"

echo "==================== WEBPACK 4 SYMLINKS ===================="
yarn --cwd "$ROOT/src/__tests__/__apps__/webpack-4-symlinks/app" add "next@$NEXT_VERSION"

echo "==================== YARN WORKSPACES ===================="
yarn --cwd "$ROOT/src/__tests__/__apps__/yarn-workspaces/app" add "next@$NEXT_VERSION"

echo "==================== YARN WORKSPACES SYMLINKS ===================="
yarn --cwd "$ROOT/src/__tests__/__apps__/yarn-workspaces-symlinks/app" add "next@$NEXT_VERSION"
