#!/usr/bin/env bash
# Ставит ACadSharp CLI: Dwg2Dxf + Dwg2Png (PNG с заливками как в AutoCAD).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v dotnet >/dev/null 2>&1; then
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet
  ln -sfn /usr/share/dotnet/dotnet /usr/local/bin/dotnet
fi

install_tool() {
  local name="$1"
  local bin="$2"
  local dest="${3:-/opt/deloresh/$name}"
  local src="$ROOT/tools/$name"
  mkdir -p "$dest"
  cp "$src"/*.csproj "$src"/Program.cs "$dest/"
  (
    cd "$dest"
    dotnet restore
    dotnet publish -c Release -o "$dest/publish" -r linux-x64 --self-contained false
  )
  echo "OK: $dest/publish/$bin"
}

install_tool dwg2dxf Dwg2Dxf /opt/deloresh/dwg2dxf
install_tool dwg2png Dwg2Png /opt/deloresh/dwg2png
