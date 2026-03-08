#!/bin/bash

# Launch Modular HyprCandy GTK4 Layer Shell Dock

echo "🪟 Launching Modular HyprCandy GTK4 Layer Shell Dock"

# Set Wayland backend
export GDK_BACKEND=wayland

# Set display
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"

echo "📊 Display: $WAYLAND_DISPLAY"
echo "🎨 Backend: $GDK_BACKEND"

# Preload GTK4 Layer Shell (required for proper layer shell behavior)
if [ -f "/usr/lib/libgtk4-layer-shell.so" ]; then
    echo "🔗 Preload: /usr/lib/libgtk4-layer-shell.so"
    export LD_PRELOAD="/usr/lib/libgtk4-layer-shell.so:$LD_PRELOAD"
elif [ -f "/usr/lib64/libgtk4-layer-shell.so" ]; then
    echo "🔗 Preload: /usr/lib64/libgtk4-layer-shell.so"
    export LD_PRELOAD="/usr/lib64/libgtk4-layer-shell.so:$LD_PRELOAD"
fi

# Change to script directory
cd "$(dirname "$0")"

# Launch the modular dock
gjs dock-main.js
