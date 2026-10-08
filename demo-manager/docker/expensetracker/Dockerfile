# Stage 1: Build the ExpenseTracker from source
FROM debian:bookworm AS builder
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk \
    maven \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone https://github.com/WynandJvR/ExpenseTracker.git .
RUN mvn package -DskipTests -Djavafx.platform=linux

# Stage 2: Runtime image with Liberica JDK Full (includes JavaFX for ARM32)
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies + Liberica JDK Full (bundled JavaFX, ARM32 support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    tesseract-ocr \
    libtesseract-dev \
    libleptonica-dev \
    libpng-dev \
    libjpeg-dev \
    libgtk-3-0 \
    libgtk2.0-0 \
    libgdk-pixbuf2.0-0 \
    libasound2 \
    libxslt1.1 \
    libgl1 \
    libx11-6 \
    libxtst6 \
    libxrender1 \
    curl \
    procps \
    wget \
    openbox \
    xdotool \
    && rm -rf /var/lib/apt/lists/*

# Install Liberica JDK 17 Full (includes JavaFX)
RUN wget -q https://download.bell-sw.com/java/17.0.13+12/bellsoft-jdk17.0.13+12-linux-amd64-full.deb -O /tmp/liberica.deb \
    && apt-get update && apt-get -f install -y \
    && dpkg -i /tmp/liberica.deb \
    && rm /tmp/liberica.deb \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/bellsoft-java17-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"

# Copy built application from builder stage
WORKDIR /app
COPY --from=builder /build/target/ /app/target/
COPY --from=builder /build/pom.xml /app/pom.xml

# Create non-root demo user
RUN useradd -m -s /bin/bash demouser

# Copy startup script and custom noVNC page
COPY startup.sh /startup.sh
COPY vnc_embed.html /usr/share/novnc/vnc_embed.html
RUN chmod +x /startup.sh

# Demo data is generated at container start (seed.py), so it always ends today
RUN apt-get update && apt-get install -y --no-install-recommends python3-minimal     && rm -rf /var/lib/apt/lists/*
COPY seed.py /seed.py
RUN mkdir -p /home/demouser/.expenseTracker     && chown -R demouser:demouser /home/demouser /app

EXPOSE 6080

USER demouser

HEALTHCHECK --interval=3s --timeout=3s --retries=10 \
    CMD curl -f http://localhost:6080/ || exit 1

CMD ["/startup.sh"]
