#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Patching android configuration for AGP 8..."

python3 patch_android.py

echo "Android patches applied successfully!"
