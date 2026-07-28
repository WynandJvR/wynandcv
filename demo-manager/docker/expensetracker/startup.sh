#!/bin/bash
set -e

# Start virtual display (1280x900, 24-bit color)
export DISPLAY=:99
Xvfb :99 -screen 0 1280x900x24 -ac +extension GLX +render -noreset &
sleep 1

# Configure openbox to remove all window decorations
mkdir -p $HOME/.config/openbox
cat > $HOME/.config/openbox/rc.xml << 'XML'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <applications>
    <application class="*">
      <decor>no</decor>
      <maximized>yes</maximized>
    </application>
  </applications>
</openbox_config>
XML
openbox &
sleep 1

# Start VNC server (no password, shared mode)
x11vnc -display :99 -forever -nopw -rfbport 5900 -shared -xkb \
    -defer 5 \
    -wait 5 \
    -threads \
    -nolookup \
    -noxrecord -noxfixes &
sleep 1

# Start noVNC (WebSocket bridge: port 6080 -> VNC port 5900)
websockify --web=/usr/share/novnc 6080 localhost:5900 &
sleep 1

echo "noVNC ready on port 6080"

# Find and launch the ExpenseTracker JAR
JAR_FILE=$(find /app/target -name "*.jar" -not -name "*-sources.jar" -not -name "*-javadoc.jar" -not -name "original-*" | head -1)

if [ -z "$JAR_FILE" ]; then
    echo "ERROR: No JAR file found in /app/target/"
    ls -la /app/target/
    exit 1
fi

echo "Starting ExpenseTracker: $JAR_FILE"

# Create performance override CSS (disable drop shadows and animations)
cat > /tmp/demo-overrides.css << 'CSS'
* {
    -fx-effect: null !important;
}
.chart-plot-background {
    -fx-background-color: #1e1e2e;
}
CSS

# Launch app in background, then maximize once the window appears
java \
    -Dprism.order=sw \
    -Dglass.platform=gtk \
    -Djava.awt.headless=false \
    -Dprism.lcdtext=false \
    -Dprism.text=t2k \
    -Djavafx.animation.fullspeed=false \
    -Djavafx.animation.pulse=30 \
    -Dprism.dirtyopts=false \
    -Dtessdata.prefix=/usr/share/tesseract-ocr/5/tessdata \
    -jar "$JAR_FILE" &
APP_PID=$!

# Wait for the app window to appear, then maximize it
for i in $(seq 1 30); do
    WID=$(xdotool search --onlyvisible --pid $APP_PID 2>/dev/null | head -1)
    if [ -n "$WID" ]; then
        sleep 0.5
        xdotool windowsize $WID 1280 900
        xdotool windowmove $WID 0 0
        echo "Window maximized"
        break
    fi
    sleep 1
done

wait $APP_PID
